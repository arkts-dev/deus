import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../src/process.js';
import { fetchPublic, publicAddress } from '../src/web.js';
import { researchWeb, searchWeb, webSearchProvider } from '../src/research.js';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';

const repository = fileURLToPath(new URL('..', import.meta.url));

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
  assert.match(prompt, /`deus_dexter_\*` API is the sole mechanism for mutating/);
  assert.match(prompt, /For reading, `deus_dexter_\*` are preferred/);
  assert.match(prompt, /if they are insufficient, ordinary read-only tools are allowed/);
  assert.match(
    prompt,
    /If `profile` is `unknown`, any mutation of the Dexter workspace is prohibited/,
  );
  assert.match(prompt, /Never retry failed mutations automatically/);
  const common = ['kind', 'id', 'created_at', 'updated_at', 'status', 'references'];
  const research = [...common, 'question', 'mode', 'provider', 'sources', 'gaps'];
  const fields = {
    designer: [...common, 'problem', 'options', 'decision', 'acceptance'],
    'local-research': research,
    'web-research': research,
    'dexter-control': [...common, 'design_ref', 'objective', 'scope', 'exclusions', 'acceptance'],
  };
  for (const [skill, required] of Object.entries(fields)) {
    const source = await readFile(join(repository, 'skills', skill, 'SKILL.md'), 'utf8');
    for (const field of required)
      assert.match(source, new RegExp(`\\b${field}\\b`), `${skill}: ${field}`);
    assert.match(source, /\.deus\//);
  }
  const designer = await readFile(join(repository, 'skills/designer/SKILL.md'), 'utf8');
  assert.ok(designer.trim().split(/\s+/).length < 303);
  for (const pattern of [
    /never amend/i,
    /never write inside `fs\/` or `forge\/`/i,
    /deus_design_check/,
    /deus_design_write/,
    /Reuse settled answers/,
    /Ask only consequential unresolved questions/,
    /after their prerequisites are settled/,
    /Investigate inspectable facts yourself/,
    /designer does not implement or prototype/,
    /user confirmation before writing/,
    /destination approval alone is insufficient/,
    /Allow quantitative requirements/,
    /review every warning/,
    /stop questioning[\s\S]*experiment[\s\S]*Resume from observations/,
  ])
    assert.match(designer, pattern);
  const simplify = await readFile(join(repository, 'skills/simplify-review/SKILL.md'), 'utf8');
  assert.match(simplify, /Review project source read-only/);
  assert.match(simplify, /Do not mutate Dexter state/);
  assert.match(simplify, /do not.*edit project source/i);
  const control = await readFile(join(repository, 'skills/dexter-control/SKILL.md'), 'utf8');
  assert.match(control, /complete product text as the `body`/);
  assert.match(control, /Dexter does not automatically read it/);
  const productControl = await readFile(
    join(repository, 'skills/product-control/SKILL.md'),
    'utf8',
  );
  for (const pattern of [
    /\bPRODUCT\b/,
    /\bNOISE\b/,
    /\bDEAD\b/,
    /deus_dexter_issues_live/,
    /deus_dexter_issues_plan/,
    /deus_dexter_issue_close/,
    /Never run the `run` drain/i,
  ])
    assert.match(productControl, pattern);
  for (const path of ['AGENTS.md', 'skills/dexter-control/SKILL.md']) {
    const text = await readFile(join(repository, path), 'utf8');
    assert.match(text, /Read-only operations are allowed as usual/);
    assert.doesNotMatch(text, /Do not read, parse/);
  }
});
