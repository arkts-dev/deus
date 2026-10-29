/** Product control: typed board snapshot, PRODUCT classification, and the one approval-gated close edit. */
import { readOnly, type ToolRegistrar } from './tool-registry.js';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { readdir } from 'node:fs/promises';
import { document, safePath, source, ISSUE_ID } from './artifacts.js';
import { workingRuns } from './scheduler.js';
import { isAbsolute } from 'node:path';
import { jsonResult as output } from './process.js';
import { mutationReceipt } from './receipt.js';
import { DexterPlugin } from './dexter.js';
import { RecordPager } from './cursor.js';
import { banned, terms } from './governance.js';

const TERMINAL = new Set(['closed', 'rejected']);
const READY = new Set(['open', 'ready']);
const CANDIDATE = /^(BC-\d+)\.md$/;
export type Reason = 'NOISE' | 'DEAD' | 'SUPERSEDED';
export interface Issue {
  id: string;
  kind: string;
  status: string;
  priority: number;
  deps: string[];
  parent: string | null;
  workdir: string | null;
  mr: string | null;
  breakdown: string | null;
  claimed: boolean;
  title: string;
  body: string;
  file: string;
}
export interface Board {
  workspace: string;
  issues: Issue[];
  claims: string[];
  candidates: string[];
  ready: string[];
  unclaimed: string[];
  blocked: string[];
}

const none = (value: string) => (!value || value === 'null' || value === '~' ? null : value);
const terminal = (issue: Issue) => TERMINAL.has(issue.status);

