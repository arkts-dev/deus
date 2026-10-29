/** Read-only product board snapshots, classifications and scheduling proposals. */
import { readOnly } from './tool-registry.js';
import { Type } from 'typebox';
import { readdir } from 'node:fs/promises';
import { document, safePath, source, ISSUE_ID } from './artifacts.js';
import { workingRuns } from './scheduler.js';
import { isAbsolute } from 'node:path';
import { jsonResult as output } from './process.js';
import { RecordPager } from './cursor.js';
import { banned, terms } from './governance.js';
const TERMINAL = new Set(['closed', 'rejected']);
const READY = new Set(['open', 'ready']);
const CANDIDATE = /^(BC-\d+)\.md$/;
const none = (value) => (!value || value === 'null' || value === '~' ? null : value);
const terminal = (issue) => TERMINAL.has(issue.status);
export async function loadBoard(workspace) {
    if (!isAbsolute(workspace))
        throw new Error('workspace must be an absolute path');
    const dir = await safePath(workspace, 'forge', 'issues');
    const files = (await readdir(dir)).filter((file) => file.endsWith('.md')).sort();
    // Working leases remain reservations even when owner liveness looks stale.
    const claims = [
        ...new Set((await workingRuns(workspace)).flatMap((run) => (run.issue ? [run.issue] : []))),
    ].sort();
    let candidates = [];
    try {
        candidates = (await readdir(await safePath(workspace, 'forge', '.candidates')))
            .map((file) => CANDIDATE.exec(file)?.[1])
            .filter((id) => Boolean(id));
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    const claimed = new Set(claims);
    const issues = [];
    for (const file of files) {
        const raw = await source(workspace, ['forge', 'issues', file]);
        const doc = document(raw);
        if (typeof doc.metadata.id !== 'string' ||
            !ISSUE_ID.test(doc.metadata.id) ||
            !(file === `${doc.metadata.id}.md` || file.startsWith(`${doc.metadata.id}-`)))
            throw new Error('Issue metadata identity mismatch');
        const m = doc.metadata;
        const id = doc.metadata.id;
        const priority = m.priority ?? 3;
        const deps = m.depends_on ?? [];
        if (!Number.isInteger(priority) ||
            Number(priority) < 1 ||
            Number(priority) > 4 ||
            !Array.isArray(deps) ||
            !deps.every((dep) => typeof dep === 'string' && ISSUE_ID.test(dep)))
            throw new Error('Invalid issue priority or dependencies');
        const optional = (key) => {
            const value = m[key];
            if (value == null)
                return null;
            if (typeof value !== 'string')
                throw new Error(`Invalid issue ${key}`);
            return none(value);
        };
        issues.push({
            id,
            kind: optional('kind') ?? 'task',
            status: optional('status') ?? 'open',
            priority: Number(priority),
            deps,
            parent: optional('parent'),
            workdir: optional('workdir'),
            mr: optional('mr'),
            breakdown: optional('breakdown_candidate_id'),
            claimed: claimed.has(id),
            title: optional('title') ?? '',
            body: doc.body,
            file,
        });
    }
    const satisfied = new Set(issues.filter((issue) => issue.status === 'closed').map((issue) => issue.id));
    const ready = issues
        .filter((issue) => !terminal(issue) &&
        READY.has(issue.status) &&
        issue.deps.every((dep) => satisfied.has(dep)))
        .map((issue) => issue.id);
    const blocked = issues
        .filter((issue) => !terminal(issue) && issue.deps.some((dep) => !satisfied.has(dep)))
        .map((issue) => issue.id);
    return {
        workspace,
        issues,
        claims,
        candidates,
        ready,
        unclaimed: ready.filter((id) => !claimed.has(id)),
        blocked,
    };
}
export function classify(issue, objective) {
    if (terminal(issue))
        return { id: issue.id, classification: 'DEAD', evidence: [`status: ${issue.status}`] };
    const wanted = new Set(objective.map((term) => term.toLowerCase()));
    const matched = terms(`${issue.title}\n${issue.body}`, 100).filter((term) => wanted.has(term.toLowerCase()));
    if (matched.length)
        return {
            id: issue.id,
            classification: 'PRODUCT',
            evidence: matched.slice(0, 8).map((term) => `objective term: ${term}`),
        };
    const signals = banned(`${issue.title}\n${issue.body}`);
    if (signals.length)
        return { id: issue.id, classification: 'NOISE', evidence: signals };
    return {
        id: issue.id,
        classification: 'PRODUCT',
        evidence: ['no noise signal; retained as PRODUCT'],
    };
}
const rootTerms = (board) => {
    const root = board.issues
        .filter((issue) => issue.parent === null && !terminal(issue))
        .sort((left, right) => left.priority - right.priority)[0];
    return terms(root ? `${root.title}\n${root.body}` : '');
};
export function planBoard(board) {
    const objectiveTerms = rootTerms(board);
    const classifications = board.issues
        .filter((issue) => !terminal(issue))
        .map((issue) => classify(issue, objectiveTerms));
    const byId = new Map(board.issues.map((issue) => [issue.id, issue]));
    const actions = [];
    for (const entry of classifications.filter((item) => item.classification === 'PRODUCT')) {
        const issue = byId.get(entry.id);
        if (!issue)
            continue;
        if (board.ready.includes(issue.id) && issue.priority > 1)
            actions.push({
                tool: 'deus_dexter_issue_reprioritize',
                parameters: { workspace: board.workspace, issue: issue.id, priority: 1 },
                reason: 'PRODUCT ready',
            });
        if (issue.status === 'blocked')
            actions.push({
                tool: 'deus_dexter_issue_nudge',
                parameters: { workspace: board.workspace, issue: issue.id },
                reason: 'PRODUCT blocked',
            });
    }
    const reports = [];
    for (const issue of board.issues)
        if (!terminal(issue) && issue.breakdown && !board.candidates.includes(issue.breakdown))
            reports.push(`operator action required for ${issue.id}: dangling breakdown_candidate_id ${issue.breakdown}`);
    return {
        objectiveTerms,
        classifications,
        actions,
        reports,
        saturation: { before: board.ready.length, after: board.ready.length },
    };
}
export function registerBoardTools(pi) {
    const workspace = Type.String({ description: 'Absolute Dexter workspace path' });
    const pagination = {
        workspace,
        cursor: Type.Union([Type.String({ maxLength: 2048 }), Type.Null()], {
            description: 'null starts a fresh snapshot.',
        }),
        limit: Type.Integer({
            minimum: 1,
            maximum: 100,
            description: 'Normally 20 records, maximum 8 KiB/page.',
        }),
    };
    const live = new RecordPager(), plans = new RecordPager();
    pi.registerTool({
        name: 'deus_dexter_issues_live',
        annotations: readOnly,
        label: 'Live board',
        description: 'Page non-terminal issues with dependency readiness and claims; no bodies or historical candidate inventory. Snapshot cursors reject changes. Use issue_read for contracts.',
        parameters: Type.Object(pagination),
        async execute(_id, p) {
            const board = await loadBoard(p.workspace);
            return output(live.page(p.workspace, board.issues
                .filter((issue) => !terminal(issue))
                .map(({ body, file, ...issue }) => ({
                ...issue,
                ready: board.ready.includes(issue.id),
                unclaimed: board.unclaimed.includes(issue.id),
                blockedBy: issue.deps.filter((dep) => !board.issues.some((i) => i.id === dep && i.status === 'closed')),
            })), p.cursor, p.limit));
        },
    });
    pi.registerTool({
        name: 'deus_dexter_issues_plan',
        annotations: readOnly,
        label: 'Plan board saturation',
        description: 'Page PRODUCT-first classifications and scheduling proposals. Never mutates; statuses and proposals are not acceptance. Snapshot cursors reject changes.',
        parameters: Type.Object(pagination),
        async execute(_id, p) {
            const plan = planBoard(await loadBoard(p.workspace));
            return output(plans.page(p.workspace, plan.classifications.map((entry) => ({
                ...entry,
                actions: plan.actions.filter((action) => action.parameters.issue === entry.id),
                reports: plan.reports.filter((report) => report.includes(entry.id)),
            })), p.cursor, p.limit));
        },
    });
}
export default function board(pi) {
    registerBoardTools(pi);
}
