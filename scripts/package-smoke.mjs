import assert from 'node:assert/strict';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runProcess, succeeded } from '../dist/process.js';

const root = await realpath(await mkdtemp(join(tmpdir(), 'deus-package-')));
try {
  const packed = await runProcess('npm', ['pack', '--json', '--pack-destination', root], {
    cwd: process.cwd(),
    timeoutMs: 120_000,
  });
  assert.ok(succeeded(packed), packed.stderr);
  const info = JSON.parse(packed.stdout)[0];
  const paths = info.files.map((file) => file.path);
  for (const path of [
    'dist/extension.js',
    'dist/designer.js',
    'dist/board.js',
    'dist/dexter.js',
    'dist/operations.js',
    'dist/mcp.js',
    'dist/mcp-cli.js',
    'dist/research.js',
    'prompts/kernel.md',
    'skills.lock.json',
    'LICENSE',
    'NOTICE',
    'THIRD_PARTY_NOTICES.md',
    ...[
      'dexter-control',
      'designer',
      'product-control',
      'web-research',
      'local-research',
      'simplify-review',
    ].map((name) => `skills/${name}/SKILL.md`),
  ])
    assert.ok(paths.includes(path), path);
  const legacyProductName = ['arke', 'str'].join('');
  assert.ok(!paths.includes(`dist/${legacyProductName}.js`));
  assert.ok(!paths.some((path) => path.startsWith(`skills/${legacyProductName}-control/`)));
  assert.ok(
    !paths.some((path) =>
      /(^docs\/|^examples\/|avatar|bootstrap|dist\/cli\.|dist\/manager\.|dist\/workflow|^src\/)/.test(
        path,
      ),
    ),
    paths.join('\n'),
  );
  const installed = await runProcess(
    'npm',
    ['install', '--prefix', join(root, 'install'), '--ignore-scripts', join(root, info.filename)],
    { cwd: root, timeoutMs: 120_000 },
  );
  assert.ok(succeeded(installed), installed.stderr);
  const packageDir = join(root, 'install/node_modules/deus-ex-machina');
  const kernel = await readFile(join(packageDir, 'prompts/kernel.md'), 'utf8');
  assert.ok(kernel.includes('`deus_dexter_*` API is the sole mechanism for mutating'));
  assert.ok(kernel.includes('For reading, `deus_dexter_*` are preferred'));
  assert.ok(kernel.includes('if they are insufficient, ordinary read-only tools are allowed'));
  assert.ok(
    kernel.includes(
      'If `profile` is `unknown`, any mutation of the Dexter workspace is prohibited',
    ),
  );
  assert.ok(kernel.includes('Never retry failed mutations automatically'));
  const control = await readFile(join(packageDir, 'skills/dexter-control/SKILL.md'), 'utf8');
  for (const name of ['issues_live', 'issues_plan', 'issue_close'])
    assert.ok(control.includes(`deus_dexter_${name}`));
  assert.ok(control.includes('Read-only operations are allowed as usual'));
  assert.ok(control.includes('report the gap and leave Dexter state unchanged'));
  const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
  assert.equal(manifest.version, '0.3.0');
  assert.equal(manifest.license, 'Apache-2.0');
  assert.deepEqual(manifest.bin, { 'deus-mcp': 'dist/mcp-cli.js' });
  assert.deepEqual(manifest.pi.skills, ['skills']);
  const { loadSkillsFromDir } = await import('@earendil-works/pi-coding-agent');
  const discovered = loadSkillsFromDir({
    dir: join(packageDir, 'skills'),
    source: 'installed-deus',
  });
  assert.deepEqual(discovered.skills.map((skill) => skill.name).sort(), [
    'designer',
    'dexter-control',
    'local-research',
    'product-control',
    'simplify-review',
    'web-research',
  ]);
  assert.equal(discovered.diagnostics.length, 0);
  const { default: extension } = await import(
    pathToFileURL(join(packageDir, 'dist/extension.js')).href
  );
  const { default: designer } = await import(
    pathToFileURL(join(packageDir, 'dist/designer.js')).href
  );
  const { default: board } = await import(pathToFileURL(join(packageDir, 'dist/board.js')).href);
  const tools = [];
  const hooks = [];
  const register = { registerTool: (tool) => tools.push(tool), on: (name) => hooks.push(name) };
  extension(register);
  designer(register);
  board(register);
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    'deus_design_check',
    'deus_design_write',
    'deus_dexter_architecture_accept',
    'deus_dexter_bots_live',
    'deus_dexter_events_read',
    'deus_dexter_issue_close',
    'deus_dexter_issue_create',
    'deus_dexter_issue_nudge',
    'deus_dexter_issue_read',
    'deus_dexter_issue_relink',
    'deus_dexter_issue_reprioritize',
    'deus_dexter_issues_live',
    'deus_dexter_issues_plan',
    'deus_dexter_mr_read',
    'deus_dexter_probe',
    'deus_dexter_run_read',
    'deus_dexter_submit',
    'deus_dexter_wiki_read',
    'deus_research_web',
  ]);
  for (const tool of tools)
    assert.deepEqual(
      [...(tool.parameters.required ?? [])].sort(),
      Object.keys(tool.parameters.properties ?? {}).sort(),
      `${tool.name}: packaged fields must have explicit values`,
    );
  const { Value } = await import('typebox/value');
  assert.ok(
    Value.Check(tools.find((tool) => tool.name === 'deus_dexter_issue_create').parameters, {
      workspace: root,
      title: 'Standalone task',
      body: 'Contract',
      parent: null,
      dependencies: [],
      priority: 3,
    }),
  );
  assert.ok(!tools.some((tool) => tool.name.startsWith(`deus_${legacyProductName}_`)));
  assert.deepEqual(hooks, ['before_agent_start']);
  const fake = join(root, 'dexter-fake.mjs');
  const callsPath = join(root, 'dexter-calls.jsonl');
  await writeFile(
    fake,
    `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';\nconst argv = process.argv.slice(2);\nappendFileSync(${JSON.stringify(callsPath)}, JSON.stringify(argv)+'\\n');\nconsole.log(argv[0] === 'status' ? 'fixture board' : 'unknown fixture');\nif (argv[0] === 'status') process.exitCode = 9;\n`,
  );
  await chmod(fake, 0o755);
  const priorDexter = process.env.DEXTER_BIN;
  const priorPath = process.env.PATH;
  const legacyEnvName = ['ARKESTR', 'BIN'].join('_');
  const priorLegacy = process.env[legacyEnvName];
  const priorTrusted = process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS;
  process.env.DEXTER_BIN = fake;
  process.env[legacyEnvName] = join(root, 'must-not-be-used');
  delete process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS;
  const invoke = async (name, parameters) => {
    const definition = tools.find((tool) => tool.name === name);
    assert.ok(definition, name);
    assert.ok(Value.Check(definition.parameters, parameters), `${name}: invalid smoke input`);
    const response = await definition.execute('smoke', parameters, undefined, () => {}, {
      cwd: root,
    });
    return JSON.parse(response.content[0].text);
  };
  try {
    const design = await invoke('deus_design_check', {
      path: '.deus/design/performance.md',
      content: `---
kind: design
id: performance
created_at: 2026-01-01T00:00:00Z
updated_at: 2026-01-01T00:00:00Z
status: draft
references:
  - tools/gate-manifest.sh
problem: Reduce latency by 25% without reducing coverage.
options:
  - Reuse compiled artifacts.
decision: Cache builds, not test verdicts.
acceptance:
  - Exit codes and behavioral assertions remain unchanged.
---
## Objective
Reduce test latency.
## Invariants
Every requested scenario executes.
## Boundaries
Compiler semantics remain unchanged.
## Decisions
Reuse immutable build products.
## Acceptance
Cold and warm execution times improve.
## References
tools/gate-manifest.sh
`,
    });
    assert.equal(design.ok, true);
    assert.deepEqual(design.errors, []);
    assert.deepEqual(design.warnings, []);
    const shippedDesigner = await readFile(join(packageDir, 'skills/designer/SKILL.md'), 'utf8');
    assert.ok(shippedDesigner.includes('user confirmation before writing'));
    assert.ok(shippedDesigner.includes('designer does not implement or prototype'));
    const probe = await invoke('deus_dexter_probe', { diagnostics: false });
    assert.equal(probe.profile, 'unknown');
    assert.ok(probe.reasons.length > 0);
    const blocked = await invoke('deus_dexter_issue_nudge', {
      issue: 'ISSUE-0001',
      workspace: root,
    });
    assert.equal(blocked.status, 'rejected');
    assert.equal(blocked.profile, 'unknown');
    assert.equal(blocked.exitCode, null);
    const closure = await invoke('deus_dexter_issue_close', {
      workspace: root,
      issue: 'ISSUE-0001',
      reason: 'NOISE',
      successor: null,
      confirm: true,
    });
    assert.equal(closure.status, 'rejected');
    assert.equal(closure.profile, 'unknown');
    await mkdir(join(root, 'forge/wiki'), { recursive: true });
    await writeFile(
      join(root, 'forge/wiki/sample.md'),
      '---\nslug: sample\ntitle: Sample\n---\n\n' + 'reader evidence '.repeat(500),
    );
    const page = await invoke('deus_dexter_wiki_read', {
      workspace: root,
      slug: 'sample',
      section: 'body',
      cursor: null,
      limit: 128,
    });
    assert.equal(Buffer.byteLength(page.text), 128);
    assert.ok(page.nextCursor);
    const continuation = await invoke('deus_dexter_wiki_read', {
      workspace: root,
      slug: 'sample',
      section: 'body',
      limit: 128,
      cursor: page.nextCursor,
    });
    assert.equal(continuation.revision, page.revision);
    assert.equal(JSON.stringify(page).includes(root), false);
    await writeFile(join(root, 'dexter.config.json'), '{}');
    for (const dir of ['forge/bots', 'forge/.claims', 'bus'])
      await mkdir(join(root, dir), { recursive: true });
    const ownership = await invoke('deus_dexter_bots_live', { workspace: root });
    assert.deepEqual(ownership.bots, []);
    assert.deepEqual(ownership.claims, []);
    for (const seq of [1, 2])
      await writeFile(
        join(root, `bus/00000${seq}-run.started.md`),
        `---\nseq: ${seq}\nts: 2026-01-01T00:00:00Z\ntype: run.started\n---\n`,
      );
    const recent = await invoke('deus_dexter_events_read', {
      workspace: root,
      cursor: null,
      limit: 1,
    });
    assert.equal(recent.events[0].seq, 2);
    const older = await invoke('deus_dexter_events_read', {
      workspace: root,
      cursor: recent.nextCursor,
      limit: 20,
    });
    assert.equal(older.events[0].seq, 1);
    assert.equal(older.nextCursor, null);
    let calls = [];
    try {
      calls = (await readFile(callsPath, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    assert.equal(calls.filter((argv) => argv[0] === 'nudge-issue').length, 0);

    delete process.env.DEXTER_BIN;
    if (process.env.DEUS_TEST_NO_CLI === '1') {
      const fakeDefault = join(root, 'dexter');
      await copyFile(fake, fakeDefault);
      await chmod(fakeDefault, 0o755);
      process.env.PATH = `${root}${delimiter}${priorPath ?? ''}`;
      const defaultProbe = await invoke('deus_dexter_probe', { diagnostics: false });
      assert.equal(defaultProbe.executable, 'dexter');
      assert.equal(defaultProbe.profile, 'unknown');
      assert.ok(defaultProbe.reasons.length > 0);
    } else {
      if (priorTrusted !== undefined) process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS = priorTrusted;
      const native = await invoke('deus_dexter_probe', { diagnostics: false });
      assert.equal(native.executable, 'dexter');
      assert.equal(
        native.profile,
        process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS ? 'dexter-signed' : 'unknown',
      );
    }
  } finally {
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
    if (priorDexter === undefined) delete process.env.DEXTER_BIN;
    else process.env.DEXTER_BIN = priorDexter;
    if (priorLegacy === undefined) delete process.env[legacyEnvName];
    else process.env[legacyEnvName] = priorLegacy;
    if (priorTrusted === undefined) delete process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS;
    else process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS = priorTrusted;
  }
  const installedSdk = await import(
    pathToFileURL(join(root, 'install/node_modules/@earendil-works/pi-coding-agent/dist/index.js'))
      .href
  );
  const originalCreate = installedSdk.ModelRuntime.create;
  installedSdk.ModelRuntime.create = async () => ({ getAvailableSnapshot: () => [] });
  try {
    const web = await invoke('deus_research_web', {
      question: 'Public offline smoke',
      provider: 'fetch',
    });
    assert.deepEqual(web, { status: 'unavailable', reason: 'No model configured' });
    assert.ok(!('jobId' in web));
  } finally {
    installedSdk.ModelRuntime.create = originalCreate;
  }
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const executable = join(root, 'install/node_modules/.bin/deus-mcp');
  const help = await runProcess(executable, ['--help'], { cwd: root });
  assert.ok(succeeded(help), help.stderr);
  assert.match(help.stdout, /--workspace/);
  const mcp = new Client({ name: 'deus-package-smoke', version: '1' });
  const transport = new StdioClientTransport({
    command: executable,
    args: ['--workspace', root],
    env: { ...process.env, DEUS_DEXTER_TRUSTED_FINGERPRINTS: '' },
    stderr: 'pipe',
  });
  try {
    await mcp.connect(transport);
    assert.deepEqual(
      (await mcp.listTools()).tools.map((tool) => tool.name).sort(),
      [
        ...tools.map((tool) => tool.name),
        'deus_workspace_info',
        'deus_skill_read',
        'deus_artifact_list',
        'deus_artifact_read',
        'deus_artifact_write',
      ].sort(),
    );
    const call = async (name, args = {}) => {
      const result = await mcp.callTool({ name, arguments: args });
      assert.ok(!result.isError, JSON.stringify(result));
      return JSON.parse(result.content[0].text);
    };
    assert.equal((await call('deus_workspace_info')).workspace, root);
    const skill = await mcp.callTool({ name: 'deus_skill_read', arguments: { name: 'designer' } });
    assert.equal(
      skill.content[0].text,
      await readFile(join(packageDir, 'skills/designer/SKILL.md'), 'utf8'),
    );
    assert.equal(
      (await call('deus_dexter_issue_nudge', { workspace: root, issue: 'ISSUE-0001' })).status,
      'rejected',
    );
    assert.equal(
      (await call('deus_dexter_events_read', { workspace: root, cursor: null, limit: 1 })).events[0]
        .seq,
      2,
    );
    assert.equal(
      (
        await mcp.callTool({
          name: 'deus_dexter_issues_live',
          arguments: { workspace: '/elsewhere' },
        })
      ).isError,
      true,
    );
  } finally {
    await mcp.close();
  }
  const { verifySkillIntegrity } = await import(
    pathToFileURL(join(packageDir, 'dist/resources.js')).href
  );
  assert.equal(await verifySkillIntegrity(), 6);
  console.log(
    JSON.stringify(
      {
        passed: true,
        artifact: info.filename,
        files: paths.length,
        tools: tools.map((tool) => tool.name),
        exercised: [
          'designer product constraints accepted and confirmation guidance shipped',
          'DEXTER_BIN precedence',
          process.env.DEUS_TEST_NO_CLI === '1'
            ? 'legacy override ignored; default dexter name resolves the PATH fixture'
            : 'legacy override ignored; native dexter discovered on PATH',
          'unknown-profile typed mutation and direct closure blocked',
          'bounded reader continuation without CLI execution',
          'unknown-profile bot ownership and event continuation without CLI execution',
          'foreground no-model web',
          'installed MCP executable, current tool discovery, workspace binding, skills and typed trust refusal',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
