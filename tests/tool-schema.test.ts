import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TSchema } from 'typebox';
import { Value } from 'typebox/value';
import extension from '../src/extension.js';
import board from '../src/board.js';
import designer from '../src/designer.js';
import { DexterPlugin } from '../src/dexter.js';
import { fixture } from './fixture.js';

type Tool = {
  name: string;
  parameters: TSchema;
  execute: (...args: any[]) => Promise<{ content: { text: string }[] }>;
};
function tools() {
  const registered = new Map<string, Tool>();
  const pi = { on() {}, registerTool: (tool: Tool) => registered.set(tool.name, tool) };
  for (const register of [extension, board, designer]) register(pi as never);
  return registered;
}
async function call(tool: Tool, parameters: unknown, cwd: string) {
  assert.ok(Value.Check(tool.parameters, parameters), `${tool.name}: schema rejects input`);
  const result = await tool.execute('test', parameters, undefined, undefined, { cwd });
  return JSON.parse(result.content[0]!.text);
}

test('registered schemas accept explicit defaults and reject invalid choices', () => {
  const registered = tools();
  const create = registered.get('deus_dexter_issue_create')!;
  const submission = { workspace: '/tmp/project', title: 'Task', body: 'Body' };
  assert.ok(
    Value.Check(create.parameters, { ...submission, parent: null, dependencies: [], priority: 3 }),
  );
  assert.equal(Value.Check(create.parameters, submission), false);
  for (const patch of [
    { parent: 'unchanged' },
    { parent: '' },
    { priority: null },
    { priority: 5 },
    { dependencies: null },
  ])
    assert.equal(
      Value.Check(create.parameters, {
        ...submission,
        parent: null,
        dependencies: [],
        priority: 3,
        ...patch,
      }),
      false,
    );
  const research = registered.get('deus_research_web')!;
  assert.ok(Value.Check(research.parameters, { question: 'Public question', provider: 'default' }));
  assert.equal(
    Value.Check(research.parameters, { question: 'Public question', provider: null }),
    false,
  );
  const close = registered.get('deus_dexter_issue_close')!;
  assert.ok(
    Value.Check(close.parameters, {
      workspace: '/tmp/project',
      issue: 'ISSUE-0002',
      reason: 'NOISE',
      successor: null,
      confirm: true,
    }),
  );
});

test('registered mutations normalize parent intent at the adapter boundary', async (t) => {
  const registered = tools();
  const workspace = '/tmp/project';
  const submission = { workspace, title: 'Task', body: 'Body', dependencies: [], priority: 3 };
  const create = t.mock.method(
    DexterPlugin.prototype,
    'createIssue',
    async () => ({ status: 'rejected' }) as never,
  );
  for (const parent of [null, 'ISSUE-0001']) {
    await call(registered.get('deus_dexter_issue_create')!, { ...submission, parent }, workspace);
    assert.deepEqual(create.mock.calls.at(-1)!.arguments, [
      { ...submission, parent: parent ?? undefined },
      undefined,
    ]);
  }
  const target = { workspace, issue: 'ISSUE-0003', addDependencies: [], removeDependencies: [] };
  const relink = t.mock.method(
    DexterPlugin.prototype,
    'relinkIssue',
    async () => ({ status: 'rejected' }) as never,
  );
  for (const parent of ['unchanged', null, 'ISSUE-0001']) {
    await call(registered.get('deus_dexter_issue_relink')!, { ...target, parent }, workspace);
    assert.deepEqual(relink.mock.calls.at(-1)!.arguments, [
      { ...target, parent: parent === 'unchanged' ? undefined : parent },
      undefined,
    ]);
  }
});

test('registered readers accept explicit first-page and default-size values', async (t) => {
  const { root, put } = await fixture(t);
  await put('forge/issues/ISSUE-0001-task.md', '---\nid: ISSUE-0001\nstatus: open\n---\n\nBody\n');
  await put(
    'bus/000001-run.started.md',
    '---\nseq: 1\nts: 2026-10-08T20:00:00Z\ntype: run.started\n---\n\nBody\n',
  );
  const registered = tools();
  const issue = registered.get('deus_dexter_issue_read')!;
  const result = await call(
    issue,
    { workspace: root, issue: 'ISSUE-0001', section: 'summary', cursor: null, limit: 4096 },
    root,
  );
  assert.equal(result.section, 'summary');
  assert.match(result.text, /Body/);
  assert.equal(result.nextCursor, null);
  const events = registered.get('deus_dexter_events_read')!;
  assert.ok(await call(events, { workspace: root, cursor: null, limit: 20 }, root));
  for (const limit of [0, 101, null])
    assert.equal(Value.Check(events.parameters, { workspace: root, cursor: null, limit }), false);
});

test('probe is concise by default and explicitly bounds diagnostics without hiding process status', async (t) => {
  t.mock.method(
    DexterPlugin.prototype,
    'probe',
    async () =>
      ({
        executable: 'fixture',
        profile: 'unknown',
        baselineRevision: '',
        supportedCommands: [],
        reasons: ['Signature failed'],
        diagnostics: {
          verify: {
            stdout: 'x'.repeat(2000),
            stderr: 'y'.repeat(2000),
            exitCode: 7,
            signal: null,
            timedOut: false,
            cancelled: false,
            truncated: false,
          },
        },
      }) as never,
  );
  const probe = tools().get('deus_dexter_probe')!;
  const concise = await call(probe, { diagnostics: false }, '/tmp/project');
  assert.equal('diagnostics' in concise, false);
  assert.deepEqual(concise.reasons, ['Signature failed']);
  const verbose = await call(probe, { diagnostics: true }, '/tmp/project');
  assert.equal(verbose.diagnostics.verify.exitCode, 7);
  assert.equal(verbose.diagnostics.verify.truncated, true);
  assert.equal(Buffer.byteLength(verbose.diagnostics.verify.stderr), 512);
});

test('Pi reader wire output preserves pre-redacted slices and revision', async (t) => {
  const { root, put } = await fixture(t);
  await put('forge/issues/ISSUE-0001-task.md', '---\nid: ISSUE-0001\n---\npassword=abcdefgh');
  const reader = tools().get('deus_dexter_issue_read')!;
  const request = {
    workspace: root,
    issue: 'ISSUE-0001',
    section: 'body',
    cursor: null,
    limit: 12,
  };
  const first = await call(reader, request, root);
  const second = await call(reader, { ...request, cursor: first.nextCursor }, root);
  assert.equal(first.text, 'password=[RE');
  assert.equal(Buffer.byteLength(first.text), 12);
  assert.equal(first.text + second.text, 'password=[REDACTED]');
  assert.equal(first.revision, second.revision);
  assert.equal(second.nextCursor, null);
});
