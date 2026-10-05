import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { Type } from 'typebox';
import { Check } from 'typebox/value';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { registerDexterTools } from './extension.js';
import { registerDesignerTools } from './designer.js';
import { registerBoardTools } from './board.js';
import { registerFileTools, workspacePath } from './mcp-files.js';
import { packageRoot, verifySkillIntegrity } from './resources.js';
import { redact, redactedJson } from './process.js';
/** One server is bound to one operator-selected workspace, on the server host. */
export async function createDeusServer(workspace) {
    if (!isAbsolute(workspace))
        throw new Error('--workspace must be absolute');
    const cwd = await realpath(workspace);
    if (!(await stat(cwd)).isDirectory())
        throw new Error('Workspace must be a directory');
    await verifySkillIntegrity();
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(packageRoot, 'skills.lock.json'), 'utf8'));
    const skillPaths = new Map(lock.entries.map(({ output }) => [output.split('/')[1], output]));
    const kernel = await readFile(join(packageRoot, 'prompts/kernel.md'), 'utf8');
    const tools = new Map();
    const registry = {
        registerTool(tool) {
            tools.set(tool.name, tool);
        },
    };
    registerDexterTools(registry);
    registerDesignerTools(registry);
    registerBoardTools(registry);
    registerFileTools(registry);
    registry.registerTool({
        name: 'deus_workspace_info',
        label: 'Remote workspace',
        description: 'Identify the server workspace and available Deus skills. All paths in Deus tools refer to this host, never to the Codex client.',
        parameters: Type.Object({}),
        async execute() {
            return {
                content: [
                    { type: 'text', text: redactedJson({ workspace: cwd, skills: [...skillPaths.keys()] }) },
                ],
                details: {},
            };
        },
    });
    registry.registerTool({
        name: 'deus_skill_read',
        label: 'Read Deus workflow',
        description: 'Load one original Deus skill before its workflow. On remote workspaces use artifact tools for filesystem evidence and durable reports; the original design, board, Dexter and research tools retain their contracts.',
        parameters: Type.Object({
            name: Type.Union([...skillPaths.keys()].map((name) => Type.Literal(name))),
        }),
        async execute(_id, p) {
            await verifySkillIntegrity();
            const path = skillPaths.get(p.name);
            if (!path)
                throw new Error('Unknown skill');
            return {
                content: [{ type: 'text', text: await readFile(join(packageRoot, path), 'utf8') }],
                details: {},
            };
        },
    });
    const server = new Server({ name: 'deus', version: manifest.version }, {
        capabilities: { tools: {} },
        instructions: `Deus runs on the Dexter host. Call deus_workspace_info, then deus_skill_read for the relevant workflow. All workspace/path arguments refer to the server. Use the returned workspace exactly. Use artifact tools for remote code inspection and report/handoff writes; use design tools for designs. Never automatically replay an interrupted mutation.\n\n${kernel}\n\nCalls run in the foreground. Cancellation or disconnection aborts running commands; their outcome may be uncertain. Reconnect and inspect live state. Pi research runs on this host with its configured provider credentials, independently of the Codex model.`,
    });
    const stop = new AbortController();
    let pending = Promise.resolve();
    server.onclose = () => stop.abort();
    const readOnly = new Set([
        'deus_workspace_info',
        'deus_skill_read',
        'deus_design_check',
        'deus_board_live',
        'deus_board_plan',
        'deus_artifact_list',
        'deus_artifact_read',
    ]);
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [...tools.values()].map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: {
                ...tool.parameters,
                type: 'object',
                additionalProperties: false,
            },
            annotations: {
                readOnlyHint: readOnly.has(tool.name),
                destructiveHint: !readOnly.has(tool.name),
                idempotentHint: readOnly.has(tool.name),
                openWorldHint: true,
            },
        })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        const execute = async () => {
            const signal = AbortSignal.any([extra.signal, stop.signal]);
            try {
                signal.throwIfAborted();
                const tool = tools.get(request.params.name);
                if (!tool)
                    throw new Error('Unknown Deus tool');
                const args = request.params.arguments ?? {};
                if (!Check({ ...tool.parameters, additionalProperties: false }, args))
                    throw new Error('Invalid tool arguments');
                if ('workspace' in args && args.workspace !== cwd)
                    throw new Error('workspace must equal the configured server workspace');
                if (tool.name.startsWith('deus_design_'))
                    await workspacePath(cwd, String(args.path), true);
                if (tool.name.startsWith('deus_board_')) {
                    // The existing board adapter reads these paths directly. Reject link escapes first.
                    for (const dir of ['forge', 'forge/issues', 'forge/.claims', 'forge/.candidates']) {
                        await workspacePath(cwd, dir, true);
                        const names = await readdir(join(cwd, dir)).catch((error) => {
                            if (error.code === 'ENOENT')
                                return [];
                            throw error;
                        });
                        for (const name of names)
                            await workspacePath(cwd, join(dir, name));
                    }
                }
                const result = await tool.execute(String(extra.requestId), args, signal, undefined, {
                    cwd,
                });
                return { content: result.content };
            }
            catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: 'text',
                            text: redact(error instanceof Error ? error.message : String(error)),
                        },
                    ],
                };
            }
        };
        // Serialize this connection to avoid overlapping mutations.
        const result = pending.then(execute);
        pending = result.then(() => { }, () => { });
        return result;
    });
    return {
        server,
        workspace: cwd,
        async close() {
            stop.abort();
            await server.close();
            await pending;
        },
    };
}
