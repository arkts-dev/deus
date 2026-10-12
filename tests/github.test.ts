import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitHubPlugin } from '../src/github.js';
import { registerGitHubTools } from '../src/extension.js';
test('GitHub-only product handoff preserves exact argv, bounded receipts, access controls and uncertain outcomes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deus-gh-'));
  const executable = join(root, 'gh');
  const calls = join(root, 'calls.jsonl');
  await writeFile(
    executable,
    `#!${process.execPath}\nimport fs from 'node:fs';const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(a)+'\\n');if(a[0]==='auth')process.exit();if(a[0]==='repo'){console.log(JSON.stringify({viewerPermission:'WRITE'}));process.exit();}if(a[0]==='issue'&&a[1]==='create'){console.log('https://github.com/fixture/repo/issues/1');process.exit(a.includes('uncertain')?1:0);}if(a[0]==='api'){console.log(JSON.stringify([[{id:1,body:'observed'}]]));process.exit();}process.exit(2);`,
  );
  await chmod(executable, 0o755);
  const client = new GitHubPlugin(root, ['fixture/repo'], executable);
  const input: { repository: string; kind: 'objective'; title: string; body: string } = {
    repository: 'fixture/repo',
    kind: 'objective',
    title: 'Literal $(touch BAD)',
    body: 'Product criteria',
  };
  assert.equal((await client.submit(input)).status, 'completed');
  assert.equal((await client.submit({ ...input, title: 'uncertain' })).status, 'outcome_unknown');
  assert.equal((await client.submit({ ...input, repository: 'other/repo' })).status, 'rejected');
  const logged = (await readFile(calls, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(logged.filter((a) => a[1] === 'create').length, 2);
  assert.ok(logged.some((a) => a.includes(input.title)));
  assert.ok(!logged.some((a) => a.includes('--dir') || a[0] === 'dexter'));
  const controller = new AbortController();
  controller.abort();
  assert.equal((await client.submit(input, controller.signal)).status, 'rejected');
  const names: string[] = [];
  registerGitHubTools({
    registerTool: (tool) => {
      names.push(tool.name);
    },
  });
  assert.ok(names.includes('deus_github_submit'));
  assert.ok(names.includes('deus_github_archive_read'));
  assert.ok(!names.some((name) => name.startsWith('deus_dexter_')));
  const evidence = join(process.cwd(), '.deus-local/tests');
  await mkdir(evidence, { recursive: true });
  await writeFile(
    join(evidence, 'github-contract.json'),
    JSON.stringify(
      {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        sourceHash: createHash('sha256')
          .update(await readFile(new URL('../src/github.ts', import.meta.url)))
          .digest('hex'),
        command: 'node --import tsx --test tests/github.test.ts',
        expected: 'GitHub-only argv, no retry, access block',
        observed: 'PASS',
        calls: logged,
      },
      null,
      2,
    ),
  );
});
test('private archive reads validate immutable content hashes before pagination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deus-archive-'));
  const executable = join(root, 'gh');
  const content = 'retained evidence';
  const sha = createHash('sha256').update(content).digest('hex');
  await writeFile(
    executable,
    `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[0]==='repo')console.log(JSON.stringify({isPrivate:true}));else process.stdout.write('retained evidence');`,
  );
  await chmod(executable, 0o755);
  const client = new GitHubPlugin(root, ['fixture/archive'], executable);
  const request = {
    repository: 'fixture/archive',
    ref: 'a'.repeat(40),
    path: 'objects/' + sha,
    cursor: null,
    limit: 100,
  };
  assert.equal((await client.archive(request)).text, content);
  await assert.rejects(client.archive({ ...request, path: 'objects/' + 'b'.repeat(64) }), /hash/);
});
