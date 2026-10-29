import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Check } from 'typebox/value';
import { fixture } from './fixture.js';
import { metrics, registerMetricsTool } from '../src/metrics.js';

test('current run IDs, terminal updated_at durations, failures and exact role cohorts', async (t) => {
  const { root, put } = await fixture(t);
  const run = async (id: string, patch: Record<string, unknown>) =>
    put(
      `forge/runs/${id}/run.json`,
      JSON.stringify({
        run: id,
        role: 'implementer',
        started_at: '2026-01-01T22:00:00Z',
        updated_at: '2026-01-01T22:01:00Z',
        status: 'done',
        prompt_tokens: 300000,
        ...patch,
      }),
    );
  await run('RUN-000001', {});
  await run('RUN-remote.2', {
    status: 'failed',
    failure_reason: 'timed_out',
    updated_at: '2026-01-01T22:02:00Z',
    prompt_tokens: null,
  });
  await run('RUN-remote_3', { status: 'running' });
  await run('RUN-000004', { updated_at: '2026-01-06T01:00:00Z' });
  await run('RUN-000005', { role: 'acceptance_reviewer' });
  await run('RUN-000006', { role: '__proto__', status: 'cancelled', prompt_tokens: 0 });
  await put(
    'forge/reviews/MR-0001/0001.md',
    '---\nmr: MR-0001\ncreated: 2026-01-02T00:00:00+03:00\nverdict: approved\n---\n',
  );
  const p = { workspace: root, since: '2026-01-02', until: '2026-01-03', utcOffsetMinutes: 180 };
  const observed = Date.parse('2026-01-05T00:00:00Z');
  const result = await metrics(p, undefined, observed),
    day = result.days[0]!;
  assert.deepEqual(
    [
      day.runs.total.starts,
      day.runs.total.done,
      day.runs.total.failed,
      day.runs.total.unfinished,
      day.runs.total.timedOut,
    ],
    [6, 2, 2, 2, 1],
  );
  assert.deepEqual(day.runs.total.durationMs, { samples: 4, sum: 300000, median: 60000 });
  assert.deepEqual(day.runs.total.timeoutDurationMs, { samples: 1, sum: 120000 });
  assert.deepEqual(day.runs.total.promptTokens, { samples: 3, sum: 600000 });
  assert.equal(day.runs.byRole.acceptance_reviewer!.starts, 1);
  assert.deepEqual(day.runs.byRole['__proto__']!.promptTokens, { samples: 1, sum: 0 });
  for (const field of ['starts', 'done', 'failed', 'unfinished', 'timedOut'] as const)
    assert.equal(
      day.runs.total[field],
      Object.values(day.runs.byRole).reduce((n, r) => n + r[field], 0),
    );
  assert.deepEqual(day.workspaceActivity, { reviewVerdicts: { approved: 1 } });
  assert.equal(day.dayClosed, true);
  assert.equal(result.collection.startedAt, new Date(observed).toISOString());
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 8192);
  assert.equal(
    (await metrics(p, undefined, Date.parse('2026-01-02T10:00:00Z'))).days[0]!.dayClosed,
    false,
  );
  for (const utcOffsetMinutes of [0, -300])
    assert.equal((await metrics({ ...p, utcOffsetMinutes })).days[0]!.runs.total.starts, 0);
  for (const patch of [
    { since: '2026-02-30' },
    { until: '2026-01-02' },
    { until: '2026-01-10' },
    { utcOffsetMinutes: 841 },
    { utcOffsetMinutes: 0.5 },
    { workspace: 'relative' },
  ])
    await assert.rejects(metrics({ ...p, ...patch }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(metrics(p, controller.signal), /abort/i);
  registerMetricsTool({
    registerTool(tool) {
      assert.equal(Check(tool.parameters, p), true);
      assert.equal(Check(tool.parameters, { ...p, role: 'implementer' }), false);
    },
  });
  await put('forge/runs/RUN-000007/run.json', '{broken');
  await assert.rejects(metrics(p), /Invalid metrics metadata/);
});

test('missing prompt counters are unsampled; invalid counters fail even for unfinished runs', async (t) => {
  const { root, put } = await fixture(t);
  await mkdir(join(root, 'forge/reviews'), { recursive: true });
  const p = { workspace: root, since: '2026-01-01', until: '2026-01-02', utcOffsetMinutes: 0 };
  const base = {
    run: 'RUN-000001',
    role: 'implementer',
    status: 'done',
    started_at: '2026-01-01T01:00:00Z',
    updated_at: '2026-01-01T02:00:00Z',
  };
  for (const value of [undefined, null, 0]) {
    await put('forge/runs/RUN-000001/run.json', JSON.stringify({ ...base, prompt_tokens: value }));
    const total = (await metrics(p)).days[0]!.runs.total;
    assert.equal(total.promptTokens.samples, value === 0 ? 1 : 0);
    assert.equal(total.promptTokens.sum, value === 0 ? 0 : null);
    assert.equal(total.durationMs.sum, 3600000);
  }
  for (const value of [-1, 0.5, '12', true, {}, Number.MAX_SAFE_INTEGER + 1])
    for (const status of ['done', 'running']) {
      await put(
        'forge/runs/RUN-000001/run.json',
        JSON.stringify({ ...base, status, prompt_tokens: value }),
      );
      await assert.rejects(metrics(p), /Invalid prompt_tokens/);
    }
});

test('unavailable sources and obsolete metadata fail, genuine empty cohorts remain empty', async (t) => {
  const { root, put } = await fixture(t);
  const p = { workspace: root, since: '2026-01-01', until: '2026-01-02', utcOffsetMinutes: 0 };
  await assert.rejects(metrics(p), { code: 'ENOENT' });
  for (const path of ['forge/runs', 'forge/reviews'])
    await mkdir(join(root, path), { recursive: true });
  const day = (await metrics(p)).days[0]!;
  assert.equal(day.runs.total.starts, 0);
  assert.deepEqual(day.runs.total.durationMs, { samples: 0, sum: null, median: null });
  for (const patch of [
    { started_at: 'not a timestamp' },
    { updated_at: undefined, completed_at: '2026-01-01T02:00:00Z' },
  ]) {
    await put(
      'forge/runs/RUN-000001/run.json',
      JSON.stringify({
        run: 'RUN-000001',
        role: 'reviewer',
        status: 'done',
        started_at: '2026-01-01T01:00:00Z',
        updated_at: '2026-01-01T02:00:00Z',
        ...patch,
      }),
    );
    await assert.rejects(metrics(p), /Invalid.*timestamp|Invalid run updated_at/);
  }
});
