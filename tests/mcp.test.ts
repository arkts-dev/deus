import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDeusServer } from '../src/mcp.js';
import { DexterPlugin } from '../src/dexter.js';
import { registerDexterTools } from '../src/extension.js';
import { registerDesignerTools } from '../src/designer.js';
import { registerBoardTools } from '../src/board.js';
import type { ToolRegistrar } from '../src/tool-registry.js';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { fixture, secret, environment, trust, program, waitFile } from './fixture.js';

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

test('MCP exposes current typed tools and original skills with accurate annotations and workspace binding', async (t) => {
  const { root, client, call, reject } = await setup(t);
  const tools = (await client.listTools()).tools;
  const names = tools.map((tool) => tool.name);
  const shared: string[] = [];
  const registry: ToolRegistrar = {
    registerTool: (tool) => {
      shared.push(tool.name);
    },
  };
  for (const register of [registerDexterTools, registerDesignerTools, registerBoardTools])
    register(registry);
  assert.deepEqual(
    names.sort(),
    [
      ...shared,
      'deus_workspace_info',
      'deus_skill_read',
      'deus_artifact_list',
      'deus_artifact_read',
      'deus_artifact_write',
    ].sort(),
  );
  for (const tool of tools)
    assert.deepEqual(
      [...(tool.inputSchema.required ?? [])].sort(),
      Object.keys(tool.inputSchema.properties ?? {}).sort(),
      tool.name,
    );
  await reject('deus_artifact_read', { path: 'README.md' });
  await reject('deus_artifact_list', { path: '.' });
  assert.ok(!names.includes('deus_dexter_exec'));
  assert.ok(!names.some((name) => name.startsWith('deus_board_')));
  for (const suffix of [
    'probe',
    'issues_live',
    'issues_plan',
    'issue_read',
    'mr_read',
    'wiki_read',
    'run_read',
    'bots_live',
    'events_read',
    'metrics',
  ])
    assert.equal(
      tools.find((tool) => tool.name === `deus_dexter_${suffix}`)!.annotations!.readOnlyHint,
      true,
    );
  assert.equal(
    tools.find((tool) => tool.name === 'deus_dexter_issue_close')!.annotations!.readOnlyHint,
    false,
  );
  const metricsArgs = {
    workspace: root,
    since: '2026-01-01',
    until: '2026-01-02',
    utcOffsetMinutes: 180,
  };
  const unavailable = await client.callTool({
    name: 'deus_dexter_metrics',
    arguments: metricsArgs,
  });
  assert.equal(unavailable.isError, true);
  assert.ok(!JSON.stringify(unavailable).includes(root));
  for (const path of ['forge/runs', 'forge/reviews'])
    await mkdir(join(root, path), { recursive: true });
  const metrics = await call('deus_dexter_metrics', metricsArgs);
  assert.equal(metrics.days[0].runs.total.starts, 0);
  assert.deepEqual(metrics.days[0].runs.byRole, {});
  assert.deepEqual(metrics.days[0].workspaceActivity.reviewVerdicts, {});
  await reject('deus_dexter_metrics', { ...metricsArgs, role: 'all' });
  assert.equal(metrics.utcOffsetMinutes, 180);
  assert.ok(!JSON.stringify(metrics).includes(root));
  assert.ok(!JSON.stringify(metrics).includes('forge/'));
  await reject('deus_dexter_metrics', { ...metricsArgs, workspace: '/client/not-server' });
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
    { workspace: '/elsewhere', issue: 'ISSUE-0001' },
    { workspace: root, issue: '../escape' },
    { workspace: root, issue: 'ISSUE-0001', extra: true },
    { workspace: root, issue: 1 },
  ])
    await reject('deus_dexter_issue_nudge', args);
  await reject('deus_dexter_exec', {});
  await reject('absent', {});
});

test('MCP preserves trust refusal, reader pagination and web no-model behavior', async (t) => {
  const { root, call, put } = await setup(t);
  trust(t, DexterPlugin.prototype, false);
  for (const [name, args] of [
    ['deus_dexter_submit', { title: 'task', body: '', workspace: root }],
    [
      'deus_dexter_issue_create',
      { title: 'task', body: '', workspace: root, parent: null, dependencies: [], priority: 3 },
    ],
    [
      'deus_dexter_issue_close',
      { workspace: root, issue: 'ISSUE-0001', reason: 'NOISE', successor: null, confirm: true },
    ],
  ] as const) {
    const receipt = await call(name, args);
    assert.equal(receipt.status, 'rejected');
    assert.equal(receipt.profile, 'unknown');
  }
  await put('forge/wiki/sample.md', '---\nslug: sample\n---\n' + 'reader evidence '.repeat(30));
  const request = { workspace: root, slug: 'sample', section: 'body', cursor: null, limit: 16 };
  const first = await call('deus_dexter_wiki_read', request);
  const second = await call('deus_dexter_wiki_read', { ...request, cursor: first.nextCursor });
  assert.equal(second.revision, first.revision);
  for (const seq of [1, 2])
    await put(
      `bus/00000${seq}-run.started.md`,
      `---\nseq: ${seq}\nts: 2026-10-07T07:00:00Z\ntype: run.started\n---\n`,
    );
  const events = await call('deus_dexter_events_read', { workspace: root, cursor: null, limit: 1 });
  assert.equal(events.events[0].seq, 2);
  assert.equal(
    (
      await call('deus_dexter_events_read', {
        workspace: root,
        cursor: events.nextCursor,
        limit: 20,
      })
    ).events[0].seq,
    1,
  );
  await put('dexter.config.json', '{}');
  for (const dir of ['forge/bots', 'forge/.claims'])
    await mkdir(join(root, dir), { recursive: true });
  assert.deepEqual((await call('deus_dexter_bots_live', { workspace: root })).bots, []);
  t.mock.method(ModelRuntime, 'create', async () => ({ getAvailableSnapshot: () => [] }));
  assert.deepEqual(
    await call('deus_research_web', { question: 'Public offline question', provider: 'fetch' }),
    { status: 'unavailable', reason: 'No model configured' },
  );
});

