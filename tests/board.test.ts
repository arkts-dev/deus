import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify, loadBoard, planBoard } from '../src/board.js';
import boardTool from '../src/board.js';
import { schedulerFixture, schedulerWrite } from './fixture.js';

const issue = (id: string, body: string, extra = '') => {
  const fields = new Map(
    Object.entries({
      id,
      kind: 'task',
      title: `${id} title`,
      status: 'open',
      priority: '3',
      depends_on: '[]',
      parent: 'ISSUE-0001',
      workdir: 'null',
      mr: 'null',
      assignee: 'null',
      breakdown_candidate_id: 'null',
    }),
  );
  for (const line of extra.split('\n').filter(Boolean)) {
    const colon = line.indexOf(':');
    fields.set(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  return `---\n${[...fields].map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n## Objective\n${body}\n`;
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'deus-board-'));
  const dir = join(root, 'forge', 'issues');
  await mkdir(dir, { recursive: true });
  await schedulerFixture(root);
  await writeFile(
    join(dir, 'ISSUE-0001-root.md'),
    issue(
      'ISSUE-0001',
      'compiler must reject invalid programs',
      'kind: epic\nparent: null\npriority: 2',
    ),
  );
  await writeFile(join(dir, 'ISSUE-0002-noise.md'), issue('ISSUE-0002', 'Coverage is 100%.'));
  await writeFile(
    join(dir, 'ISSUE-0003-product.md'),
    issue('ISSUE-0003', 'reject invalid programs at type-check time', 'depends_on: [ISSUE-0002]'),
  );
  await writeFile(join(dir, 'ISSUE-0004-claimed.md'), issue('ISSUE-0004', 'coverage tracking'));
  schedulerWrite(root, (db) =>
    db
      .prepare('INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        'RUN-000001',
        'implementer',
        'working',
        'remote',
        1,
        'ISSUE-0004',
        '2026-10-07T00:00:00Z',
      ),
  );
  return root;
}

test('snapshot exposes the typed frontier and claims', async () => {
  const root = await fixture();
  try {
    const board = await loadBoard(root);
    assert.deepEqual(board.claims, ['ISSUE-0004']);
    assert.deepEqual(board.ready.sort(), ['ISSUE-0001', 'ISSUE-0002', 'ISSUE-0004']);
    assert.deepEqual(board.unclaimed.sort(), ['ISSUE-0001', 'ISSUE-0002']);
    assert.deepEqual(board.blocked, ['ISSUE-0003']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('classification is PRODUCT-first, then NOISE or DEAD', async () => {
  const root = await fixture();
  try {
    const board = await loadBoard(root);
    const objective = ['compiler', 'reject', 'invalid', 'programs'];
    const byId = (id: string) => board.issues.find((entry) => entry.id === id)!;
    assert.equal(classify(byId('ISSUE-0001'), objective).classification, 'PRODUCT');
    assert.equal(
      classify({ ...byId('ISSUE-0001'), status: 'closed' }, objective).classification,
      'DEAD',
    );
    assert.equal(classify(byId('ISSUE-0002'), objective).classification, 'NOISE');
    assert.equal(
      classify({ ...byId('ISSUE-0003'), body: 'unrelated prose' }, []).classification,
      'PRODUCT',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('plan prioritizes ready product work', async () => {
  const root = await fixture();
  try {
    const board = await loadBoard(root);
    const plan = planBoard(board);
    assert.deepEqual(plan.saturation, { before: 3, after: 3 });
    assert.deepEqual(plan.actions, [
      {
        tool: 'deus_dexter_issue_reprioritize',
        parameters: { workspace: root, issue: 'ISSUE-0001', priority: 1 },
        reason: 'PRODUCT ready',
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('board registers only read-only live and plan tools', () => {
  const names: string[] = [];
  boardTool({
    registerTool: (tool: { name: string; annotations: { readOnlyHint: boolean } }) => {
      names.push(tool.name);
      assert.equal(tool.annotations.readOnlyHint, true);
    },
  } as never);
  assert.deepEqual(names.sort(), ['deus_dexter_issues_live', 'deus_dexter_issues_plan']);
});

test('a rejected dependency does not satisfy readiness', async () => {
  const root = await fixture();
  try {
    const path = join(root, 'forge', 'issues', 'ISSUE-0002-noise.md');
    await writeFile(
      path,
      (await readFile(path, 'utf8')).replace(/^status: open$/m, 'status: rejected'),
    );
    const board = await loadBoard(root);
    assert.ok(board.blocked.includes('ISSUE-0003'));
    assert.equal(board.ready.includes('ISSUE-0003'), false);
    assert.equal(
      planBoard(board).actions.some((action) => action.parameters.issue === 'ISSUE-0003'),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('plan reports a breakdown pointer only when its candidate is absent', async () => {
  const root = await fixture();
  try {
    const issuePath = join(root, 'forge', 'issues', 'ISSUE-0002-noise.md');
    await writeFile(
      issuePath,
      (await readFile(issuePath, 'utf8')).replace(
        'breakdown_candidate_id: null',
        'breakdown_candidate_id: BC-000009',
      ),
    );
    const pointerReports = async () =>
      planBoard(await loadBoard(root)).reports.filter((report) =>
        report.includes('breakdown_candidate_id'),
      );
    assert.deepEqual(await pointerReports(), [
      'operator action required for ISSUE-0002: dangling breakdown_candidate_id BC-000009',
    ]);
    await mkdir(join(root, 'forge', '.candidates'), { recursive: true });
    await writeFile(join(root, 'forge', '.candidates', 'BC-000009.md'), 'status: materialized\n');
    assert.deepEqual(await pointerReports(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the live board lists only non-terminal issues without bodies', async () => {
  const root = await fixture();
  try {
    const path = join(root, 'forge', 'issues', 'ISSUE-0002-noise.md');
    await writeFile(path, (await readFile(path, 'utf8')).replace('status: open', 'status: closed'));
    const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
    boardTool({
      registerTool: (tool: { name: string }) => tools.set(tool.name, tool as never),
    } as never);
    const snapshot = tools.get('deus_dexter_issues_live')!;
    const result = (await snapshot.execute(
      'test',
      { workspace: root, cursor: null, limit: 20 },
      undefined,
      undefined,
      {},
    )) as { content: { text: string }[] };
    const live = JSON.parse(result.content[0]!.text);
    assert.deepEqual(
      live.records.map((issue: { id: string }) => issue.id),
      ['ISSUE-0001', 'ISSUE-0003', 'ISSUE-0004'],
    );
    assert.ok(live.records.every((issue: object) => !('body' in issue) && !('file' in issue)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
