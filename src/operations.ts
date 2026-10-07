/** Local read-only operational evidence; never opens the CLI or initializes layout. */
import { readdir, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { hostname } from 'node:os';
import { SignedCursor } from './cursor.js';
import { document, safePath, source } from './artifacts.js';
import { digest, redactedJson } from './process.js';

const MAX_PAGE_BYTES = 16384;
const validResource = (value: string) =>
  /^(issue:ISSUE-\d+|command:CMD-\d+|lane:[A-Za-z0-9][A-Za-z0-9_.-]*)$/.test(value);
async function workspaceRoot(workspace: string) {
  if (!isAbsolute(workspace)) throw new Error('workspace must be an absolute path');
  return realpath(workspace);
}
const age = (timestamp: unknown, now: number) => {
  const time = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(time)) throw new Error('Invalid heartbeat timestamp');
  return (now - time) / 1000;
};
function pidAlive(pid: unknown) {
  if (!Number.isInteger(pid) || Number(pid) <= 0) throw new Error('Invalid owner PID');
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}
interface OperationalConfig {
  bot_heartbeat_ttl_seconds?: number;
  claim_ttl_seconds?: number;
  max_concurrent_runs?: number;
  default_llm_config?: { model?: string; base_url?: string };
  model_info?: Record<string, { provider_managed?: boolean }>;
}
function cooldown(config: OperationalConfig, now: number) {
  const at = new Date(now),
    hour = at.getUTCHours();
  const endHour = hour >= 1 && hour < 4 ? 4 : hour >= 6 && hour < 10 ? 10 : null;
  const model = config.default_llm_config?.model;
  const managed =
    config.model_info === undefined
      ? ['deepseek-flash', 'deepseek-v4-pro'].includes(model ?? '')
      : model !== undefined && config.model_info[model]?.provider_managed === true;
  let official = false;
  try {
    const url = new URL(config.default_llm_config?.base_url ?? '');
    official = url.protocol === 'https:' && url.hostname === 'api.deepseek.com';
  } catch {}
  const configured = config.max_concurrent_runs ?? 1;
  if (!Number.isInteger(configured) || configured < 1)
    throw new Error('Invalid concurrency configuration');
  const active = official && managed && endHour !== null && configured > 1;
  if (active) at.setUTCHours(endHour!, 0, 0, 0);
  return {
    basis: 'persisted_config',
    configured,
    policyLimit: active ? 1 : configured,
    endsAt: active ? at.toISOString() : null,
  };
}
export async function botsLive(workspace: string) {
  const root = await workspaceRoot(workspace),
    now = Date.now();
  const config: OperationalConfig = JSON.parse(await source(root, ['dexter.config.json']));
  const ttl = config.bot_heartbeat_ttl_seconds ?? 60,
    claimTtl = config.claim_ttl_seconds ?? 60;
  if (![ttl, claimTtl].every((v) => Number.isInteger(v) && v > 0))
    throw new Error('Invalid lease TTL');
  const claims: {
    resource: string;
    worker: string;
    host: string;
    pid: number;
    ts: string;
    witness: string | null;
    recordStale: boolean;
  }[] = [];
  for (const file of (await readdir(await safePath(root, 'forge', '.claims')))
    .filter((f) => f.endsWith('.lock'))
    .sort()) {
    // The sixth line is an optional witness, including an empty trailing line.
    const raw = await source(root, ['forge', '.claims', file]);
    const lines = raw.replace(/\n$/, '').split('\n');
    const [resource, worker, host, pid, ts, witness] = lines;
    if (
      lines.length !== 6 ||
      !resource ||
      !validResource(resource) ||
      (witness && !validResource(witness)) ||
      !worker ||
      !host ||
      !ts ||
      !Number.isInteger(Number(pid)) ||
      Number(pid) <= 0 ||
      file !== `${resource.replace(/[^A-Za-z0-9_.-]/g, '_')}.lock`
    )
      throw new Error('Invalid claim record');
    const ownerAlive = host === hostname() ? pidAlive(Number(pid)) : null;
    claims.push({
      resource,
      worker,
      host,
      pid: Number(pid),
      ts,
      witness: witness || null,
      recordStale: age(ts, now) >= claimTtl || ownerAlive === false,
    });
  }
  const owner = (
    a: { worker: unknown; host: unknown; pid: unknown },
    b: { worker: unknown; host: unknown; pid: unknown },
  ) => a.worker === b.worker && a.host === b.host && a.pid === b.pid;
  const correlated = claims.map(({ recordStale, ...claim }) => {
    const witness = claims.find((c) => c.resource === claim.witness && owner(c, claim));
    return { ...claim, stale: recordStale && (!witness || witness.recordStale) };
  });
  const bots = [];
  for (const file of (await readdir(await safePath(root, 'forge', 'bots')))
    .filter((f) => /^BOT-\d+\.md$/.test(f))
    .sort()) {
    const bot = document(await source(root, ['forge', 'bots', file])).metadata;
    if (`${bot.id}.md` !== file) throw new Error('Bot identity mismatch');
    if (bot.status !== 'working') continue;
    if (
      typeof bot.worker !== 'string' ||
      !bot.worker ||
      typeof bot.host !== 'string' ||
      !bot.host ||
      !Number.isInteger(bot.pid) ||
      Number(bot.pid) <= 0
    )
      throw new Error('Working bot lacks valid ownership');
    const heartbeatAgeSeconds = age(bot.last_heartbeat, now);
    const ownerAlive = bot.host === hostname() ? pidAlive(bot.pid) : null;
    bots.push({
      id: bot.id,
      role: bot.role,
      worker: bot.worker,
      host: bot.host,
      pid: bot.pid,
      issue: bot.current_issue,
      mr: bot.current_mr,
      run: bot.current_run,
      lastHeartbeat: bot.last_heartbeat,
      heartbeatAgeSeconds,
      livenessBasis: ownerAlive === null ? 'heartbeat' : 'local_pid',
      active: ownerAlive ?? heartbeatAgeSeconds < ttl,
      claims: correlated
        .filter((c) => owner(c, { worker: bot.worker, host: bot.host, pid: bot.pid }))
        .map((c) => c.resource),
    });
  }
  const result = {
    observedAt: new Date(now).toISOString(),
    bots,
    claims: correlated,
    cooldown: cooldown(config, now),
  };
  const text = redactedJson(result);
  if (Buffer.byteLength(text) > MAX_PAGE_BYTES)
    throw new Error('Live ownership exceeds 16 KiB; use ordinary read-only inspection');
  return JSON.parse(text) as typeof result;
}

