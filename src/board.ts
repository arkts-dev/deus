/** Product control: typed board snapshot, PRODUCT classification, and the one approval-gated close edit. */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { redactedJson } from './process.js';
import { banned, field, frontmatter, list, terms } from './governance.js';

const TERMINAL = new Set(['closed', 'rejected']);
const READY = new Set(['open', 'ready']);
const CLAIM = /^issue_(.+)\.lock$/;
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
  ready: string[];
  unclaimed: string[];
  blocked: string[];
}

const none = (value: string) => (!value || value === 'null' || value === '~' ? null : value);
const terminal = (issue: Issue) => TERMINAL.has(issue.status);

export async function loadBoard(workspace: string): Promise<Board> {
  if (!isAbsolute(workspace)) throw new Error('workspace must be an absolute path');
  const dir = join(workspace, 'forge', 'issues');
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((file) => file.endsWith('.md')).sort();
  } catch {
    files = [];
  }
  let claims: string[] = [];
  try {
    claims = (await readdir(join(workspace, 'forge', '.claims')))
      .map((file) => CLAIM.exec(file)?.[1])
      .filter((id): id is string => Boolean(id));
  } catch {
    claims = [];
  }
  const claimed = new Set(claims);
  const issues: Issue[] = [];
  for (const file of files) {
    const fm = frontmatter(await readFile(join(dir, file), 'utf8'));
    const priority = Number.parseInt(field(fm, 'priority'), 10);
    const id = field(fm, 'id') || file.replace(/\.md$/, '');
    issues.push({
      id,
      kind: field(fm, 'kind') || 'task',
      status: field(fm, 'status') || 'open',
      priority: Number.isFinite(priority) ? priority : 3,
      deps: list(fm, 'depends_on'),
      parent: none(field(fm, 'parent')),
      workdir: none(field(fm, 'workdir')),
      mr: none(field(fm, 'mr')),
      breakdown: none(field(fm, 'breakdown_candidate_id')),
      claimed: claimed.has(id),
      title: field(fm, 'title'),
      body: fm.body,
      file,
    });
  }
  const closed = new Set(issues.filter(terminal).map((issue) => issue.id));
  const ready = issues
    .filter(
      (issue) =>
        !terminal(issue) && READY.has(issue.status) && issue.deps.every((dep) => closed.has(dep)),
    )
    .map((issue) => issue.id);
  const blocked = issues
    .filter((issue) => !terminal(issue) && issue.deps.some((dep) => !closed.has(dep)))
    .map((issue) => issue.id);
  return {
    workspace,
    issues,
    claims,
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
  if (
    issue.kind === 'epic' &&
    board.issues.some((child) => child.parent === issue.id && !terminal(child))
  )
    errors.push('epic has open children');
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
  const commands: { command: string; argv: string[]; reason: string }[] = [];
  for (const entry of classifications.filter((item) => item.classification === 'PRODUCT')) {
    const issue = byId.get(entry.id);
    if (!issue) continue;
    if (board.ready.includes(issue.id) && issue.priority > 1)
      commands.push({
        command: 'reprioritize-issue',
        argv: [issue.id, '--priority', '1'],
        reason: 'PRODUCT ready',
      });
    if (issue.status === 'blocked')
      commands.push({ command: 'nudge-issue', argv: [issue.id], reason: 'PRODUCT blocked' });
  }
  const reports = closes.flatMap((close) =>
    close.errors.map((error) => `raw edit required for ${close.issue}: ${error}`),
  );
  for (const issue of board.issues)
    if (!terminal(issue) && issue.breakdown)
      reports.push(`raw edit required for ${issue.id}: stale breakdown_candidate_id`);
  const closedAfter = new Set([
    ...board.issues.filter(terminal).map((issue) => issue.id),
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
    commands,
    reports,
    saturation: { before: board.ready.length, after },
  };
}

export async function applyClose(
  workspace: string,
  board: Board,
  issueId: string,
  reason: Reason,
  successor?: string,
) {
  const issue = board.issues.find((candidate) => candidate.id === issueId);
  if (!issue) throw new Error(`unknown issue: ${issueId}`);
  if (terminal(issue)) return { issue: issueId, changed: false, reason };
  const errors = preconditions(issue, board);
  if (errors.length) throw new Error(`close refused for ${issueId}: ${errors.join('; ')}`);
  if (classify(issue, rootTerms(board)).classification === 'PRODUCT' && !successor)
    throw new Error(`refusing to close PRODUCT ${issueId}: name a successor`);
  if (reason === 'SUPERSEDED' && !successor) throw new Error('SUPERSEDED requires a successor');
  if (successor && !board.issues.some((entry) => entry.id === successor && !terminal(entry)))
    throw new Error(`unknown or terminal successor: ${successor}`);
  const path = join(workspace, 'forge', 'issues', issue.file);
  let content = await readFile(path, 'utf8');
  for (const [key, value] of [
    ['status', 'closed'],
    ['workdir', 'null'],
    ['mr', 'null'],
    ['assignee', 'null'],
    ['breakdown_candidate_id', 'null'],
  ])
    content = content.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`);
  const marker = `<!-- deus-close: ${reason} -->`;
  if (!content.includes(marker)) content = `${content.replace(/\s*$/, '')}\n\n${marker}\n`;
  await writeFile(path, content, 'utf8');
  return { issue: issueId, changed: true, reason };
}

const output = (value: unknown) => ({
  content: [{ type: 'text' as const, text: redactedJson(value, 2) }],
  details: {},
});

export default function board(pi: ExtensionAPI) {
  const workspace = Type.String({ description: 'Absolute Dexter workspace path' });
  pi.registerTool({
    name: 'deus_board_snapshot',
    label: 'Snapshot board',
    description:
      'Parse the forge into a typed board: the dependency frontier, claims, and the dispatchable set.',
    parameters: Type.Object({ workspace }),
    async execute(_id, p) {
      return output(await loadBoard(p.workspace));
    },
  });
  pi.registerTool({
    name: 'deus_board_plan',
    label: 'Plan board saturation',
    description:
      'Classify non-terminal issues as PRODUCT or NOISE against the live root objective and propose saturation commands. Never mutates.',
    parameters: Type.Object({ workspace }),
    async execute(_id, p) {
      return output(planBoard(await loadBoard(p.workspace)));
    },
  });
  pi.registerTool({
    name: 'deus_board_close',
    label: 'Close noise issue',
    description:
      'The sole approval-gated raw edit: close one leaf NOISE/DEAD issue with no claim, workdir, merge request, or open children. Requires confirm=true.',
    parameters: Type.Object({
      workspace,
      issue: Type.String(),
      reason: Type.Union([Type.Literal('NOISE'), Type.Literal('DEAD'), Type.Literal('SUPERSEDED')]),
      successor: Type.Optional(
        Type.String({ description: 'Named non-terminal successor when closing PRODUCT work' }),
      ),
      confirm: Type.Boolean(),
    }),
    async execute(_id, p) {
      if (!p.confirm)
        return output({ status: 'refused', reason: 'confirm=true is required for a raw edit' });
      const snapshot = await loadBoard(p.workspace);
      return output({
        status: 'applied',
        ...(await applyClose(snapshot.workspace, snapshot, p.issue, p.reason, p.successor)),
      });
    },
  });
}
