import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DexterPlugin, COMMANDS, type ProbeReport } from '../src/dexter.js';
import { PROFILE_SHA } from '../src/dexter-profile.js';
import { runProcess } from '../src/process.js';
import { fetchPublic, publicAddress } from '../src/web.js';
import { researchWeb, searchWeb, webSearchProvider } from '../src/research.js';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('..', import.meta.url));

test(
  'pinned installed CLI fingerprints every exposed command',
  {
    skip:
      process.env.DEUS_TEST_NO_CLI === '1'
        ? 'Private Dexter CLI is unavailable to fork PRs'
        : false,
  },
  async () => {
    const report = await new DexterPlugin(
      process.env.DEXTER_BIN || 'dexter',
      process.cwd(),
    ).probe();
    assert.equal(report.profile, 'dexter-3fb8d375');
    assert.deepEqual(report.supportedCommands, COMMANDS);
    assert.equal(Object.keys(report.diagnostics).length, COMMANDS.length + 2);
    assert.equal(report.baselineRevision, PROFILE_SHA);
    assert.ok(!(COMMANDS as readonly string[]).includes('web'));
    assert.ok(!(COMMANDS as readonly string[]).includes('config'));
    assert.ok(!(COMMANDS as readonly string[]).includes('dexter-web'));
    assert.match(report.diagnostics.help!.stdout, /config/);
    assert.equal(report.diagnostics.config, undefined);
    assert.equal(report.diagnostics.web, undefined);
  },
);

test('unknown profile blocks every workspace command but retains raw probe diagnostics', async () => {
  const plugin = new DexterPlugin(process.execPath, process.cwd());
  const report = await plugin.probe();
  assert.equal(report.profile, 'unknown');
  assert.ok(report.diagnostics.version);
  for (const command of COMMANDS) {
    const result = await plugin.exec(command, [], '/tmp/workspace');
    assert.equal(result.status, 'blocked_unknown_profile', command);
    assert.equal(result.raw, undefined);
  }
});