export class EventReader {
  private readonly cursor = new SignedCursor();
  async read(p: { workspace: string; cursor?: string | null; limit?: number }) {
    const root = await workspaceRoot(p.workspace),
      identity = digest(root),
      limit = p.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('limit must be 1..100 events');
    let before = Number.MAX_SAFE_INTEGER;
    if (p.cursor) {
      const decoded = this.cursor.decode(p.cursor);
      if (
        decoded.identity !== identity ||
        typeof decoded.before !== 'number' ||
        !Number.isSafeInteger(decoded.before) ||
        decoded.before < 1
      )
        throw new Error('Cursor belongs to another workspace or has an invalid sequence');
      before = decoded.before;
    }
    const files = (await readdir(await safePath(root, 'bus')))
      .flatMap((file) => {
        const match = /^(\d+)-.+\.md$/.exec(file);
        return match && Number(match[1]) < before ? [{ file, seq: Number(match[1]) }] : [];
      })
      .sort((a, b) => b.seq - a.seq);
    if (
      files.some((f, i) => !Number.isSafeInteger(f.seq) || f.seq < 1 || f.seq === files[i - 1]?.seq)
    )
      throw new Error('Invalid or duplicate event sequence');
    const events: Record<string, unknown>[] = [];
    let bytes = 0;
    for (const { file, seq } of files.slice(0, limit)) {
      const metadata = document(await source(root, ['bus', file])).metadata;
      if (
        metadata.seq !== seq ||
        file !== `${String(seq).padStart(6, '0')}-${metadata.type}.md` ||
        !Number.isFinite(Date.parse(String(metadata.ts)))
      )
        throw new Error('Invalid event identity');
      const event = Object.fromEntries(
        [
          'seq',
          'ts',
          'type',
          'actor',
          'run',
          'issue',
          'mr',
          'review_id',
          'bot',
          'worker',
          'host',
          'note',
        ].map((k) => [k, metadata[k] ?? null]),
      );
      const text = redactedJson(event);
      const size = Buffer.byteLength(text);
      if (size > MAX_PAGE_BYTES)
        throw new Error('Event summary exceeds 16 KiB; use ordinary read-only inspection');
      if (bytes + size > MAX_PAGE_BYTES) break;
      events.push(JSON.parse(text));
      bytes += size;
    }
    let nextCursor: string | null = null;
    if (events.length && events.length < files.length) {
      nextCursor = this.cursor.encode({ identity, before: events.at(-1)!.seq });
    }
    return { events, nextCursor };
  }
}
