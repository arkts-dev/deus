import { readOnly } from './tool-registry.js';
import { Type } from 'typebox';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DexterPlugin } from './dexter.js';
import { ArtifactReader, SECTIONS } from './artifacts.js';
import { boundedText } from './receipt.js';
import { botsLive, EventReader } from './operations.js';
import { jsonResult as output, pageResult } from './process.js';
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
        description: 'Verify Dexter commit signature. Normally diagnostics=false returns trust evidence only; true adds bounded process diagnostics. Unknown profile blocks mutation.',
        parameters: Type.Object({ diagnostics: Type.Boolean() }),
        async execute(_id, p, signal, _update, ctx) {
            const { diagnostics, ...report } = await dexter(ctx.cwd).probe(signal);
            return output(p.diagnostics
                ? {
                    ...report,
                    diagnostics: Object.fromEntries(Object.entries(diagnostics).map(([name, result]) => [
                        name,
                        {
                            ...result,
                            stdout: boundedText(result.stdout, 512),
                            stderr: boundedText(result.stderr, 512),
                            truncated: result.truncated ||
                                Buffer.byteLength(result.stdout) > 512 ||
                                Buffer.byteLength(result.stderr) > 512,
                        },
                    ])),
                }
                : report);
        },
    });
    const workspace = Type.String({ description: 'Absolute Dexter workspace path' });
    const issue = Type.String({ pattern: '^ISSUE-\\d+$' });
    const priority = Type.Integer({
        minimum: 1,
        maximum: 4,
        description: '1 highest, 4 lowest; use 3 for normal priority.',
    });
    const cursor = Type.Union([Type.String({ maxLength: 2048 }), Type.Null()], {
        description: 'null starts the first page.',
    });
    const submission = { workspace, title: Type.String({ minLength: 1 }), body: Type.String() };
    mutation('submit', 'Submit an objective through the verified CLI.', Type.Object(submission), (c, p, s) => c.submit(p, s));
    mutation('issue_create', 'Create a standalone task or a child of a tracking epic through the verified CLI.', Type.Object({
        ...submission,
        parent: Type.Union([issue, Type.Null()], {
            description: 'null creates a standalone task; an issue ID selects a tracking epic.',
        }),
        dependencies: Type.Array(issue, { description: 'Use [] for no dependencies.' }),
        priority,
    }), (c, p, s) => c.createIssue({ ...p, parent: p.parent ?? undefined }, s));
    mutation('issue_nudge', 'Restart a blocked issue from valid state.', Type.Object({ workspace, issue }), (c, p, s) => c.nudgeIssue(p, s));
    mutation('issue_reprioritize', 'Set priority (1 highest, 4 lowest).', Type.Object({ workspace, issue, priority }), (c, p, s) => c.reprioritizeIssue(p, s));
    mutation('issue_relink', 'Change parent/dependencies; "unchanged" preserves the parent, null clears it.', Type.Object({
        workspace,
        issue,
        parent: Type.Union([issue, Type.Null(), Type.Literal('unchanged')], {
            description: '"unchanged" preserves the parent; null clears it; an issue ID replaces it.',
        }),
        addDependencies: Type.Array(issue, { description: 'Use [] for no additions.' }),
        removeDependencies: Type.Array(issue, { description: 'Use [] for no removals.' }),
    }), (c, p, s) => c.relinkIssue({ ...p, parent: p.parent === 'unchanged' ? undefined : p.parent }, s));
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
        description: 'Read local bus summaries newest first, then older pages using a path-free cursor. Normally 20, maximum 100 events and 8 KiB response bytes per page; no bodies. Appends do not disrupt continuation; cursors expire on reload. Read-only, no CLI.',
        parameters: Type.Object({
            workspace,
            cursor,
            limit: Type.Integer({ minimum: 1, maximum: 100 }),
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
            description: `Read one local ${kind} section without CLI execution. Default: ${kind === 'run' ? 'metadata' : 'summary (metadata/body)'}, not history. limit: UTF-8 bytes, normally 2048, max 16384. Cursors expire on reload and reject changed content. Run transcript is stdout, not the Pi session dump.`,
            parameters: Type.Object({
                workspace,
                [idField]: Type.String(),
                section: Type.Union(SECTIONS[kind].map((section) => Type.Literal(section))),
                cursor,
                limit: Type.Integer({ minimum: 4, maximum: 16384 }),
            }),
            async execute(_id, p) {
                return pageResult(await reader.read(kind, {
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
            provider: Type.Union(['default', 'exa', 'searxng', 'brave', 'tavily', 'fetch'].map((x) => Type.Literal(x)), { description: '"default" uses the configured provider.' }),
        }),
        async execute(_id, p, signal) {
            const config = webConfigFromEnv();
            if (p.provider !== 'default')
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
