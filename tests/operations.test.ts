import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { botsLive, EventReader } from '../src/operations.js';
import { fixture, secret, schedulerFixture, schedulerWrite, eventFixture } from './fixture.js';

test('working leases expose PID and heartbeat liveness without modifying the database', async (t) => {
  const { root, put } = await fixture(t);
  await schedulerFixture(root);
  await put('dexter.config.json', '{"heartbeat_ttl_seconds":60}');
  const now = '2026-10-07T07:00:00Z',
    old = '2026-10-07T06:00:00Z';
  t.mock.method(Date, 'now', () => Date.parse(now));
  schedulerWrite(root, (db) => {
    const insert = db.prepare('INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?)');
    insert.run('RUN-000001', 'implementer', 'working', hostname(), process.pid, 'ISSUE-0001', old);
    insert.run('RUN-remote', 'reviewer', 'working', 'remote', 1, 'ISSUE-0002', now);
    insert.run('RUN-remote.stale', 'reviewer', 'working', 'remote', 1, null, old);
    insert.run('RUN-finished', 'reviewer', 'finished', null, null, null, now);
  });
  const before = await readFile(join(root, 'scheduler.sqlite3'));
  const live = await botsLive(root);
  assert.deepEqual(
    live.runs.map((r) => r.active),
    [true, true, false],
  );
  assert.equal(live.runs[0]!.livenessBasis, 'local_pid');
  assert.equal(live.runs[1]!.livenessBasis, 'heartbeat');
  assert.equal(live.runs[0]!.issue, 'ISSUE-0001');
  assert.equal(live.reservations, 'not_observable');
  assert.equal(live.throttling, 'not_observable');
  assert.deepEqual(await readFile(join(root, 'scheduler.sqlite3')), before);
  t.mock.method(process, 'kill', () => {
    throw Object.assign(new Error(), { code: 'ESRCH' });
  });
  assert.equal((await botsLive(root)).runs[0]!.active, false);
  await assert.rejects(botsLive('relative'), /absolute/);
  schedulerWrite(root, (db) =>
    db.prepare("UPDATE runs SET host = NULL WHERE id = 'RUN-000001'").run(),
  );
  await assert.rejects(botsLive(root), /ownership/);
});

test('SQLite event pages survive appends, redact, omit bodies and reject invalid cursors and metadata', async (t) => {
  const { root } = await fixture(t);
  await schedulerFixture(root);
  for (let i = 1; i <= 5; i++) eventFixture(root, i);
  const reader = new EventReader(),
    p = { workspace: root, limit: 2 };
  const first = await reader.read(p);
  assert.deepEqual(
    first.events.map((e) => e.seq),
    [5, 4],
  );
  assert.ok(first.nextCursor);
  assert.ok(!JSON.stringify(first).includes('PRIVATE BODY'));
  assert.ok(!JSON.stringify(first).includes(root));
  eventFixture(root, 6);
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
  eventFixture(root, 7, 'private-event-token');
  assert.equal((await reader.read(p)).events[0]!.note, '[REDACTED]');
  eventFixture(root, 8, 'x'.repeat(17000));
  await assert.rejects(reader.read(p), /16 KiB/);
  schedulerWrite(root, (db) =>
    db.prepare("UPDATE notification_events SET seq_length = 99 WHERE seq = '8'").run(),
  );
  await assert.rejects(reader.read(p), /sequence/);
});

test('event wire pages stay bounded and continue without dropping events', async (t) => {
  const { root } = await fixture(t);
  await schedulerFixture(root);
  for (let seq = 1; seq <= 30; seq++) eventFixture(root, seq, 'x'.repeat(700));
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

test('missing databases and escaping links fail without initializing state', async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(new EventReader().read({ workspace: root }));
  assert.deepEqual(await readdir(root), []);
  const outside = await fixture(t);
  await schedulerFixture(outside.root);
  await symlink(join(outside.root, 'scheduler.sqlite3'), join(root, 'scheduler.sqlite3'));
  await assert.rejects(new EventReader().read({ workspace: root }), /escapes/);
  await rm(join(root, 'scheduler.sqlite3'));
});
