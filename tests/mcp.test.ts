import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDeusServer } from '../src/mcp.js';
import { DexterPlugin, COMMANDS } from '../src/dexter.js';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';

async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'deus-mcp-'));
  const app = await createDeusServer(root);
  const client = new Client({ name: 'deus-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await app.server.connect(b);
  await client.connect(a);
  t.after(async () => {
    await app.close();
    await client.close();
    await rm(root, { recursive: true, force: true });
  });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    return JSON.parse((result.content as { text: string }[])[0]!.text);
  };
  return { root, app, client, call };
}
const design = `---
kind: design
id: mcp
created_at: 2026-10-05
updated_at: 2026-10-05
status: confirmed
references: [README.md]
problem: Remote access is missing.
options: [MCP]
decision: Use MCP.
acceptance: [Codex can read tasks.]
---
# Remote access
`;

test('MCP exposes all original tools and original skills, bound to the server workspace', async (t) => {
  const { root, client, call } = await setup(t);
  const names = (await client.listTools()).tools.map((tool) => tool.name);
  for (const name of [
    'deus_dexter_probe',
    'deus_dexter_exec',
    'deus_research_web',
    'deus_design_check',
    'deus_design_write',
    'deus_board_live',
    'deus_board_plan',
    'deus_board_close',
  ])
    assert.ok(names.includes(name));
  const info = await call('deus_workspace_info');
  assert.equal(info.workspace, root);
  assert.equal(info.skills.length, 6);
  for (const name of info.skills) {
    const result = await client.callTool({ name: 'deus_skill_read', arguments: { name } });
    assert.equal(
      (result.content as { text: string }[])[0]!.text,
      await readFile(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8'),
    );
  }
  for (const args of [
    { command: 'status', args: [], workspace: '/elsewhere' },
    { command: 'config', args: [], workspace: root },
    { command: 'status', args: [], workspace: root, extra: true },
    { command: 'status', args: 'bad', workspace: root },
  ]) {
    assert.equal(
      (await client.callTool({ name: 'deus_dexter_exec', arguments: args })).isError,
      true,
    );
  }
  assert.equal((await client.callTool({ name: 'absent', arguments: {} })).isError, true);
});

test('MCP preserves trust refusal and web no-model behavior', async (t) => {
  const { root, call } = await setup(t);
  t.mock.method(DexterPlugin.prototype, 'probe', async () => ({
    profile: 'unknown',
    supportedCommands: [],
    diagnostics: {},
    reasons: ['test: unsigned'],
  }));
  assert.equal(
    (await call('deus_dexter_exec', { command: 'submit', args: ['task'], workspace: root })).status,
    'blocked_unknown_profile',
  );
  t.mock.method(ModelRuntime, 'create', async () => ({ getAvailableSnapshot: () => [] }));
  assert.deepEqual(
    await call('deus_research_web', { question: 'Public offline question', provider: 'fetch' }),
    { status: 'unavailable', reason: 'No model configured' },
  );
});

test('MCP writes designs once, reads artifacts, and prevents path escapes', async (t) => {
  const { root, client, call } = await setup(t);
  const outside = await mkdtemp(join(tmpdir(), 'deus-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, join(root, 'escape'));
  assert.equal(
    (await call('deus_design_check', { path: '.deus/design/mcp.md', content: design })).ok,
    true,
  );
  const responses = await Promise.all(
    [1, 2].map(() =>
      client.callTool({
        name: 'deus_design_write',
        arguments: { path: '.deus/design/mcp.md', content: design },
      }),
    ),
  );
  assert.equal(responses.filter((r) => r.isError).length, 1);
  assert.equal((await call('deus_artifact_read', { path: '.deus/design/mcp.md' })).text, design);
  assert.equal(
    (await call('deus_artifact_list', { path: '.deus/design' })).entries[0].name,
    'mcp.md',
  );
  for (const path of [
    '../outside',
    '/etc/passwd',
    'escape/x',
    'forge/issues/x',
    'fs/../forge/x',
    '.git/config',
    '.env',
  ]) {
    assert.equal(
      (await client.callTool({ name: 'deus_artifact_read', arguments: { path } })).isError,
      true,
      path,
    );
  }
  assert.equal(
    (
      await client.callTool({
        name: 'deus_design_write',
        arguments: { path: 'escape/x.md', content: design },
      })
    ).isError,
    true,
  );
  await mkdir(join(root, 'forge'));
  await symlink(outside, join(root, 'forge/issues'));
  assert.equal(
    (await client.callTool({ name: 'deus_board_live', arguments: { workspace: root } })).isError,
    true,
  );
});

test('MCP preserves board planning and explicit close confirmation', async (t) => {
  const { root, client, call } = await setup(t);
  await mkdir(join(root, 'forge/issues'), { recursive: true });
  await writeFile(
    join(root, 'forge/issues/ISSUE-0001.md'),
    '---\nid: ISSUE-0001\nkind: task\nstatus: open\nparent: ISSUE-0000\nworkdir: null\nmr: null\nassignee: null\ndepends_on: []\n---\nCoverage is 100%.\n',
  );
  await writeFile(
    join(root, 'forge/issues/ISSUE-0000.md'),
    '---\nid: ISSUE-0000\nkind: epic\nstatus: open\nparent: null\ndepends_on: []\n---\nCompiler rejects invalid programs.\n',
  );
  assert.equal((await call('deus_board_live', { workspace: root })).issues.length, 2);
  assert.ok((await call('deus_board_plan', { workspace: root })).classifications);
  assert.equal(
    (
      await call('deus_board_close', {
        workspace: root,
        issue: 'ISSUE-0001',
        reason: 'NOISE',
        confirm: false,
      })
    ).status,
    'refused',
  );
  assert.equal(
    (
      await client.callTool({
        name: 'deus_board_close',
        arguments: { workspace: root, issue: 'ISSUE-0001', reason: 'NOISE' },
      })
    ).isError,
    true,
  );
  assert.equal(
    (
      await call('deus_board_close', {
        workspace: root,
        issue: 'ISSUE-0001',
        reason: 'NOISE',
        confirm: true,
      })
    ).status,
    'applied',
  );
  assert.equal((await call('deus_board_live', { workspace: root })).issues.length, 1);
});

test('MCP persists research and handoffs without overwriting or touching source', async (t) => {
  const { client, call } = await setup(t);
  const content =
    '---\nkind: research\nid: sample\ncreated_at: 2026-10-05\nupdated_at: 2026-10-05\nstatus: draft\nreferences: []\nquestion: What changed?\nmode: local\nprovider: filesystem\nsources: []\ngaps: []\n---\nEvidence is incomplete.\n';
  const path = '.deus/research/sample.md';
  assert.equal((await call('deus_artifact_write', { path, content })).status, 'written');
  assert.equal((await call('deus_artifact_read', { path })).text, content);
  for (const args of [
    { path, content },
    { path: 'fs/code.ts', content },
    { path: '.deus/design/x.md', content },
    { path: '.deus/handoffs/x.md', content },
  ])
    assert.equal(
      (await client.callTool({ name: 'deus_artifact_write', arguments: args })).isError,
      true,
    );
});

test('MCP cancellation stops a real child process and never retries its mutation', async (t) => {
  const { root, client, call } = await setup(t);
  const executable = join(root, 'fixture.mjs');
  const marker = join(root, 'started');
  await writeFile(
    executable,
    `#!${process.execPath}\nimport {appendFileSync} from 'node:fs';\nappendFileSync(${JSON.stringify(marker)},JSON.stringify(process.argv.slice(2))+'\\n');\nsetInterval(()=>{},1000);\n`,
  );
  await chmod(executable, 0o755);
  const prior = process.env.DEXTER_BIN;
  process.env.DEXTER_BIN = executable;
  t.after(() => {
    if (prior === undefined) delete process.env.DEXTER_BIN;
    else process.env.DEXTER_BIN = prior;
  });
  t.mock.method(DexterPlugin.prototype, 'probe', async () => ({
    executable,
    profile: 'dexter-signed',
    baselineRevision: 'fixture',
    supportedCommands: COMMANDS,
    diagnostics: {},
    reasons: [],
  }));
  const controller = new AbortController();
  const running = client.callTool(
    {
      name: 'deus_dexter_exec',
      arguments: { command: 'run', args: ['literal;$(nope)'], workspace: root },
    },
    undefined,
    { signal: controller.signal },
  );
  const rejected = assert.rejects(running);
  for (let i = 0; i < 200; i++) {
    try {
      await readFile(marker);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  assert.ok(await readFile(marker));
  controller.abort();
  await rejected;
  // A queued call completes only after the aborted process has been reaped.
  await call('deus_workspace_info');
  assert.deepEqual(
    (await readFile(marker, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
    [['run', 'literal;$(nope)', '--dir', root]],
  );
});

test('remote artifact pagination preserves UTF-8 evidence across byte boundaries', async (t) => {
  const { root, call } = await setup(t);
  const text = '字Привет🙂end';
  await writeFile(join(root, 'unicode.txt'), text);
  let offset: number | null = 0;
  let collected = '';
  while (offset !== null) {
    const part = await call('deus_artifact_read', { path: 'unicode.txt', offset, maxBytes: 4 });
    collected += part.text;
    assert.ok(part.nextOffset === null || part.nextOffset > offset);
    offset = part.nextOffset;
  }
  assert.equal(collected, text);
});
