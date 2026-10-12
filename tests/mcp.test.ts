import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDeusServer } from '../src/mcp.js';
import { registerGitHubTools } from '../src/extension.js';
import { registerDesignerTools } from '../src/designer.js';
import type { ToolRegistrar } from '../src/tool-registry.js';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { fixture, secret, environment, program, waitFile } from './fixture.js';

async function setup(t: TestContext) {
  const { root, put } = await fixture(t);
  const app = await createDeusServer(root);
  const client = new Client({ name: 'deus-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await app.server.connect(b);
  await client.connect(a);
  t.after(async () => {
    await app.close();
    await client.close();
  });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    return JSON.parse((result.content as { text: string }[])[0]!.text);
  };
  const reject = async (name: string, args: Record<string, unknown>) =>
    assert.equal((await client.callTool({ name, arguments: args })).isError, true);
  return { root, app, client, call, reject, put };
}
const design = `---
kind: design
id: mcp
created_at: 2026-10-07
updated_at: 2026-10-07
status: confirmed
references: [README.md]
problem: Remote access is missing.
options: [MCP]
decision: Use MCP.
acceptance: [Codex can read tasks.]
---
# Remote access
`;

test('MCP exposes GitHub-only contracts and preserves host artifact access boundaries', async (t) => {
  const { root, client, call, reject } = await setup(t);
  const tools = (await client.listTools()).tools;
  assert.ok(tools.some((tool) => tool.name === 'deus_github_submit'));
  assert.ok(!tools.some((tool) => tool.name.startsWith('deus_dexter_')));
  for (const tool of tools)
    assert.deepEqual(
      [...(tool.inputSchema.required ?? [])].sort(),
      Object.keys(tool.inputSchema.properties ?? {}).sort(),
    );
  assert.equal((await call('deus_workspace_info')).workspace, root);
  for (const path of ['../escape', '/etc/passwd', '.git/config', '.env', '.dexter-local/state'])
    await reject('deus_artifact_read', { path, offset: 0, maxBytes: 100 });
  const outside = await fixture(t);
  await symlink(outside.root, join(root, 'escape'));
  await reject('deus_artifact_read', { path: 'escape/file', offset: 0, maxBytes: 100 });
  await reject('deus_github_submit', {
    repository: 'fixture/repo',
    kind: 'objective',
    title: 'Task',
    body: 'Body',
    workspace: root,
  });
  assert.equal(
    (
      await call('deus_github_submit', {
        repository: 'fixture/repo',
        kind: 'objective',
        title: 'Task',
        body: 'Body',
      })
    ).status,
    'rejected',
  );
});
test('MCP persists reports without overwriting or touching source', async (t) => {
  const { call, reject } = await setup(t);
  const content =
    '---\nkind: research\nid: sample\ncreated_at: 2026-10-07\nupdated_at: 2026-10-07\nstatus: draft\nreferences: []\nquestion: What changed?\nmode: local\nprovider: filesystem\nsources: []\ngaps: []\n---\nEvidence is incomplete.\n';
  const path = '.deus/research/sample.md';
  assert.equal((await call('deus_artifact_write', { path, content })).status, 'written');
  assert.equal(
    (await call('deus_artifact_read', { path, offset: 0, maxBytes: 4096 })).text,
    content,
  );
  for (const path of [
    '.deus/research/sample.md',
    'fs/code.ts',
    '.deus/design/x.md',
    '.deus/handoffs/x.md',
  ])
    await reject('deus_artifact_write', { path, content });
});

for (const disconnect of [false, true])
  test(`MCP ${disconnect ? 'disconnect' : 'cancellation'} reaps a fixture process without replaying its typed mutation`, async (t) => {
    const { root, client, call } = await setup(t);
    const executable = join(root, 'gh'),
      marker = join(root, 'started');
    await program(
      executable,
      `import {appendFileSync} from 'node:fs';\nconst a=process.argv.slice(2);if(a[0]==='auth')process.exit();if(a[0]==='repo'){console.log(JSON.stringify({viewerPermission:'WRITE'}));process.exit();}\nappendFileSync(${JSON.stringify(marker)},JSON.stringify(process.argv.slice(2))+'\\n');\nprocess.on('SIGTERM',()=>{appendFileSync(${JSON.stringify(marker)},'stopped\\n');process.exit(0)});\nsetInterval(()=>{},1000);\n`,
    );
    environment(t, 'PATH', root + ':' + process.env.PATH);
    environment(t, 'DEUS_GITHUB_REPOSITORIES', 'fixture/repo');
    const controller = new AbortController();
    const running = client.callTool(
      {
        name: 'deus_github_submit',
        arguments: {
          repository: 'fixture/repo',
          kind: 'objective',
          title: 'literal;$(nope)',
          body: 'Contract',
        },
      },
      undefined,
      { signal: controller.signal },
    );
    const rejected = assert.rejects(running);
    await waitFile(marker);
    if (disconnect) await client.close();
    else controller.abort();
    await rejected;
    if (!disconnect) await call('deus_workspace_info');
    const lines = (await waitFile(marker, 'stopped')).trim().split('\n');
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]!), [
      'issue',
      'create',
      '--repo',
      'fixture/repo',
      '--title',
      'literal;$(nope)',
      '--body',
      'Contract',
      '--label',
      'dexter:ready,dexter:objective',
    ]);
    assert.equal(lines[1], 'stopped');
  });

