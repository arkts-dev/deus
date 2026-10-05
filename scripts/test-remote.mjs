import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const source = process.env.DEUS_TEST_DEXTER_SOURCE;
if (!source)
  throw new Error(
    'Set DEUS_TEST_DEXTER_SOURCE to an extracted real Dexter source tree. This test generates its own signing identity; it does not verify upstream provenance.',
  );
const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
const root = await mkdtemp(join(tmpdir(), 'deus-ssh-'));
const name = `deus-mcp-test-${process.pid}`;
const clients = [];
try {
  run('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', join(root, 'id_ed25519')]);
  run('docker', ['build', '-t', 'deus-mcp-integration', '-f', 'tests/remote/Dockerfile', '.'], {
    stdio: 'inherit',
  });
  run('docker', [
    'run',
    '-d',
    '--name',
    name,
    '-p',
    '127.0.0.1::22',
    '--mount',
    `type=bind,src=${root},dst=/fixture,readonly`,
    '--mount',
    `type=bind,src=${resolve(source)},dst=/dexter-source,readonly`,
    'deus-mcp-integration',
  ]);
  const port = run('docker', ['port', name, '22/tcp']).trim().split(':').at(-1);
  let ready = false;
  for (let i = 0; i < 180; i++) {
    try {
      run('docker', [
        'exec',
        name,
        'sh',
        '-c',
        'test -f /usr/local/bin/deus-test-start && pgrep -x sshd',
      ]);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  assert.ok(ready, 'SSH fixture did not start');
  const hostKey = run('docker', ['exec', name, 'cat', '/etc/ssh/ssh_host_ed25519_key.pub'])
    .trim()
    .split(' ')
    .slice(0, 2)
    .join(' ');
  await writeFile(join(root, 'known_hosts'), `[127.0.0.1]:${port} ${hostKey}\n`);
  const connect = async (entry = '/usr/local/bin/deus-test-start') => {
    const client = new Client({ name: 'deus-ssh-integration', version: '1' });
    const transport = new StdioClientTransport({
      command: 'ssh',
      args: [
        '-T',
        '-p',
        port,
        '-i',
        join(root, 'id_ed25519'),
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'BatchMode=yes',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        `UserKnownHostsFile=${join(root, 'known_hosts')}`,
        'root@127.0.0.1',
        entry,
      ],
      stderr: 'pipe',
    });
    let errors = '';
    transport.stderr?.on('data', (c) => {
      errors += c.toString();
    });
    await client.connect(transport);
    clients.push(client);
    const call = async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args }, undefined, {
        timeout: 120000,
      });
      assert.ok(!result.isError, JSON.stringify(result) + errors);
      return JSON.parse(result.content[0].text);
    };
    return { client, call };
  };
  let { client, call } = await connect();
  assert.equal((await client.listTools()).tools.length, 13);
  const probe = await call('deus_dexter_probe');
  assert.equal(probe.profile, 'dexter-signed');
  assert.match(probe.diagnostics.version.stdout, /dexter 0\.1\.0/);
  const exec = async (command, args = []) => {
    const result = await call('deus_dexter_exec', { command, args, workspace: '/workspace' });
    assert.equal(result.status, 'executed');
    assert.equal(result.raw.exitCode, 0, JSON.stringify(result));
    return result.raw.stdout;
  };
  for (const command of probe.supportedCommands) await exec(command, ['--help']);
  await exec('init', [
    '--api-key-env',
    'DEUS_TEST_UNUSED_MODEL_KEY',
    '--pi-executable',
    '/opt/deus/node_modules/.bin/pi',
    '--verification-command',
    'python3 -c "print(1)"',
  ]);
  const title = 'MCP literal ; $(touch /tmp/must-not-exist)';
  const submitted = await exec('submit', [title, '--body', 'Implement observable remote access.']);
  const id = submitted.match(/ISSUE-\d+/)?.[0];
  assert.ok(id, submitted);
  assert.match(await exec('show', [id]), /observable remote access/);
  assert.match(await exec('status'), new RegExp(id));
  const board = await call('deus_board_live', { workspace: '/workspace' });
  assert.ok(board.issues.some((i) => i.id === id));
  await call('deus_board_plan', { workspace: '/workspace' });
  const denied = await client.callTool({
    name: 'deus_dexter_exec',
    arguments: { command: 'status', args: [], workspace: '/tmp' },
  });
  assert.equal(denied.isError, true);
  run('docker', ['exec', name, 'test', '!', '-e', '/tmp/must-not-exist']);
  const report =
    '---\nkind: research\nid: remote\ncreated_at: 2026-10-05\nupdated_at: 2026-10-05\nstatus: draft\nreferences: []\nquestion: Does SSH work?\nmode: local\nprovider: mcp\nsources: []\ngaps: []\n---\nThe real Dexter CLI received the task.\n';
  await call('deus_artifact_write', { path: '.deus/research/remote.md', content: report });
  assert.equal(
    (await call('deus_artifact_read', { path: '.deus/research/remote.md' })).text,
    report,
  );
  await client.close();
  ({ client, call } = await connect());
  assert.equal(
    (await call('deus_board_live', { workspace: '/workspace' })).issues.filter((i) => i.id === id)
      .length,
    1,
  );
  assert.equal(
    (await call('deus_artifact_read', { path: '.deus/research/remote.md' })).text,
    report,
  );
  // Closing the SSH transport must terminate foreground children, with no replay.
  const hanging = await connect('/usr/local/bin/deus-test-hang-start');
  const pending = hanging.client.callTool({
    name: 'deus_dexter_exec',
    arguments: { command: 'run', args: [], workspace: '/workspace' },
  });
  const interrupted = assert.rejects(pending);
  for (let i = 0; i < 100; i++) {
    try {
      run('docker', ['exec', name, 'test', '-s', '/tmp/fixture-calls']);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.equal(run('docker', ['exec', name, 'cat', '/tmp/fixture-calls']), 'started\n');
  await hanging.client.close();
  await interrupted;
  let calls = '';
  for (let i = 0; i < 100; i++) {
    calls = run('docker', ['exec', name, 'cat', '/tmp/fixture-calls']);
    if (calls.includes('stopped')) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(calls, 'started\nstopped\n');
  // The same real CLI must become inaccessible after an unsigned commit appears.
  run('docker', [
    'exec',
    name,
    'git',
    '-C',
    '/opt/dexter',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--allow-empty',
    '-m',
    'Unsigned test revision',
  ]);
  assert.equal((await call('deus_dexter_probe')).profile, 'unknown');
  const blocked = await call('deus_dexter_exec', {
    command: 'submit',
    args: ['must not be created'],
    workspace: '/workspace',
  });
  assert.equal(blocked.status, 'blocked_unknown_profile');
  assert.equal(blocked.raw, undefined);
  console.log(
    JSON.stringify(
      {
        passed: true,
        transport: 'MCP stdio over real SSH',
        dexter: 'user-supplied real CLI',
        signature: 'locally generated test identity; no upstream provenance claim',
        verifiedCommit: probe.verifiedCommit,
        exercised: [
          'initialize',
          'all tools discovery',
          'signed probe',
          'help for all 16 original commands',
          'unsigned revision blocks mutations',
          'real init',
          'real submit with literal shell metacharacters',
          'real show',
          'real status',
          'real board',
          'workspace binding',
          'remote report write/read',
          'disconnect and reconnect',
          'in-flight SSH disconnect cancels signed fixture without replay',
        ],
        notExercised: ['paid model execution', 'live web research', 'upstream signature'],
      },
      null,
      2,
    ),
  );
} catch (error) {
  try {
    console.error(run('docker', ['logs', name]));
  } catch {}
  throw error;
} finally {
  for (const client of clients) await client.close().catch(() => {});
  try {
    run('docker', ['rm', '-f', name]);
  } catch {}
  await rm(root, { recursive: true, force: true });
}
