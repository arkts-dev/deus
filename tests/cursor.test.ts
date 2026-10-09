import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SignedCursor, RecordPager } from '../src/cursor.js';

test('shared cursors round-trip payloads and reject tampering, malformed input and other readers', () => {
  const reader = new SignedCursor();
  const value = { identity: 'workspace', before: 42 };
  const cursor = reader.encode(value);
  assert.deepEqual(reader.decode(cursor), value);
  for (const bad of ['', 'x'.repeat(2049), `${cursor}.extra`, `${cursor}x`])
    assert.throws(() => reader.decode(bad), /Invalid/);
  assert.throws(() => new SignedCursor().decode(cursor), /expired/);
});

test('record pages bound complete wire bytes and cover every row without duplication', () => {
  const pager = new RecordPager();
  const rows = Array.from({ length: 200 }, (_, id) => ({ id, title: '字🙂'.repeat(100) }));
  let cursor: string | null = null;
  const collected: unknown[] = [];
  do {
    const page = pager.page('/workspace', rows, cursor, 100);
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 8192);
    assert.equal(page.total, rows.length);
    collected.push(...page.records);
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(collected, rows);
  const first = pager.page('/workspace', rows, null, 1);
  assert.throws(() => pager.page('/other', rows, first.nextCursor, 1), /Snapshot/);
  assert.throws(() => pager.page('/workspace', rows.slice(1), first.nextCursor, 1), /Snapshot/);
  assert.throws(() => new RecordPager().page('/workspace', rows, first.nextCursor, 1), /expired/);
  assert.throws(() => pager.page('/workspace', [{ title: 'x'.repeat(9000) }], null, 1), /8 KiB/);
  for (const limit of [0, 101]) assert.throws(() => pager.page('/workspace', rows, null, limit));
});
