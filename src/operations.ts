/** Local read-only scheduler evidence; never opens the CLI or initializes layout. */
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { hostname } from 'node:os';
import { SignedCursor } from './cursor.js';
import { document, source } from './artifacts.js';
import { digest, redactedJson } from './process.js';
import { schedulerRead, workingRuns } from './scheduler.js';

const MAX_PAGE_BYTES = 16384;
function pidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}
export async function botsLive(workspace: string) {
  if (!isAbsolute(workspace)) throw new Error('workspace must be an absolute path');
  const root = await realpath(workspace),
    now = Date.now();
  const config = JSON.parse(await source(root, ['dexter.config.json']));
  const ttl = config.heartbeat_ttl_seconds;
  if (!Number.isInteger(ttl) || ttl < 1) throw new Error('Invalid heartbeat TTL');
  const runs = (await workingRuns(root)).map((run) => {
    const heartbeatAgeSeconds = (now - Date.parse(run.lastHeartbeat)) / 1000;
    const ownerAlive = run.host === hostname() ? pidAlive(run.pid!) : null;
    return {
      ...run,
      heartbeatAgeSeconds,
      livenessBasis: ownerAlive === null ? 'heartbeat' : 'local_pid',
      active: ownerAlive ?? heartbeatAgeSeconds < ttl,
    };
  });
  const result = {
    observedAt: new Date(now).toISOString(),
    runs,
    reservations: 'not_observable',
    throttling: 'not_observable',
  };
  const text = redactedJson(result);
  if (Buffer.byteLength(text) > MAX_PAGE_BYTES)
    throw new Error('Live ownership exceeds 16 KiB; use ordinary read-only inspection');
  return JSON.parse(text) as typeof result;
}

export class EventReader {
  private readonly cursor = new SignedCursor();
  async read(p: { workspace: string; cursor?: string | null; limit?: number }) {
    if (!isAbsolute(p.workspace)) throw new Error('workspace must be an absolute path');
    const root = await realpath(p.workspace),
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
    const rows = await schedulerRead(root, (db) => {
      if (
        db
          .prepare(
            "SELECT 1 FROM notification_events WHERE seq_length != length(seq) OR seq = '' OR seq GLOB '*[^0-9]*' OR substr(seq, 1, 1) = '0' LIMIT 1",
          )
          .get()
      )
        throw new Error('Invalid event sequence');
      return db
        .prepare(
          'SELECT seq, seq_length, document FROM notification_events WHERE seq_length < ? OR (seq_length = ? AND seq < ?) ORDER BY seq_length DESC, seq DESC LIMIT ?',
        )
        .all(String(before).length, String(before).length, String(before), limit + 1);
    });
    const events: Record<string, unknown>[] = [];
    for (const row of rows.slice(0, limit)) {
      if (
        typeof row.seq !== 'string' ||
        !/^[1-9][0-9]*$/.test(row.seq) ||
        !Number.isSafeInteger(Number(row.seq)) ||
        row.seq_length !== row.seq.length ||
        typeof row.document !== 'string'
      )
        throw new Error('Invalid event sequence');
      const metadata = document(row.document).metadata,
        seq = Number(row.seq);
      if (
        metadata.seq !== seq ||
        typeof metadata.type !== 'string' ||
        !metadata.type ||
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
          'workdir',
          'host',
          'note',
        ]
          .filter((k) => metadata[k] !== undefined && metadata[k] !== null)
          .map((k) => [k, metadata[k]]),
      );
      const text = redactedJson(event);
      if (Buffer.byteLength(text) > MAX_PAGE_BYTES)
        throw new Error('Event summary exceeds 16 KiB; use ordinary read-only inspection');
      events.push(JSON.parse(text));
      const continuation =
        rows.length > events.length ? this.cursor.encode({ identity, before: seq }) : null;
      if (Buffer.byteLength(redactedJson({ events, nextCursor: continuation })) > 8192) {
        events.pop();
        if (!events.length)
          throw new Error('Event summary exceeds 8 KiB; use ordinary read-only inspection');
        break;
      }
    }
    const nextCursor =
      events.length && events.length < rows.length
        ? this.cursor.encode({ identity, before: events.at(-1)!.seq })
        : null;
    return { events, nextCursor };
  }
}
