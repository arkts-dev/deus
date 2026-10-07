import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DexterPlugin, MUTATION_COMMANDS, type ProbeReport } from '../src/dexter.js';

const operations = (c: DexterPlugin, workspace: string) => [
  () => c.submit({ workspace, title: 'literal;$(touch nope)', body: 'two words' }),
  () =>
    c.createIssue({
      workspace,
      title: 'title',
      body: '--dir=/other',
      priority: 2,
      parent: 'ISSUE-0001',
      dependencies: ['ISSUE-0002'],
    }),
  () => c.nudgeIssue({ workspace, issue: 'ISSUE-0001' }),
  () => c.reprioritizeIssue({ workspace, issue: 'ISSUE-0001', priority: 1 }),
  () =>
    c.relinkIssue({
      workspace,
      issue: 'ISSUE-0001',
      parent: null,
      addDependencies: ['ISSUE-0002'],
      removeDependencies: ['ISSUE-0003'],
    }),
  () =>
    c.acceptArchitecture({
      workspace,
      issue: 'ISSUE-0001',
      candidate: 'AC-000001',
      reason: 'reason',
    }),
];
test('unknown signature blocks every typed mutation and generic execution is absent', async (t) => {
  const prior = process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS;
  delete process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS;
  t.after(() => {
    if (prior !== undefined) process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS = prior;
  });
  const c = new DexterPlugin(process.execPath);
  const probe = await c.probe();
  assert.equal(probe.profile, 'unknown');
  assert.deepEqual(probe.supportedCommands, []);
  assert.equal(await c.probe(), probe);
  for (const run of operations(c, '/tmp/workspace')) {
    const r = await run();
    assert.equal(r.status, 'rejected');
    assert.equal(r.profile, 'unknown');
  }
  assert.equal('exec' in c, false);
});
test('typed argv, validation, bounded receipts and uncertain outcomes without retries', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'deus-typed-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = join(dir, 'fake.mjs');
  const program = async (body: string) => {
    await writeFile(executable, `#!${process.execPath}\n${body}`);
    await chmod(executable, 0o755);
  };
  const c = new DexterPlugin(executable, dir);
  c.probe = async (): Promise<ProbeReport> => ({
    executable,
    profile: 'dexter-signed',
    baselineRevision: 'f'.repeat(40),
    supportedCommands: MUTATION_COMMANDS,
    diagnostics: {},
    reasons: [],
  });
  await program(
    "import { appendFileSync } from 'node:fs'; appendFileSync('argv', JSON.stringify(process.argv.slice(2))+'\\n'); console.log('created ISSUE-0123 (task): example');",
  );
  for (const run of operations(c, dir)) assert.equal((await run()).status, 'completed');
  await c.relinkIssue({ workspace: dir, issue: 'ISSUE-0001', parent: 'ISSUE-0004' });
  const expected = [
    ['submit', '--body=two words', '--', 'literal;$(touch nope)'],
    [
      'issue',
      '--title=title',
      '--body=--dir=/other',
      '--priority',
      '2',
      '--parent',
      'ISSUE-0001',
      '--depends',
      'ISSUE-0002',
    ],
    ['nudge-issue', 'ISSUE-0001'],
    ['reprioritize-issue', 'ISSUE-0001', '--priority', '1'],
    [
      'relink-issue',
      'ISSUE-0001',
      '--clear-parent',
      '--add-dependency',
      'ISSUE-0002',
      '--remove-dependency',
      'ISSUE-0003',
    ],
    ['accept-architecture', 'ISSUE-0001', '--candidate', 'AC-000001', '--reason=reason'],
    ['relink-issue', 'ISSUE-0001', '--parent', 'ISSUE-0004'],
  ].map(([command, ...args]) => [command, `--dir=${dir}`, ...args]);
  const argv = await readFile(join(dir, 'argv'), 'utf8');
  assert.deepEqual(
    argv
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    expected,
  );
  for (const p of [
    { workspace: 'relative', issue: 'ISSUE-0001', priority: 1 },
    { workspace: dir, issue: '../escape', priority: 1 },
    { workspace: dir, issue: 'ISSUE-0001', priority: 5 },
  ])
    assert.equal((await c.reprioritizeIssue(p)).status, 'rejected');
  assert.equal((await c.relinkIssue({ workspace: dir, issue: 'ISSUE-0001' })).status, 'rejected');
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (await c.nudgeIssue({ workspace: dir, issue: 'ISSUE-0001' }, controller.signal)).status,
    'rejected',
  );
  assert.equal(await readFile(join(dir, 'argv'), 'utf8'), argv);
  const nudge = () => c.nudgeIssue({ workspace: dir, issue: 'ISSUE-0001' });
  await program("process.stdout.write('x'.repeat(600_000));");
  const large = await nudge();
  assert.equal(large.status, 'completed');
  assert.equal(large.signal, null);
  assert.equal(large.diagnostics.truncated, true);
  assert.ok(Buffer.byteLength(large.diagnostics.stdout) <= 2048);
  assert.ok(JSON.stringify(large).length < 5000);
  await program(
    "import { appendFileSync } from 'node:fs'; appendFileSync('calls', 'x'); process.exitCode = 7;",
  );
  const failed = await nudge();
  assert.equal(failed.status, 'outcome_unknown');
  assert.equal(failed.exitCode, 7);
  assert.equal(await readFile(join(dir, 'calls'), 'utf8'), 'x');
  await program("process.kill(process.pid, 'SIGTERM');");
  const terminated = await nudge();
  assert.equal(terminated.status, 'outcome_unknown');
  assert.equal(terminated.signal, 'SIGTERM');
  await program(
    "import { writeFileSync } from 'node:fs'; writeFileSync('started', 'yes'); setInterval(() => {}, 1000);",
  );
  const abort = new AbortController();
  const pending = c.nudgeIssue({ workspace: dir, issue: 'ISSUE-0001' }, abort.signal);
  for (let i = 0; i < 100; i++) {
    try {
      await readFile(join(dir, 'started'));
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assert.equal(await readFile(join(dir, 'started'), 'utf8'), 'yes');
  abort.abort();
  const cancelled = await pending;
  assert.equal(cancelled.status, 'outcome_unknown');
  assert.equal(cancelled.cancelled, true);
  await rm(executable);
  const missing = await nudge();
  assert.equal(missing.status, 'outcome_unknown');
  assert.equal(missing.exitCode, null);
});