export async function loadBoard(workspace: string): Promise<Board> {
  if (!isAbsolute(workspace)) throw new Error('workspace must be an absolute path');
  const dir = await safePath(workspace, 'forge', 'issues');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.md')).sort();
  // Working leases remain reservations even when owner liveness looks stale.
  const claims = [
    ...new Set((await workingRuns(workspace)).flatMap((run) => (run.issue ? [run.issue] : []))),
  ].sort();
  let candidates: string[] = [];
  try {
    candidates = (await readdir(await safePath(workspace, 'forge', '.candidates')))
      .map((file) => CANDIDATE.exec(file)?.[1])
      .filter((id): id is string => Boolean(id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const claimed = new Set(claims);
  const issues: Issue[] = [];
  for (const file of files) {
    const raw = await source(workspace, ['forge', 'issues', file]);
    const doc = document(raw);
    if (
      typeof doc.metadata.id !== 'string' ||
      !ISSUE_ID.test(doc.metadata.id) ||
      !(file === `${doc.metadata.id}.md` || file.startsWith(`${doc.metadata.id}-`))
    )
      throw new Error('Issue metadata identity mismatch');
    const m = doc.metadata;
    const id = doc.metadata.id;
    const priority = m.priority ?? 3;
    const deps = m.depends_on ?? [];
    if (
      !Number.isInteger(priority) ||
      Number(priority) < 1 ||
      Number(priority) > 4 ||
      !Array.isArray(deps) ||
      !deps.every((dep) => typeof dep === 'string' && ISSUE_ID.test(dep))
    )
      throw new Error('Invalid issue priority or dependencies');
    const optional = (key: string) => {
      const value = m[key];
      if (value == null) return null;
      if (typeof value !== 'string') throw new Error(`Invalid issue ${key}`);
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
  const satisfied = new Set(
    issues.filter((issue) => issue.status === 'closed').map((issue) => issue.id),
  );
  const ready = issues
    .filter(
      (issue) =>
        !terminal(issue) &&
        READY.has(issue.status) &&
        issue.deps.every((dep) => satisfied.has(dep)),
    )
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

export function classify(issue: Issue, objective: string[]) {
  if (terminal(issue))
    return { id: issue.id, classification: 'DEAD', evidence: [`status: ${issue.status}`] };
  const wanted = new Set(objective.map((term) => term.toLowerCase()));
  const matched = terms(`${issue.title}\n${issue.body}`, 100).filter((term) =>
    wanted.has(term.toLowerCase()),
  );
  if (matched.length)
    return {
      id: issue.id,
      classification: 'PRODUCT',
      evidence: matched.slice(0, 8).map((term) => `objective term: ${term}`),
    };
  const signals = banned(`${issue.title}\n${issue.body}`);
  if (signals.length) return { id: issue.id, classification: 'NOISE', evidence: signals };
  return {
    id: issue.id,
    classification: 'PRODUCT',
    evidence: ['no noise signal; retained as PRODUCT'],
  };
}

export function preconditions(issue: Issue, board: Board): string[] {
  const errors: string[] = [];
  if (terminal(issue)) errors.push(`already ${issue.status}`);
  if (issue.claimed) errors.push('active claim');
  if (issue.workdir) errors.push('active workdir');
  if (issue.mr) errors.push('active merge request');
  if (board.issues.some((child) => child.parent === issue.id && !terminal(child)))
    errors.push('issue has open children');
  return errors;
}

const rootTerms = (board: Board) => {
  const root = board.issues
    .filter((issue) => issue.parent === null && !terminal(issue))
    .sort((left, right) => left.priority - right.priority)[0];
  return terms(root ? `${root.title}\n${root.body}` : '');
};

export function planBoard(board: Board) {
  const objectiveTerms = rootTerms(board);
  const classifications = board.issues
    .filter((issue) => !terminal(issue))
    .map((issue) => classify(issue, objectiveTerms));
  const byId = new Map(board.issues.map((issue) => [issue.id, issue] as const));
  const nonTerminal = board.issues.filter((issue) => !terminal(issue));
  const closeIds = new Set<string>();
  const closes = classifications
    .filter((entry) => entry.classification === 'NOISE')
    .map((entry) => {
      const issue = byId.get(entry.id)!;
      const errors = preconditions(issue, board);
      if (!errors.length) closeIds.add(issue.id);
      return {
        issue: issue.id,
        reason: 'NOISE' as const,
        evidence: entry.evidence,
        unblocks: nonTerminal
          .filter((consumer) => consumer.deps.includes(issue.id))
          .map((consumer) => consumer.id),
        errors,
      };
    });
  const actions: { tool: string; parameters: Record<string, unknown>; reason: string }[] = [];
  for (const entry of classifications.filter((item) => item.classification === 'PRODUCT')) {
    const issue = byId.get(entry.id);
    if (!issue) continue;
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
  const reports = closes.flatMap((close) =>
    close.errors.map((error) => `operator action required for ${close.issue}: ${error}`),
  );
  for (const issue of board.issues)
    if (!terminal(issue) && issue.breakdown && !board.candidates.includes(issue.breakdown))
      reports.push(
        `operator action required for ${issue.id}: dangling breakdown_candidate_id ${issue.breakdown}`,
      );
  const closedAfter = new Set([
    ...board.issues.filter((issue) => issue.status === 'closed').map((issue) => issue.id),
    ...closeIds,
  ]);
  const after = board.issues.filter(
    (issue) =>
      !terminal(issue) &&
      READY.has(issue.status) &&
      issue.deps.every((dep) => closedAfter.has(dep)),
  ).length;
  return {
    objectiveTerms,
    classifications,
    closes,
    actions,
    reports,
    saturation: { before: board.ready.length, after: board.ready.length },
    closureCapability: 'unavailable: current Dexter has no guarded leaf-close CLI operation',
    potentialReadyAfterClosures: after,
  };
}

function closeErrors(board: Board, issueId: string, reason: Reason, successor?: string): string[] {
  const issue = board.issues.find((entry) => entry.id === issueId);
  if (!issue) return [`unknown issue: ${issueId}`];
  if (terminal(issue)) return [];
  const errors = preconditions(issue, board);
  if (classify(issue, rootTerms(board)).classification === 'PRODUCT' && !successor)
    errors.push(`refusing to close PRODUCT ${issueId}: name a successor`);
  if (reason === 'SUPERSEDED' && !successor) errors.push('SUPERSEDED requires a successor');
  if (
    successor &&
    (successor === issueId ||
      !board.issues.some((entry) => entry.id === successor && !terminal(entry)))
  )
    errors.push(`unknown or terminal successor: ${successor}`);
  return errors;
}

export function registerBoardTools(pi: ToolRegistrar) {
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
  const live = new RecordPager(),
    plans = new RecordPager();
  pi.registerTool({
    name: 'deus_dexter_issues_live',
    annotations: readOnly,
    label: 'Live board',
    description:
      'Page non-terminal issues with dependency readiness and claims; no bodies or historical candidate inventory. Snapshot cursors reject changes. Use issue_read for contracts.',
    parameters: Type.Object(pagination),
    async execute(_id, p) {
      const board = await loadBoard(p.workspace);
      return output(
        live.page(
          p.workspace,
          board.issues
            .filter((issue) => !terminal(issue))
            .map(({ body, file, ...issue }) => ({
              ...issue,
              ready: board.ready.includes(issue.id),
              unclaimed: board.unclaimed.includes(issue.id),
              blockedBy: issue.deps.filter(
                (dep) => !board.issues.some((i) => i.id === dep && i.status === 'closed'),
              ),
            })),
          p.cursor,
          p.limit,
        ),
      );
    },
  });
  pi.registerTool({
    name: 'deus_dexter_issues_plan',
    annotations: readOnly,
    label: 'Plan board saturation',
    description:
      'Page PRODUCT-first classifications, scheduling proposals and guarded closures. Never mutates; statuses and proposals are not acceptance. Snapshot cursors reject changes.',
    parameters: Type.Object(pagination),
    async execute(_id, p) {
      const plan = planBoard(await loadBoard(p.workspace));
      return output(
        plans.page(
          p.workspace,
          plan.classifications.map((entry) => ({
            ...entry,
            actions: plan.actions.filter((action) => action.parameters.issue === entry.id),
            closure: plan.closes.find((close) => close.issue === entry.id) ?? null,
            reports: [
              ...plan.reports.filter((report) => report.includes(entry.id)),
              ...(plan.closes.some((close) => close.issue === entry.id)
                ? [plan.closureCapability]
                : []),
            ],
          })),
          p.cursor,
          p.limit,
        ),
      );
    },
  });
  pi.registerTool({
    name: 'deus_dexter_issue_close',
    label: 'Close noise issue',
    description:
      'Check an approved leaf closure request. Current Dexter has no guarded leaf-close CLI operation: returns rejected with the capability gap and never edits Forge. reject-issue is not equivalent (it rejects an entire subtree).',
    parameters: Type.Object({
      workspace,
      issue: Type.String(),
      reason: Type.Union([Type.Literal('NOISE'), Type.Literal('DEAD'), Type.Literal('SUPERSEDED')]),
      successor: Type.Union([Type.String({ pattern: '^ISSUE-\\d+$' }), Type.Null()], {
        description: 'Named non-terminal successor when closing PRODUCT work; null means none.',
      }),
      confirm: Type.Boolean(),
    }),
    async execute(_id, p, signal, _update, ctx) {
      if (!p.confirm || signal?.aborted || !isAbsolute(p.workspace))
        return output(
          mutationReceipt('rejected', {
            issue: p.issue,
            cancelled: signal?.aborted,
            reasons: ['Closure requires approval, an absolute workspace, and no cancellation'],
          }),
        );
      const probe = await new DexterPlugin(process.env.DEXTER_BIN || 'dexter', ctx.cwd).probe(
        signal,
      );
      const receipt = { profile: probe.profile, issue: p.issue };
      if (probe.profile !== 'dexter-signed')
        return output(mutationReceipt('rejected', { ...receipt, reasons: probe.reasons }));
      const snapshot = await loadBoard(p.workspace);
      const successor = p.successor ?? undefined;
      const errors = closeErrors(snapshot, p.issue, p.reason, successor);
      if (signal?.aborted)
        return output(
          mutationReceipt('rejected', {
            ...receipt,
            cancelled: true,
            reasons: ['Cancelled before closure'],
          }),
        );
      if (errors.length)
        return output(mutationReceipt('rejected', { ...receipt, reasons: errors }));
      return output(
        mutationReceipt('rejected', {
          ...receipt,
          reasons: [
            'Current Dexter has no guarded leaf-close CLI operation; workspace unchanged. reject-issue rejects a subtree and is not a closure substitute.',
          ],
        }),
      );
    },
  });
}

export default function board(pi: ExtensionAPI) {
  registerBoardTools(pi);
}
