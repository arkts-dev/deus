import { Type } from 'typebox';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DexterPlugin, COMMANDS } from './dexter.js';
import { redactedJson } from './process.js';
import { packageRoot } from './resources.js';
import { researchWeb, webConfigFromEnv } from './research.js';
const output = (value) => ({
    content: [{ type: 'text', text: redactedJson(value, 2) }],
    details: {},
});
export default function extension(pi) {
    const clients = new Map();
    const dexter = (cwd) => {
        const executable = process.env.DEXTER_BIN || 'dexter';
        const key = JSON.stringify([executable, cwd]);
        let client = clients.get(key);
        if (!client) {
            client = new DexterPlugin(executable, cwd);
            clients.set(key, client);
        }
        return client;
    };
    pi.on('before_agent_start', async (event) => ({
        systemPrompt: event.systemPrompt +
            '\n\n' +
            (await readFile(join(packageRoot, 'prompts/kernel.md'), 'utf8')),
    }));
    pi.registerTool({
        name: 'deus_dexter_probe',
        label: 'Probe Dexter',
        description: 'Inspect the pinned Dexter CLI version and command help fingerprints. Returns raw diagnostics.',
        parameters: Type.Object({}),
        async execute(_id, _p, signal, _update, ctx) {
            return output(await dexter(ctx.cwd).probe(signal));
        },
    });
    pi.registerTool({
        name: 'deus_dexter_exec',
        label: 'Execute Dexter command',
        description: 'Execute exactly one Dexter command with argv and an explicit absolute workspace. No retries.',
        parameters: Type.Object({
            command: Type.Union(COMMANDS.map((command) => Type.Literal(command))),
            args: Type.Array(Type.String()),
            workspace: Type.String(),
        }),
        async execute(_id, p, signal, _update, ctx) {
            return output(await dexter(ctx.cwd).exec(p.command, p.args, p.workspace, signal));
        },
    });
    pi.registerTool({
        name: 'deus_research_web',
        label: 'Research public web',
        description: 'Run one foreground isolated public web research session with source receipts and bounded requests.',
        parameters: Type.Object({
            question: Type.String(),
            provider: Type.Optional(Type.Union(['exa', 'searxng', 'brave', 'tavily', 'fetch'].map((x) => Type.Literal(x)))),
        }),
        async execute(_id, p, signal) {
            const config = webConfigFromEnv();
            if (p.provider)
                config.searchProvider = p.provider;
            return output(await researchWeb(p.question, config, undefined, signal));
        },
    });
}
