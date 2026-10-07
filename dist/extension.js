import { readOnly } from './tool-registry.js';
import { Type } from 'typebox';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DexterPlugin } from './dexter.js';
import { ArtifactReader, SECTIONS } from './artifacts.js';
import { botsLive, EventReader } from './operations.js';
import { jsonResult as output } from './process.js';
import { packageRoot } from './resources.js';
import { researchWeb, webConfigFromEnv } from './research.js';
export function registerDexterTools(pi) {
    const clients = new Map();
    const dexter = (cwd) => {
        const executable = process.env.DEXTER_BIN || 'dexter';
        const key = JSON.stringify([executable, cwd]);
        if (!clients.has(key))
            clients.set(key, new DexterPlugin(executable, cwd));
        return clients.get(key);
    };
    function mutation(name, description, parameters, execute) {
        pi.registerTool({
            name: `deus_dexter_${name}`,
            label: name.replaceAll('_', ' '),
            description: `${description} Verified CLI; compact mutation receipt; never retries.`,
            parameters,
            async execute(_id, p, signal, _update, ctx) {
                return output(await execute(dexter(ctx.cwd), p, signal));
            },
        });
    }
    pi.registerTool({
        name: 'deus_dexter_probe',
        annotations: readOnly,
        label: 'Probe Dexter',
        description: 'Inspect the installed Dexter CLI and verify its commit signature. Returns raw diagnostics.',
        parameters: Type.Object({}),
        async execute(_id, _p, signal, _update, ctx) {
            return output(await dexter(ctx.cwd).probe(signal));
        },
    });
    const workspace = Type.String({ description: 'Absolute Dexter workspace path' });
    const issue = Type.String({ pattern: '^ISSUE-\\d+$' });
    const priority = Type.Integer({ minimum: 1, maximum: 4 });
    const submission = { workspace, title: Type.String({ minLength: 1 }), body: Type.String() };
    mutation('submit', 'Submit an objective through the verified CLI.', Type.Object(submission), (c, p, s) => c.submit(p, s));
    mutation('issue_create', 'Create a task through the verified CLI.', Type.Object({
        ...submission,
        parent: Type.Optional(issue),
        dependencies: Type.Optional(Type.Array(issue)),
        priority: Type.Optional(priority),
    }), (c, p, s) => c.createIssue(p, s));
    mutation('issue_nudge', 'Restart a blocked issue from valid state.', Type.Object({ workspace, issue }), (c, p, s) => c.nudgeIssue(p, s));
    mutation('issue_reprioritize', 'Set priority (1 highest, 4 lowest).', Type.Object({ workspace, issue, priority }), (c, p, s) => c.reprioritizeIssue(p, s));
    mutation('issue_relink', 'Change parent/dependencies; omitted parent stays unchanged, null clears it.', Type.Object({
        workspace,
        issue,
        parent: Type.Optional(Type.Union([issue, Type.Null()])),
        addDependencies: Type.Optional(Type.Array(issue)),
        removeDependencies: Type.Optional(Type.Array(issue)),
    }), (c, p, s) => c.relinkIssue(p, s));
    mutation('architecture_accept', 'Accept and promote a rejected architecture candidate.', Type.Object({
        workspace,
        issue,
        candidate: Type.String({ pattern: '^AC-\\d+$' }),
        reason: Type.String({ minLength: 1 }),
    }), (c, p, s) => c.acceptArchitecture(p, s));
    pi.registerTool({
        name: 'deus_dexter_bots_live',
        annotations: readOnly,
        label: 'Live bot ownership',
        description: 'Read working bots (including stale owners), issue/MR/run targets and correlated claims. Local PID or remote heartbeat liveness; cooldown is a persisted-config policy estimate, not observed worker configuration. Read-only, no CLI.',
        parameters: Type.Object({ workspace }),
        async execute(_id, p) {
            return output(await botsLive(p.workspace));
        },
    });
    const events = new EventReader();
    pi.registerTool({
        name: 'deus_dexter_events_read',
        annotations: readOnly,
        label: 'Read recent events',
        description: 'Read local bus summaries newest first, then older pages using a path-free cursor. Default 20, maximum 100 events and 16 KiB summary bytes per page; no bodies. Appends do not disrupt continuation; cursors expire on reload. Read-only, no CLI.',
        parameters: Type.Object({
            workspace,
            cursor: Type.Optional(Type.Union([Type.String({ maxLength: 2048 }), Type.Null()])),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        }),
        async execute(_id, p) {
            return output(await events.read(p));
        },
    });
    const reader = new ArtifactReader();
    for (const kind of ['issue', 'mr', 'wiki', 'run']) {
        const idField = kind === 'wiki' ? 'slug' : kind;
        pi.registerTool({
            name: `deus_dexter_${kind}_read`,
            annotations: readOnly,
            label: `Read ${kind}`,
            description: `Read one local ${kind} section without CLI execution. Default: ${kind === 'run' ? 'metadata' : 'summary (metadata/body)'}, not history. limit: UTF-8 bytes, default 4096, max 16384. Cursors expire on reload and reject changed content. Run transcript is stdout, not the Pi session dump.`,
            parameters: Type.Object({
                workspace,
                [idField]: Type.String(),
                section: Type.Optional(Type.Union(SECTIONS[kind].map((section) => Type.Literal(section)))),
                cursor: Type.Optional(Type.Union([Type.String({ maxLength: 2048 }), Type.Null()])),
                limit: Type.Optional(Type.Integer({ minimum: 4, maximum: 16384 })),
            }),
            async execute(_id, p) {
                return output(await reader.read(kind, {
                    workspace: p.workspace,
                    id: p[idField],
                    section: p.section,
                    cursor: p.cursor,
                    limit: p.limit,
                }));
            },
        });
    }
    pi.registerTool({
        name: 'deus_research_web',
        annotations: { ...readOnly, idempotentHint: false },
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
export default function extension(pi) {
    registerDexterTools(pi);
    pi.on('before_agent_start', async (event) => ({
        systemPrompt: event.systemPrompt +
            '\n\n' +
            (await readFile(join(packageRoot, 'prompts/kernel.md'), 'utf8')),
    }));
}
