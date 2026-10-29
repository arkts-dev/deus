// Contract test against the operator-selected, already-built current checkout.
// Imports only the command parser. No scheduler, project or live mutation is started.
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DexterPlugin, MUTATION_COMMANDS } from '../dist/dexter.js';

const checkout = await realpath(process.argv[2] ?? '');
const parser = pathToFileURL(join(checkout, 'engine/dist/cli-commands.js')).href;
const root = await mkdtemp(join(tmpdir(), 'deus-current-cli-'));
try {
  const executable = join(root, 'parser.mjs');
  const output = join(root, 'parsed.jsonl');
  await writeFile(
    executable,
    `#!${process.execPath}
import { appendFileSync } from 'node:fs';
import { buildProgram } from ${JSON.stringify(parser)};
const program = buildProgram();
for (const command of program.commands) command.action(() => {
  appendFileSync(${JSON.stringify(output)}, JSON.stringify({ command: command.name(), args: command.args, options: command.opts() })+'\\n');
  console.log('created ISSUE-0123 (task): parser contract');
});
program.parse(process.argv);
`,
  );
  await chmod(executable, 0o755);
  const client = new DexterPlugin(executable, root);
  // Parser fixture, deliberately not signed-CLI evidence. Real trust is checked separately.
  client.probe = async () => ({
    executable,
    profile: 'dexter-signed',
    baselineRevision: 'fixture',
    supportedCommands: MUTATION_COMMANDS,
    diagnostics: {},
    reasons: [],
  });
  const title = '-literal;$(do-not-execute)',
    body = '--dir=/not-the-project\nUnicode: 字';
  const calls = [
    () => client.createEpic({ workspace: root, title, body }),
    () =>
      client.createTask({
        workspace: root,
        title,
        body,
        parent: 'ISSUE-0001',
        dependencies: ['ISSUE-0002', 'ISSUE-0003'],
        priority: 2,
      }),
    () => client.nudgeIssue({ workspace: root, issue: 'ISSUE-0001' }),
    () => client.reprioritizeIssue({ workspace: root, issue: 'ISSUE-0001', priority: 1 }),
    () =>
      client.relinkIssue({
        workspace: root,
        issue: 'ISSUE-0001',
        parent: null,
        addDependencies: ['ISSUE-0002'],
        removeDependencies: ['ISSUE-0003'],
      }),
    () =>
      client.acceptArchitecture({
        workspace: root,
        issue: 'ISSUE-0001',
        candidate: 'AC-000001',
        reason: '-literal justification',
      }),
    () => client.rejectIssue({ workspace: root, issue: 'ISSUE-0001' }),
  ];
  for (const call of calls) {
    const result = await call();
    assert.equal(result.status, 'completed', JSON.stringify(result));
  }
  const parsed = (await readFile(output, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    parsed.map((p) => p.command),
    MUTATION_COMMANDS,
  );
  for (const p of parsed) assert.equal(p.options.dir, root);
  assert.equal(parsed[0].args[0], title);
  assert.equal(parsed[0].options.body, body);
  assert.equal(parsed[1].options.title, title);
  assert.equal(parsed[1].options.body, body);
  assert.equal(parsed[1].options.depends, 'ISSUE-0002,ISSUE-0003');
  assert.equal(parsed[1].options.parent, 'ISSUE-0001');
  assert.equal(parsed[1].options.priority, 2);
  assert.equal(parsed[3].options.priority, 1);
  assert.equal(parsed[4].options.clearParent, true);
  assert.deepEqual(parsed[4].options.addDependency, ['ISSUE-0002']);
  assert.deepEqual(parsed[4].options.removeDependency, ['ISSUE-0003']);
  assert.equal(parsed[5].options.candidate, 'AC-000001');
  assert.equal(parsed[5].options.reason, '-literal justification');
  assert.deepEqual(parsed[6].args, ['ISSUE-0001']);
  console.log(
    'Current Dexter parser accepted all seven exact argv contracts; no project mutations executed.',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
