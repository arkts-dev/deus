import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { botsLive, EventReader } from '../src/operations.js';
import { fixture, secret } from './fixture.js';
test('bot PID/heartbeat ownership, claim witnesses and policy cooldown', async (t) => {
  const { root, put } = await fixture(t);
  for (const dir of ['forge/bots', 'forge/.claims'])
    await mkdir(join(root, dir), { recursive: true });
  const now = '2026-10-07T07:00:00Z',
    old = '2026-10-07T06:00:00Z';
  t.mock.method(Date, 'now', () => Date.parse(now));
  await put(
    'dexter.config.json',
    JSON.stringify({
      max_concurrent_runs: 4,
      default_llm_config: { model: 'deepseek-flash', base_url: 'https://api.deepseek.com/v1' },
    }),
  );
  const bot = async (id: string, host: string, ts: string, status = 'working') =>
    put(
      `forge/bots/${id}.md`,
      `---\nid: ${id}\nrole: implementer\nstatus: ${status}\nworker: owner\nhost: ${host}\npid: ${process.pid}\nlast_heartbeat: ${ts}\ncurrent_issue: ISSUE-0001\ncurrent_mr: MR-0001\ncurrent_run: RUN-abc-0001\n---\n`,
    );
  await bot('BOT-0001', hostname(), old);
  await bot('BOT-0002', 'other-host', now);
  await bot('BOT-0003', 'other-host', old);
  await bot('BOT-0004', hostname(), now, 'offline');
  const claim = async (resource: string, ts: string, witness = '') =>
    put(
      `forge/.claims/${resource.replace(':', '_')}.lock`,
      `${resource}\nowner\n${hostname()}\n${process.pid}\n${ts}\n${witness}\n`,
    );
  await claim('issue:ISSUE-0001', old, 'lane:planning');
  await claim('lane:planning', now);
  const live = await botsLive(root);
  assert.deepEqual(
    live.bots.map((b) => b.active),
    [true, true, false],
  );
  assert.equal(live.bots[0]!.livenessBasis, 'local_pid');
  assert.equal(live.bots[1]!.livenessBasis, 'heartbeat');
  assert.deepEqual(live.bots[0]!.claims, ['issue:ISSUE-0001', 'lane:planning']);
  assert.equal(live.bots[0]!.mr, 'MR-0001');
  assert.equal(live.bots[0]!.run, 'RUN-abc-0001');
  assert.equal(live.claims[0]!.stale, false);
  assert.deepEqual(live.cooldown, {
    basis: 'persisted_config',
    configured: 4,
    policyLimit: 1,
    endsAt: '2026-10-07T10:00:00.000Z',
  });
  await claim('lane:planning', old);
  assert.equal((await botsLive(root)).claims[0]!.stale, true);
  t.mock.method(process, 'kill', () => {
    throw Object.assign(new Error(), { code: 'ESRCH' });
  });
  assert.equal((await botsLive(root)).bots[0]!.active, false);
  await put(
    'dexter.config.json',
    '{"max_concurrent_runs":4,"default_llm_config":{"model":"cortex"}}',
  );
  assert.equal((await botsLive(root)).cooldown.endsAt, null);
  await assert.rejects(botsLive('relative'), /absolute/);
  await put('forge/.claims/issue_ISSUE-0001.lock', 'broken');
  await assert.rejects(botsLive(root), /claim/);
});
test('newest-first bounded event pages survive appends and reject invalid cursors and paths', async (t) => {
  const { root, put } = await fixture(t);
  const reader = new EventReader();
  const event = async (seq: number, note = 'started') =>
    put(
      `bus/${String(seq).padStart(6, '0')}-run.started.md`,
      `---\nseq: ${seq}\nts: 2026-10-07T07:00:00Z\ntype: run.started\nissue: ISSUE-0001\nnote: ${note}\n---\nPRIVATE BODY`,
    );
  for (let i = 1; i <= 5; i++) await event(i);
  const p = { workspace: root, limit: 2 };
  const first = await reader.read(p);
  assert.deepEqual(
    first.events.map((e) => e.seq),
    [5, 4],
  );
  assert.ok(first.nextCursor);
  assert.ok(!JSON.stringify(first).includes('PRIVATE BODY'));
  assert.ok(!JSON.stringify(first).includes(root));
  await event(6);
  const second = await reader.read({ ...p, cursor: first.nextCursor });
  assert.deepEqual(
    second.events.map((e) => e.seq),
    [3, 2],
  );
  const last = await reader.read({ ...p, cursor: second.nextCursor });
  assert.deepEqual(
    last.events.map((e) => e.seq),
    [1],
  );
  assert.equal(last.nextCursor, null);
  for (const bad of [
    { ...p, cursor: first.nextCursor + 'x' },
    { ...p, limit: 0 },
    { ...p, limit: 101 },
    { ...p, workspace: 'relative' },
  ])
    await assert.rejects(reader.read(bad));
  await assert.rejects(new EventReader().read({ ...p, cursor: first.nextCursor }), /expired/);
  const other = await fixture(t);
  await assert.rejects(
    reader.read({ workspace: other.root, cursor: first.nextCursor }),
    /another workspace/,
  );
  secret(t, 'private-event-token');
  await event(7, 'private-event-token');
  assert.equal((await reader.read(p)).events[0]!.note, '[REDACTED]');
  await event(8, 'x'.repeat(17000));
  await assert.rejects(reader.read(p), /16 KiB/);
  await rm(join(root, 'bus/000008-run.started.md'));
  await put('outside.md', 'private');
  await symlink(join(root, 'outside.md'), join(root, 'bus/000008-run.started.md'));
  await assert.rejects(reader.read(p), /front matter/);
  await rm(join(root, 'bus/000008-run.started.md'));
  await symlink('/etc/passwd', join(root, 'bus/000008-run.started.md'));
  await assert.rejects(reader.read(p), /escapes/);
});

test('event wire pages omit absent fields, stay bounded, and continue without dropping events', async (t) => {
  const { root, put } = await fixture(t);
  for (let seq = 1; seq <= 30; seq++)
    await put(
      `bus/${String(seq).padStart(6, '0')}-run.started.md`,
      `---\nseq: ${seq}\nts: 2026-10-07T07:00:00Z\ntype: run.started\nnote: ${'x'.repeat(700)}\n---\n`,
    );
  const reader = new EventReader();
  let cursor: string | null = null;
  const seen: unknown[] = [];
  do {
    const page = await reader.read({ workspace: root, cursor, limit: 100 });
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 8192);
    for (const event of page.events) {
      assert.equal('host' in event, false);
      seen.push(event.seq);
    }
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(
    seen,
    Array.from({ length: 30 }, (_, i) => 30 - i),
  );
});
