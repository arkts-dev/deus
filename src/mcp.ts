import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { Type } from 'typebox';
import { Check } from 'typebox/value';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { registerDexterTools } from './extension.js';
import { designPath, registerDesignerTools } from './designer.js';
import { registerBoardTools } from './board.js';
import { artifactPath, registerFileTools, workspacePath } from './mcp-files.js';
import { packageRoot, verifySkillIntegrity } from './resources.js';
import { redact, jsonResult, textResult } from './process.js';
import { readOnly, type DeusTool, type ToolRegistrar } from './tool-registry.js';

/** One server is bound to one operator-selected workspace, on the server host. */
export async function createDeusServer(workspace: string) {
  if (!isAbsolute(workspace)) throw new Error('--workspace must be absolute');
  const cwd = await realpath(workspace);
  if (!(await stat(cwd)).isDirectory()) throw new Error('Workspace must be a directory');
  await verifySkillIntegrity();
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(packageRoot, 'skills.lock.json'), 'utf8')) as {
    entries: { output: string }[];
  };
  const skillPaths = new Map(lock.entries.map(({ output }) => [output.split('/')[1]!, output]));
  const kernel = await readFile(join(packageRoot, 'prompts/kernel.md'), 'utf8');
  const tools = new Map<string, DeusTool>();
  const registry: ToolRegistrar = {
    registerTool(tool) {
      if (tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
      tools.set(tool.name, tool);
    },
  };
  registerDexterTools(registry);
  registerDesignerTools(registry);
  registerBoardTools(registry);
  registerFileTools(registry);
  registry.registerTool({
    name: 'deus_workspace_info',
    annotations: readOnly,
    label: 'Remote workspace',
    description:
      'Identify the server workspace and available Deus skills. All paths in Deus tools refer to this host, never to the Codex client.',
    parameters: Type.Object({}),
    async execute() {
      return jsonResult({ workspace: cwd, skills: [...skillPaths.keys()] });
    },
  });
  registry.registerTool({
    name: 'deus_skill_read',
    annotations: readOnly,
    label: 'Read Deus workflow',
    description:
      'Load one original Deus skill before its workflow. On remote workspaces use artifact tools for filesystem evidence and durable reports; the original design, board, Dexter and research tools retain their contracts.',
    parameters: Type.Object({
      name: Type.Union([...skillPaths.keys()].map((name) => Type.Literal(name))),
    }),
    async execute(_id, p) {
      await verifySkillIntegrity();
      const path = skillPaths.get(p.name);
      if (!path) throw new Error('Unknown skill');
      return textResult(await readFile(join(packageRoot, path), 'utf8'));
    },
  });
  const server = new Server(
    { name: 'deus', version: manifest.version },
    {
      capabilities: { tools: {} },
      instructions: `Deus runs on the Dexter host. Call deus_workspace_info, then deus_skill_read for the relevant workflow. All workspace/path arguments refer to the server. Use the returned workspace exactly. Use artifact tools for remote code inspection and report/handoff writes; use design tools for designs. Never automatically replay an interrupted mutation.\n\n${kernel}\n\nCalls run in the foreground. Cancellation or disconnection aborts running commands; their outcome may be uncertain. Reconnect and inspect live state. Pi research runs on this host with its configured provider credentials, independently of the Codex model.`,
    },
  );
  const stop = new AbortController();
  let pending = Promise.resolve();
  server.onclose = () => stop.abort();
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...tools.values()].map((tool): Tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        ...tool.parameters,
        type: 'object',
        additionalProperties: false,
      } as Tool['inputSchema'],
      annotations: tool.annotations ?? {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
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
        if (!tool) throw new Error('Unknown Deus tool');
        const args = request.params.arguments ?? {};
        if (!Check({ ...tool.parameters, additionalProperties: false }, args))
          throw new Error('Invalid tool arguments');
        if ('workspace' in args && args.workspace !== cwd)
          throw new Error('workspace must equal the configured server workspace');
        if (tool.name.startsWith('deus_design_')) {
          const { rel } = designPath(cwd, String(args.path));
          artifactPath(rel);
          await workspacePath(cwd, rel, true);
          args.path = rel;
        }
        if (
          [
            'deus_dexter_issues_live',
            'deus_dexter_issues_plan',
            'deus_dexter_issue_close',
          ].includes(tool.name)
        ) {
          // The existing board adapter reads these paths directly. Reject link escapes first.
          for (const dir of ['forge', 'forge/issues', 'forge/.claims', 'forge/.candidates']) {
            await workspacePath(cwd, dir, true);
            const names = await readdir(join(cwd, dir)).catch((error: NodeJS.ErrnoException) => {
              if (error.code === 'ENOENT') return [];
              throw error;
            });
            for (const name of names) await workspacePath(cwd, join(dir, name));
          }
        }
        signal.throwIfAborted();
        const result = await tool.execute(String(extra.requestId), args, signal, undefined, {
          cwd,
        });
        return { content: result.content };
      } catch (error) {
        return {
          isError: true,
          content: textResult(redact(error instanceof Error ? error.message : String(error)))
            .content,
        };
      }
    };
    // Serialize this connection to avoid overlapping mutations.
    const result = pending.then(execute);
    pending = result.then(
      () => {},
      () => {},
    );
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
