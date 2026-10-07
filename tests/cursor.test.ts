import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SignedCursor } from '../src/cursor.js';

test('shared cursors round-trip payloads and reject tampering, malformed input and other readers', () => {
  const reader = new SignedCursor();
  const value = { identity: 'workspace', before: 42 };
  const cursor = reader.encode(value);
  assert.deepEqual(reader.decode(cursor), value);
  for (const bad of ['', 'x'.repeat(2049), `${cursor}.extra`, `${cursor}x`])
    assert.throws(() => reader.decode(bad), /Invalid/);
  assert.throws(() => new SignedCursor().decode(cursor), /expired/);
});