test('MCP writes designs once, reads artifacts, and rejects path escapes including renamed board tools', async (t) => {
  const { root, client, call, reject } = await setup(t);
  const outside = await fixture(t);
  await symlink(outside.root, join(root, 'escape'));
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
  assert.equal(
    (await call('deus_artifact_read', { path: '.deus/design/mcp.md', offset: 0, maxBytes: 4096 }))
      .text,
    design,
  );
  assert.equal(
    (await call('deus_artifact_list', { path: '.deus/design', offset: 0 })).entries[0].name,
    'mcp.md',
  );
  for (const path of [
    '../outside',
    '/etc/passwd',
    'escape/x',
    'forge/issues/x',
    'bus/x',
    'fs/../forge/x',
    '.git/config',
    '.env',
    'dexter.config.json',
  ])
    await reject('deus_artifact_read', { path, offset: 0, maxBytes: 4096 });
  for (const path of ['escape/x.md', 'bus/design.md', '.git/design.md', '.env']) {
    await reject('deus_design_write', { path, content: design });
    await reject('deus_design_write', { path: ` ${path} `, content: design });
  }
  await assert.rejects(readFile(join(outside.root, 'x.md')), { code: 'ENOENT' });
  assert.equal(
    (await call('deus_design_check', { path: ' .deus/design/trimmed.md ', content: design })).path,
    '.deus/design/trimmed.md',
  );
  await mkdir(join(root, 'forge'));
  await symlink(outside.root, join(root, 'forge/issues'));
  for (const name of [
    'deus_dexter_issues_live',
    'deus_dexter_issues_plan',
    'deus_dexter_issue_close',
  ])
    await reject(
      name,
      name.endsWith('close')
        ? { workspace: root, issue: 'ISSUE-0001', reason: 'NOISE', successor: null, confirm: true }
        : { workspace: root, cursor: null, limit: 20 },
    );
});

test('MCP preserves board planning, close confirmation and trusted mutation receipts', async (t) => {
  const { root, call, reject, put } = await setup(t);
  trust(t);
  await put(
    'forge/issues/ISSUE-0001.md',
    '---\nid: ISSUE-0001\nkind: task\nstatus: open\nparent: ISSUE-0000\nworkdir: null\nmr: null\nassignee: null\ndepends_on: []\n---\nCoverage is 100%.\n',
  );
  await put(
    'forge/issues/ISSUE-0000.md',
    '---\nid: ISSUE-0000\nkind: epic\nstatus: open\nparent: null\ndepends_on: []\n---\nCompiler rejects invalid programs.\n',
  );
  assert.equal(
    (await call('deus_dexter_issues_live', { workspace: root, cursor: null, limit: 20 })).records
      .length,
    2,
  );
  assert.ok(
    (await call('deus_dexter_issues_plan', { workspace: root, cursor: null, limit: 20 })).records,
  );
  const page = await call('deus_dexter_issues_live', { workspace: root, cursor: null, limit: 1 });
  assert.equal(page.records.length, 1);
  const next = await call('deus_dexter_issues_live', {
    workspace: root,
    cursor: page.nextCursor,
    limit: 1,
  });
  assert.equal(next.records.length, 1);
  assert.notEqual(page.records[0].id, next.records[0].id);
  await reject('deus_dexter_issues_plan', { workspace: root, cursor: page.nextCursor, limit: 1 });
  const args = { workspace: root, issue: 'ISSUE-0001', reason: 'NOISE', successor: null };
  await reject('deus_dexter_issue_close', args);
  assert.equal(
    (await call('deus_dexter_issue_close', { ...args, confirm: false })).status,
    'rejected',
  );
  assert.equal(
    (await call('deus_dexter_issue_close', { ...args, confirm: true })).status,
    'completed',
  );
  await reject('deus_dexter_issues_live', { workspace: root, cursor: page.nextCursor, limit: 1 });
  assert.equal(
    (await call('deus_dexter_issues_live', { workspace: root, cursor: null, limit: 20 })).records
      .length,
    1,
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
    const executable = join(root, 'fixture.mjs'),
      marker = join(root, 'started');
    await program(
      executable,
      `import {appendFileSync} from 'node:fs';\nappendFileSync(${JSON.stringify(marker)},JSON.stringify(process.argv.slice(2))+'\\n');\nprocess.on('SIGTERM',()=>{appendFileSync(${JSON.stringify(marker)},'stopped\\n');process.exit(0)});\nsetInterval(()=>{},1000);\n`,
    );
    environment(t, 'DEXTER_BIN', executable);
    trust(t);
    const controller = new AbortController();
    const running = client.callTool(
      {
        name: 'deus_dexter_submit',
        arguments: { title: 'literal;$(nope)', body: '', workspace: root },
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
      'submit',
      `--dir=${root}`,
      '--body=',
      '--',
      'literal;$(nope)',
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

  await put('forge/wiki/sample.md', '---\nslug: sample\n---\n' + raw);
  let cursor: string | null = null;
  collected = '';
  do {
    const page = await call('deus_dexter_wiki_read', {
      workspace: root,
      slug: 'sample',
      section: 'body',
      cursor,
      limit: 12,
    });
    assert.ok(Buffer.byteLength(page.text) <= 12);
    assert.equal(page.revision, sha256);
    collected += page.text;
    cursor = page.nextCursor;
  } while (cursor !== null);
  assert.equal(collected, expected);
});
