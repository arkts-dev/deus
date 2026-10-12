import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runProcess, succeeded } from '../dist/process.js';
const root = await mkdtemp(join(tmpdir(), 'deus-installed-'));
const run = async (binary, args, cwd = root) => {
  const result = await runProcess(binary, args, { cwd, timeoutMs: 120000 });
  assert.ok(succeeded(result), result.stderr);
  return result.stdout;
};
const packed = JSON.parse(
  await run('npm', ['pack', '--json', '--pack-destination', root], process.cwd()),
)[0];
const paths = packed.files.map((file) => file.path);
for (const file of [
  'dist/github.js',
  'dist/extension.js',
  'dist/mcp.js',
  'dist/mcp-cli.js',
  'prompts/kernel.md',
  'skills.lock.json',
])
  assert.ok(paths.includes(file));
for (const file of [
  'dist/dexter.js',
  'dist/artifacts.js',
  'dist/operations.js',
  'dist/board.js',
  'dist/metrics.js',
])
  assert.ok(!paths.includes(file));
await run('npm', [
  'install',
  '--prefix',
  join(root, 'install'),
  '--ignore-scripts',
  join(root, packed.filename),
]);
const installed = join(root, 'install/node_modules/deus-ex-machina');
const { default: extension } = await import(
  pathToFileURL(join(installed, 'dist/extension.js')).href
);
const tools = [],
  hooks = [];
extension({ registerTool: (tool) => tools.push(tool), on: (event) => hooks.push(event) });
assert.deepEqual(tools.map((tool) => tool.name).sort(), [
  'deus_github_answer',
  'deus_github_archive_read',
  'deus_github_product_accept',
  'deus_github_read',
  'deus_github_submit',
  'deus_research_web',
]);
for (const tool of tools)
  assert.deepEqual(
    [...(tool.parameters.required ?? [])].sort(),
    Object.keys(tool.parameters.properties ?? {}).sort(),
  );
assert.deepEqual(hooks, ['before_agent_start']);
const { verifySkillIntegrity } = await import(
  pathToFileURL(join(installed, 'dist/resources.js')).href
);
assert.equal(await verifySkillIntegrity(), 6);
assert.match(
  await readFile(join(installed, 'prompts/kernel.md'), 'utf8'),
  /GitHub-only coordination/,
);
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
const client = new Client({ name: 'installed-acceptance', version: '1' });
const transport = new StdioClientTransport({
  command: join(root, 'install/node_modules/.bin/deus-mcp'),
  args: ['--workspace', root],
  env: { ...process.env, DEUS_GITHUB_REPOSITORIES: '' },
  stderr: 'pipe',
});
try {
  await client.connect(transport);
  const names = (await client.listTools()).tools.map((tool) => tool.name);
  assert.ok(names.includes('deus_github_submit'));
  assert.ok(names.includes('deus_artifact_read'));
  assert.ok(!names.some((name) => name.startsWith('deus_dexter_')));
  const result = await client.callTool({
    name: 'deus_github_submit',
    arguments: {
      repository: 'fixture/repo',
      kind: 'objective',
      title: 'Objective',
      body: 'Contract',
    },
  });
  assert.equal(JSON.parse(result.content[0].text).status, 'rejected');
} finally {
  await client.close();
}
await writeFile(
  join(root, 'evidence.json'),
  JSON.stringify(
    {
      artifact: packed.filename,
      command: 'npm run test:package',
      expected: 'Installed GitHub-only tools, resources, MCP, access block',
      observed: 'PASS',
      paths,
    },
    null,
    2,
  ),
);
console.log(`Installed package PASS: ${root}/evidence.json`);