test('remote artifact pagination preserves UTF-8 and redacts before slicing across byte boundaries', async (t) => {
  const { root, call, client } = await setup(t);
  secret(t, 'private-artifact-token');
  const text = '字Привет🙂private-artifact-token end';
  const expected = text.replace('private-artifact-token', '[REDACTED]');
  await writeFile(join(root, 'unicode.txt'), text);
  await writeFile(join(root, 'invalid.txt'), Buffer.from([0x61, 0xff, 0x62]));
  const invalid = await client.callTool({
    name: 'deus_artifact_read',
    arguments: { path: 'invalid.txt', offset: 0, maxBytes: 12 },
  });
  assert.equal(invalid.isError, true);
  assert.match((invalid.content as { text: string }[])[0]!.text, /not valid UTF-8/);
  let offset: number | null = 0,
    collected = '',
    revision = '';
  while (offset !== null) {
    const part = await call('deus_artifact_read', { path: 'unicode.txt', offset, maxBytes: 4 });
    revision ||= part.sha256;
    assert.equal(part.sha256, revision);
    assert.ok(!part.text.includes('private-artifact-token'));
    collected += part.text;
    assert.ok(part.nextOffset === null || part.nextOffset > offset);
    offset = part.nextOffset;
  }
  assert.equal(collected, expected);
  for (const args of [
    { offset: 1, maxBytes: 4 },
    { offset: 0, maxBytes: 1 },
  ])
    assert.equal(
      (
        await client.callTool({
          name: 'deus_artifact_read',
          arguments: { path: 'unicode.txt', ...args },
        })
      ).isError,
      true,
    );
});

test('wire readers redact once before pagination, retaining byte limits, offsets and digest', async (t) => {
  const { root, call, put } = await setup(t);
  const raw = 'password=abcdefgh';
  const expected = 'password=[REDACTED]';
  const sha256 = createHash('sha256').update(expected).digest('hex');
  await put('sample.txt', raw);
  let offset: number | null = 0,
    collected = '';
  do {
    const page = await call('deus_artifact_read', { path: 'sample.txt', offset, maxBytes: 12 });
    const bytes = Buffer.byteLength(page.text);
    assert.ok(bytes <= 12);
    assert.equal(page.offset, offset);
    assert.equal(page.size, Buffer.byteLength(expected));
    assert.equal(page.sha256, sha256);
    assert.equal(page.digestScope, 'complete-redacted-content');
    if (page.nextOffset !== null) assert.equal(page.nextOffset, offset + bytes);
    collected += page.text;
    offset = page.nextOffset;
  } while (offset !== null);
  assert.equal(collected, expected);
  assert.equal(createHash('sha256').update(collected).digest('hex'), sha256);
});
