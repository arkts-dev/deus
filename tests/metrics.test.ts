import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Check } from 'typebox/value';
import { fixture } from './fixture.js';
import { metrics, registerMetricsTool } from '../src/metrics.js';

test('session-style totals and exact role breakdowns, separate reviews, no delivery heuristics', async (t) => {
  const { root, put } = await fixture(t);
  const run = async (id: string, patch: Record<string, unknown>) =>
    put(
      `forge/runs/${id}/run.json`,
      JSON.stringify({
        run: id,
        role: 'implementer',
        started_at: '2026-01-01T22:00:00Z',
        completed_at: '2026-01-04T01:00:00Z',
        status: 'done',
        duration_ms: 60000,
        prompt_tokens: 300000,
        ...patch,
      }),
    );
  await run('RUN-abc-0001', {});
  await run('RUN-abc-0002', {
    status: 'failed',
    timed_out: true,
    duration_ms: 120000,
    prompt_tokens: null,
  });
  await run('RUN-abc-0003', { status: 'running', completed_at: null, duration_ms: 999999999 });
  await run('RUN-abc-0004', { completed_at: '2026-01-06T01:00:00Z' });
  await run('RUN-abc-0005', { role: 'acceptance_reviewer' });
  await run('RUN-abc-0006', { role: '__proto__', duration_ms: null, prompt_tokens: 0 });
  await put(
    'forge/reviews/MR-0001/0001.md',
    '---\nmr: MR-0001\ncreated: 2026-01-02T00:00:00+03:00\nverdict: approved\n---\n',
  );
  // Neither external Git changes nor Forge merge records are a metrics dependency.
  await put('forge/merge_requests/MR-0001.md', 'malformed, should never be read');
  await put('bus/000001-mr.merged.md', 'malformed, should never be read');
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
    [6, 3, 1, 2, 1],
  );
  assert.deepEqual(day.runs.total.durationMs, { samples: 3, sum: 240000, median: 60000 });
  assert.deepEqual(day.runs.total.timeoutDurationMs, { samples: 1, sum: 120000 });
  assert.deepEqual(day.runs.total.promptTokens, { samples: 3, sum: 600000 });
  const impl = day.runs.byRole.implementer!;
  assert.deepEqual([impl.starts, impl.done, impl.failed, impl.unfinished], [4, 1, 1, 2]);
  assert.deepEqual(impl.durationMs, { samples: 2, sum: 180000, median: 90000 });
  assert.equal(day.runs.byRole.acceptance_reviewer!.starts, 1);
  assert.deepEqual(day.runs.byRole['__proto__']!.durationMs, {
    samples: 0,
    sum: null,
    median: null,
  });
  assert.deepEqual(day.runs.byRole['__proto__']!.promptTokens, { samples: 1, sum: 0 });
  for (const field of ['starts', 'done', 'failed', 'unfinished', 'timedOut'] as const)
    assert.equal(
      day.runs.total[field],
      Object.values(day.runs.byRole).reduce((n, r) => n + r[field], 0),
    );
  assert.deepEqual(day.workspaceActivity, { reviewVerdicts: { approved: 1 } });
  assert.equal(day.dayClosed, true);
  assert.equal(result.collection.startedAt, new Date(observed).toISOString());
  const wire = JSON.stringify(result);
  for (const removed of [
    'partial',
    'coverage',
    'basis',
    'mergedMRUpdates',
    'mergeEvents',
    'workspace',
    'cacheHitTokens',
  ])
    assert.ok(!wire.includes(`"${removed}"`));
  assert.ok(Buffer.byteLength(wire) < 8192);
  assert.equal(
    (await metrics(p, undefined, Date.parse('2026-01-02T10:00:00Z'))).days[0]!.dayClosed,
    false,
  );
  for (const utcOffsetMinutes of [0, -300])
    assert.equal((await metrics({ ...p, utcOffsetMinutes })).days[0]!.runs.total.starts, 0);
  await run('RUN-abc-0007', { started_at: '2026-01-02T00:00:00+03:00' });
  await run('RUN-abc-0008', { started_at: '2026-01-03T00:00:00+03:00' });
  assert.equal((await metrics(p, undefined, observed)).days[0]!.runs.total.starts, 7);
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
  await put('forge/runs/RUN-abc-0009/run.json', '{broken');
  await assert.rejects(metrics(p), /Invalid metrics metadata/);
});

test('missing counters are unsampled; present invalid counters fail, including unfinished runs', async (t) => {
  const { root, put } = await fixture(t);
  await mkdir(join(root, 'forge/reviews'), { recursive: true });
  const p = { workspace: root, since: '2026-01-01', until: '2026-01-02', utcOffsetMinutes: 0 };
  const base = {
    run: 'RUN-abc-0001',
    role: 'implementer',
    status: 'done',
    started_at: '2026-01-01T01:00:00Z',
    completed_at: '2026-01-01T02:00:00Z',
  };
  for (const field of ['duration_ms', 'prompt_tokens']) {
    for (const value of [undefined, null, 0]) {
      await put('forge/runs/RUN-abc-0001/run.json', JSON.stringify({ ...base, [field]: value }));
      const total = (await metrics(p)).days[0]!.runs.total;
      const measured = field === 'duration_ms' ? total.durationMs : total.promptTokens;
      assert.equal(measured.samples, value === 0 ? 1 : 0);
      assert.equal(measured.sum, value === 0 ? 0 : null);
    }
    for (const value of [-1, 0.5, '12', true, {}, Number.MAX_SAFE_INTEGER + 1])
      for (const status of ['done', 'running']) {
        await put(
          'forge/runs/RUN-abc-0001/run.json',
          JSON.stringify({ ...base, status, [field]: value }),
        );
        await assert.rejects(metrics(p), new RegExp(`Invalid ${field}; measurement unavailable`));
      }
  }
});

test('unavailable sources fail; genuine empty cohorts have no numeric samples', async (t) => {
  const { root, put } = await fixture(t);
  const p = { workspace: root, since: '2026-01-01', until: '2026-01-02', utcOffsetMinutes: 0 };
  await assert.rejects(metrics(p), { code: 'ENOENT' });
  for (const path of ['forge/runs', 'forge/reviews'])
    await mkdir(join(root, path), { recursive: true });
  const day = (await metrics(p)).days[0]!;
  assert.equal(day.runs.total.starts, 0);
  assert.deepEqual(day.runs.total.durationMs, { samples: 0, sum: null, median: null });
  assert.deepEqual(day.runs.byRole, {});
  await put(
    'forge/runs/RUN-abc-0001/run.json',
    JSON.stringify({
      run: 'RUN-abc-0001',
      role: 'reviewer',
      status: 'done',
      started_at: 'not a timestamp',
    }),
  );
  await assert.rejects(metrics(p), /Invalid metrics timestamp/);
});
