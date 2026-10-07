import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, secret } from './fixture.js';
import { ArtifactReader, type ArtifactKind } from '../src/artifacts.js';

test('artifact sections, defaults, UTF-8 cursors, redaction and path boundaries', async (t) => {
  const { root, put } = await fixture(t, 'forge');
  const reader = new ArtifactReader();
  const read = (kind: ArtifactKind, id: string, section?: string) =>
    reader.read(kind, { workspace: root, id, section });
  await put('issues/ISSUE-0001-example.md', '---\nid: ISSUE-0001\n---\nIssue body');
  await put('notes/ISSUE-0001/0001.md', 'OLD HISTORY');
  await put('merge_requests/MR-0001.md', '---\nid: MR-0001\n---\nMR body');
  await put('reviews/MR-0001/0001.md', 'Review evidence');
  await put('runs/RUN-abc-0001/run.json', '{"run":"RUN-abc-0001","status":"done"}');
  for (const [file, text] of [
    ['prompt', 'Assignment'],
    ['stdout', 'Transcript'],
    ['stderr', 'Diagnostics'],
    ['system', 'System'],
  ])
    await put(`runs/RUN-abc-0001/${file}.txt`, text!);
  assert.match((await read('issue', 'ISSUE-0001')).text, /Issue body/);
  assert.doesNotMatch((await read('issue', 'ISSUE-0001')).text, /OLD HISTORY/);
  assert.match((await read('issue', 'ISSUE-0001', 'notes')).text, /OLD HISTORY/);
  assert.match((await read('mr', 'MR-0001', 'reviews')).text, /Review evidence/);
  assert.match((await read('run', 'RUN-abc-0001')).text, /done/);
  for (const [section, expected] of [
    ['assignment', 'Assignment'],
    ['transcript', 'Transcript'],
    ['stderr', 'Diagnostics'],
    ['system', 'System'],
  ])
    assert.equal((await read('run', 'RUN-abc-0001', section)).text, expected);
  secret(t, 'very-private-value');
  const content = '💡é very-private-value\n'.repeat(30);
  await put('wiki/sample.md', '---\nslug: sample\n---\n' + content);
  const request = { workspace: root, id: 'sample', section: 'body', limit: 7 };
  let cursor: string | null = null,
    text = '',
    first = '';
  do {
    const page = await reader.read('wiki', { ...request, cursor });
    assert.ok(Buffer.byteLength(page.text) <= 7);
    assert.ok(!page.text.includes('�'));
    assert.ok(!JSON.stringify(page).includes(root));
    text += page.text;
    cursor = page.nextCursor;
    first ||= cursor ?? '';
  } while (cursor);
  assert.equal(text, content.replaceAll('very-private-value', '[REDACTED]'));
  for (const p of [
    { ...request, section: 'metadata', cursor: first },
    { ...request, cursor: first + 'x' },
    { ...request, id: '../secret' },
    { ...request, limit: 20000 },
  ])
    await assert.rejects(reader.read('wiki', p));
  await assert.rejects(new ArtifactReader().read('wiki', { ...request, cursor: first }), /expired/);
  await put('wiki/sample.md', '---\nslug: sample\n---\nchanged');
  await assert.rejects(reader.read('wiki', { ...request, cursor: first }), /changed/);
  await assert.rejects(read('run', 'RUN-abc-9999'));
  await put('wiki/bad.md', '---\nslug: other\n---\nwrong');
  await assert.rejects(read('wiki', 'bad'), /identity/);
  await writeFile(join(root, 'outside.md'), 'private');
  await symlink(join(root, 'outside.md'), join(root, 'forge/wiki/escape.md'));
  await assert.rejects(read('wiki', 'escape'), /escapes/);
});
