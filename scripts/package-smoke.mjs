import assert from 'node:assert/strict';
import { chmod, copyFile, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
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
  const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
  assert.equal(manifest.version, '0.3.0');
  assert.equal(manifest.license, 'Apache-2.0');
  assert.equal(manifest.bin, undefined);
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
    'deus_board_close',
    'deus_board_plan',
    'deus_board_snapshot',
    'deus_design_check',
    'deus_design_write',
    'deus_dexter_exec',
    'deus_dexter_probe',
    'deus_research_web',
  ]);
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
  process.env.DEXTER_BIN = fake;
  process.env[legacyEnvName] = join(root, 'must-not-be-used');
  const invoke = async (name, parameters) => {
    const definition = tools.find((tool) => tool.name === name);
    assert.ok(definition, name);
    const response = await definition.execute('smoke', parameters, undefined, () => {}, {
      cwd: root,
    });
    return JSON.parse(response.content[0].text);
  };
  try {
    const probe = await invoke('deus_dexter_probe', {});
    assert.equal(probe.profile, 'unknown');
    assert.match(probe.diagnostics.version.stdout, /unknown fixture/);
    const status = await invoke('deus_dexter_exec', {
      command: 'status',
      args: [],
      workspace: root,
    });
    assert.equal(status.status, 'blocked_unknown_profile');
    assert.equal(status.profile, 'unknown');
    assert.equal(status.raw, undefined);
    const blocked = await invoke('deus_dexter_exec', {
      command: 'cmd',
      args: ['text'],
      workspace: root,
    });
    assert.equal(blocked.status, 'blocked_unknown_profile');
    const calls = (await readFile(callsPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(calls.filter((argv) => argv[0] === 'status' && argv[1] !== '--help').length, 0);
    assert.equal(calls.filter((argv) => argv[0] === 'cmd' && argv[1] !== '--help').length, 0);

    delete process.env.DEXTER_BIN;
    const fakeDefault = join(root, 'arkestr');
    await copyFile(fake, fakeDefault);
    await chmod(fakeDefault, 0o755);
    process.env.PATH = `${root}${delimiter}${priorPath ?? ''}`;
    const bridge = await invoke('deus_dexter_probe', {});
    assert.equal(bridge.executable, 'arkestr');
    assert.equal(bridge.profile, 'unknown');
    assert.match(bridge.diagnostics.version.stdout, /unknown fixture/);
  } finally {
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
    if (priorDexter === undefined) delete process.env.DEXTER_BIN;
    else process.env.DEXTER_BIN = priorDexter;
    if (priorLegacy === undefined) delete process.env[legacyEnvName];
    else process.env[legacyEnvName] = priorLegacy;
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
          'DEXTER_BIN precedence',
          'legacy override ignored; default arkestr name resolves the PATH fixture',
          'unknown-profile status blocked',
          'blocked cmd',
          'foreground no-model web',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
