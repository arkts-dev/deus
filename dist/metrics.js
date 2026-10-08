/** Read-only run cohorts and separately scoped workspace review activity. No delivery attribution. */
import { readdir } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { document, safePath, source } from './artifacts.js';
import { Type } from 'typebox';
import { jsonResult, redactedJson } from './process.js';
import { readOnly } from './tool-registry.js';
const DAY = 86400000;
const timestamp = (value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const date = (value) => {
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(time) ||
        new Date(time).toISOString().slice(0, 10) !== value)
        throw new Error('Expected a calendar date YYYY-MM-DD');
    return time;
};
const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
    return n ? (sorted[Math.floor(n / 2)] + sorted[Math.floor((n - 1) / 2)]) / 2 : null;
};
const nonnegative = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
/** Only the host adapter knows Forge paths; malformed sources must not become measured zeros. */
async function* observations(workspace, signal) {
    const files = async (parts) => {
        signal?.throwIfAborted();
        const names = (await readdir(await safePath(workspace, ...parts))).sort();
        if (names.length > 100000)
            throw new Error('Metadata directory exceeds 100000 entries');
        return names;
    };
    const record = async (parts, id, identity) => {
        signal?.throwIfAborted();
        const raw = await source(workspace, parts);
        try {
            const m = identity === 'run' ? JSON.parse(raw) : document(raw).metadata;
            if (!m || m[identity] !== id)
                throw new Error();
            return m;
        }
        catch {
            throw new Error('Invalid metrics metadata; measurement unavailable');
        }
    };
    for (const run of (await files(['forge', 'runs'])).filter((n) => /^RUN-[a-z0-9]+-\d+$/.test(n)))
        yield { kind: 'run', metadata: await record(['forge', 'runs', run, 'run.json'], run, 'run') };
    for (const mr of (await files(['forge', 'reviews'])).filter((n) => /^MR-\d+$/.test(n)))
        for (const file of (await files(['forge', 'reviews', mr])).filter((n) => /^\d+\.md$/.test(n)))
            yield { kind: 'review', metadata: await record(['forge', 'reviews', mr, file], mr, 'mr') };
}
const cohort = () => ({
    starts: 0,
    done: 0,
    failed: 0,
    unfinished: 0,
    timedOut: 0,
    durationMs: { samples: 0, sum: 0 },
    timeoutDurationMs: { samples: 0, sum: 0 },
    promptTokens: { samples: 0, sum: 0 },
    durations: [],
});
function accumulate(b, r, began, observed) {
    b.starts++;
    const completed = timestamp(r.completed_at);
    if (r.status === 'running' ||
        !Number.isFinite(completed) ||
        completed < began ||
        completed > observed) {
        b.unfinished++;
        return;
    }
    if (r.status === 'done')
        b.done++;
    else
        b.failed++;
    if (r.timed_out === true)
        b.timedOut++;
    if (typeof r.duration_ms === 'number') {
        b.durations.push(r.duration_ms);
        b.durationMs.samples++;
        b.durationMs.sum += r.duration_ms;
        if (r.timed_out === true) {
            b.timeoutDurationMs.samples++;
            b.timeoutDurationMs.sum += r.duration_ms;
        }
    }
    if (typeof r.prompt_tokens === 'number') {
        b.promptTokens.samples++;
        b.promptTokens.sum += r.prompt_tokens;
    }
}
function summary({ durations, ...b }) {
    const measured = (s) => ({
        ...s,
        sum: s.samples ? s.sum : null,
    });
    return {
        ...b,
        durationMs: { ...measured(b.durationMs), median: median(durations) },
        timeoutDurationMs: measured(b.timeoutDurationMs),
        promptTokens: measured(b.promptTokens),
    };
}
export async function metrics(p, signal, observed = Date.now()) {
    if (!isAbsolute(p.workspace))
        throw new Error('Invalid workspace');
    if (!Number.isInteger(p.utcOffsetMinutes) ||
        p.utcOffsetMinutes < -720 ||
        p.utcOffsetMinutes > 840)
        throw new Error('UTC offset must be -720..840 minutes; fixed-offset calendar, not DST');
    const shift = p.utcOffsetMinutes * 60000, start = date(p.since) - shift, end = date(p.until) - shift;
    if (end <= start || end - start > 7 * DAY)
        throw new Error('Use a positive interval of at most seven days; until exclusive');
    const days = Array.from({ length: (end - start) / DAY }, (_, i) => ({
        day: new Date(start + shift + i * DAY).toISOString().slice(0, 10),
        dayClosed: start + (i + 1) * DAY <= observed,
        total: cohort(),
        byRole: Object.create(null),
        reviewVerdicts: Object.create(null),
    }));
    const bucket = (time) => time >= start && time < Math.min(end, observed)
        ? days[Math.floor((time - start) / DAY)]
        : undefined;
    for await (const { kind, metadata: r } of observations(p.workspace, signal)) {
        const time = timestamp(kind === 'run' ? r.started_at : r.created);
        if (!Number.isFinite(time))
            throw new Error('Invalid metrics timestamp; measurement unavailable');
        if (kind === 'run' &&
            (typeof r.role !== 'string' ||
                !r.role ||
                !['running', 'done', 'failed'].includes(String(r.status))))
            throw new Error('Invalid run role or status; measurement unavailable');
        if (kind === 'review' && (typeof r.verdict !== 'string' || !r.verdict))
            throw new Error('Invalid review verdict; measurement unavailable');
        const b = bucket(time);
        if (!b)
            continue;
        if (kind === 'review') {
            const verdict = r.verdict;
            b.reviewVerdicts[verdict] = (b.reviewVerdicts[verdict] ?? 0) + 1;
        }
        else {
            const role = r.role;
            for (const field of ['duration_ms', 'prompt_tokens'])
                if (r[field] != null && !nonnegative(r[field]))
                    throw new Error(`Invalid ${field}; measurement unavailable`);
            accumulate(b.total, r, time, observed);
            accumulate((b.byRole[role] ??= cohort()), r, time, observed);
        }
    }
    const result = {
        since: p.since,
        until: p.until,
        utcOffsetMinutes: p.utcOffsetMinutes,
        collection: {
            startedAt: new Date(observed).toISOString(),
            finishedAt: new Date().toISOString(),
        },
        days: days.map((b) => ({
            day: b.day,
            dayClosed: b.dayClosed,
            runs: {
                total: summary(b.total),
                byRole: Object.fromEntries(Object.keys(b.byRole)
                    .sort()
                    .map((role) => [role, summary(b.byRole[role])])),
            },
            workspaceActivity: {
                reviewVerdicts: Object.fromEntries(Object.entries(b.reviewVerdicts).sort(([a], [b]) => a.localeCompare(b))),
            },
        })),
    };
    if (Buffer.byteLength(redactedJson(result)) > 8192)
        throw new Error('Metrics exceed 8 KiB; narrow the date interval');
    return result;
}
export function registerMetricsTool(registry) {
    registry.registerTool({
        name: 'deus_dexter_metrics',
        label: 'Run and review metrics',
        annotations: readOnly,
        description: 'Daily run-start cohorts: totals and exact observed-role breakdowns. Separate workspace review-created counts. Fixed UTC offset (180 = +03:00), no DST; until exclusive, max seven days/8 KiB. Terminal outcomes use collection.startedAt cutoff, including completion after until. dayClosed means calendar day ended, not immutable data. Collection is nontransactional. Sampled recorded durations/prompt counters are not CPU/context/billing. No delivery attribution, liveness or acceptance.',
        parameters: Type.Object({
            workspace: Type.String(),
            since: Type.String(),
            until: Type.String(),
            utcOffsetMinutes: Type.Integer({ minimum: -720, maximum: 840 }),
        }, { additionalProperties: false }),
        async execute(_id, p, signal) {
            try {
                return jsonResult(await metrics(p, signal));
            }
            catch (error) {
                if (typeof error.code === 'string')
                    throw new Error('Metrics metadata unavailable on server host');
                throw error;
            }
        },
    });
}