test('in-memory probe cache invalidates when executable changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deus-probe-'));
  try {
    const executable = join(dir, 'fake.mjs');
    await writeFile(executable, `#!${process.execPath}\nconsole.log('first');\n`);
    await chmod(executable, 0o755);
    const plugin = new DexterPlugin(executable, dir);
    const first = await plugin.probe();
    assert.equal(await plugin.probe(), first);
    await writeFile(executable, `#!${process.execPath}\nconsole.log('second version');\n`);
    const second = await plugin.probe();
    assert.notEqual(second, first);
    assert.match(second.diagnostics.version!.stdout, /second version/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('every command receives exact argv and workspace once without shell or retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deus-argv-'));
  try {
    const executable = join(dir, 'fake.mjs');
    const log = join(dir, 'argv.jsonl');
    await writeFile(
      executable,
      `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2))+'\\n');\nprocess.exitCode = 7;\n`,
    );
    await chmod(executable, 0o755);
    const plugin = new DexterPlugin(executable, dir);
    plugin.probe = async (): Promise<ProbeReport> => ({
      executable,
      profile: 'dexter-3fb8d375',
      baselineRevision: PROFILE_SHA,
      supportedCommands: COMMANDS,
      diagnostics: {},
      reasons: [],
    });
    for (const command of COMMANDS) {
      const result = await plugin.exec(command, ['literal;$(touch nope)', 'two words'], dir);
      assert.equal(result.status, 'executed');
      assert.equal(result.raw?.exitCode, 7);
    }
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(calls.length, COMMANDS.length);
    for (let index = 0; index < COMMANDS.length; index++)
      assert.deepEqual(
        calls[index],
        COMMANDS[index] === 'init'
          ? [COMMANDS[index], dir, 'literal;$(touch nope)', 'two words']
          : [COMMANDS[index], 'literal;$(touch nope)', 'two words', '--dir', dir],
      );
    await assert.rejects(plugin.exec('status', ['--dir', '/elsewhere'], dir));
    await assert.rejects(plugin.exec('status', [], 'relative'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('signal termination and missing executable remain raw uncertain outcomes without retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deus-uncertain-'));
  try {
    const executable = join(dir, 'terminated.mjs');
    const log = join(dir, 'argv.jsonl');
    await writeFile(
      executable,
      `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, 'called\\n');\nprocess.kill(process.pid, 'SIGTERM');\n`,
    );
    await chmod(executable, 0o755);
    const recognized: ProbeReport = {
      executable,
      profile: 'dexter-3fb8d375',
      baselineRevision: PROFILE_SHA,
      supportedCommands: COMMANDS,
      diagnostics: {},
      reasons: [],
    };
    const plugin = new DexterPlugin(executable, dir);
    plugin.probe = async () => recognized;
    const terminated = await plugin.exec('answer', ['REQ-1', 'answer'], dir);
    assert.equal(terminated.status, 'executed');
    assert.equal(terminated.raw?.signal, 'SIGTERM');
    assert.equal((await readFile(log, 'utf8')).trim(), 'called');

    const absent = new DexterPlugin(join(dir, 'missing-executable'), dir);
    absent.probe = async () => recognized;
    const lost = await absent.exec('cmd', ['instruction'], dir);
    assert.equal(lost.status, 'executed');
    assert.equal(lost.raw?.exitCode, null);
    assert.ok(lost.raw?.error);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('run output is bounded without terminating the worker', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deus-run-output-'));
  try {
    const executable = join(dir, 'large-output.mjs');
    await writeFile(
      executable,
      `#!${process.execPath}\nprocess.stdout.write('x'.repeat(600_000));\n`,
    );
    await chmod(executable, 0o755);
    const plugin = new DexterPlugin(executable, dir);
    plugin.probe = async (): Promise<ProbeReport> => ({
      executable,
      profile: 'dexter-3fb8d375',
      baselineRevision: PROFILE_SHA,
      supportedCommands: COMMANDS,
      diagnostics: {},
      reasons: [],
    });
    const result = await plugin.exec('run', [], dir);
    assert.equal(result.raw?.exitCode, 0);
    assert.equal(result.raw?.signal, null);
    assert.equal(result.raw?.truncated, true);
    assert.ok(result.raw!.stdout.length <= 512_000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an explicit unlimited process deadline lets a delayed command finish', async () => {
  const result = await runProcess(
    process.execPath,
    ['-e', "setTimeout(() => console.log('done'), 80)"],
    { cwd: repository, timeoutMs: null },
  );
  assert.equal(result.timedOut, false);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /done/);
});

test('abort terminates a running Dexter command without retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deus-abort-'));
  try {
    const executable = join(dir, 'hang.mjs');
    const started = join(dir, 'started');
    await writeFile(
      executable,
      `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(started)}, 'yes');\nsetInterval(() => {}, 1000);\n`,
    );
    await chmod(executable, 0o755);
    const plugin = new DexterPlugin(executable, dir);
    plugin.probe = async (): Promise<ProbeReport> => ({
      executable,
      profile: 'dexter-3fb8d375',
      baselineRevision: PROFILE_SHA,
      supportedCommands: COMMANDS,
      diagnostics: {},
      reasons: [],
    });
    const controller = new AbortController();
    const pending = plugin.exec('run', [], dir, controller.signal);
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await readFile(started);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    assert.equal(await readFile(started, 'utf8'), 'yes');
    controller.abort();
    const result = await pending;
    assert.equal(result.status, 'executed');
    assert.equal(result.raw?.cancelled, true);
    assert.equal(result.raw?.timedOut, false);
    assert.equal(result.raw?.signal, 'SIGTERM');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('public web guards and provider configuration reject unsafe inputs', async () => {
  assert.equal(publicAddress('127.0.0.1'), false);
  assert.equal(publicAddress('10.0.0.2'), false);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.throws(() => webSearchProvider({ searchProvider: 'exa' }), /not configured/);
  await assert.rejects(searchWeb('', { searchProvider: 'fetch' }), /Invalid search question/);
  await assert.rejects(fetchPublic('http://127.0.0.1/private'), /public|private|address|host/i);
});

test('web research is a bounded foreground call and reports no model as unavailable', async () => {
  const runtime = { getAvailableSnapshot: () => [] } as unknown as ModelRuntime;
  const report = await researchWeb('Public question only', { searchProvider: 'fetch' }, runtime);
  assert.deepEqual(report, { status: 'unavailable', reason: 'No model configured' });
  assert.ok(!('jobId' in report));
  assert.ok(!('poll' in report));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    researchWeb('Public question only', { searchProvider: 'fetch' }, runtime, controller.signal),
    /abort/i,
  );
});

test('minimal prompt and lazy skills describe tracked artifact contracts', async () => {
  const prompt = await readFile(join(repository, 'prompts/kernel.md'), 'utf8');
  assert.match(prompt, /Dexter is the sole execution orchestrator/);
  assert.match(prompt, /never retry automatically/i);
  const fields = {
    designer: [
      'kind',
      'id',
      'created_at',
      'updated_at',
      'status',
      'references',
      'problem',
      'options',
      'decision',
      'acceptance',
    ],
    'local-research': [
      'kind',
      'id',
      'created_at',
      'updated_at',
      'status',
      'references',
      'question',
      'mode',
      'provider',
      'sources',
      'gaps',
    ],
    'web-research': [
      'kind',
      'id',
      'created_at',
      'updated_at',
      'status',
      'references',
      'question',
      'mode',
      'provider',
      'sources',
      'gaps',
    ],
    'dexter-control': [
      'kind',
      'id',
      'created_at',
      'updated_at',
      'status',
      'references',
      'design_ref',
      'objective',
      'scope',
      'exclusions',
      'acceptance',
    ],
  };
  for (const [skill, required] of Object.entries(fields)) {
    const source = await readFile(join(repository, 'skills', skill, 'SKILL.md'), 'utf8');
    for (const field of required)
      assert.match(source, new RegExp(`\\b${field}\\b`), `${skill}: ${field}`);
    assert.match(source, /\.deus\//);
  }
  const designer = await readFile(join(repository, 'skills/designer/SKILL.md'), 'utf8');
  assert.match(designer, /never amend/i);
  assert.match(designer, /never write inside `fs\/` or `forge\/`/i);
  assert.match(designer, /deus_design_check/);
  assert.match(designer, /deus_design_write/);
  const simplify = await readFile(join(repository, 'skills/simplify-review/SKILL.md'), 'utf8');
  assert.match(simplify, /Review project source read-only/);
  assert.match(simplify, /Do not call `deus_dexter_probe` or `deus_dexter_exec`/);
  assert.match(simplify, /do not.*edit project source/i);
  const control = await readFile(join(repository, 'skills/dexter-control/SKILL.md'), 'utf8');
  assert.match(control, /complete product text as `submit` arguments/);
  assert.match(control, /Dexter does not automatically read it/);
  const productControl = await readFile(
    join(repository, 'skills/product-control/SKILL.md'),
    'utf8',
  );
  assert.match(productControl, /\bPRODUCT\b/);
  assert.match(productControl, /\bNOISE\b/);
  assert.match(productControl, /\bDEAD\b/);
  assert.match(productControl, /deus_board_snapshot/);
  assert.match(productControl, /deus_board_plan/);
  assert.match(productControl, /deus_board_close/);
  assert.match(productControl, /Never run the `run` drain/i);
});
