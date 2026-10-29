/** Current Dexter scheduler persistence. Opens existing databases read-only; never initializes. */
import { DatabaseSync } from 'node:sqlite';
import { isAbsolute } from 'node:path';
import { realpath } from 'node:fs/promises';
import { safePath, RUN_ID, ISSUE_ID } from './artifacts.js';

export async function schedulerRead<T>(
  workspace: string,
  read: (db: DatabaseSync) => T,
): Promise<T> {
  if (!isAbsolute(workspace)) throw new Error('workspace must be an absolute path');
  const root = await realpath(workspace);
  const path = await safePath(root, 'scheduler.sqlite3');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 1000; BEGIN');
    return read(db);
  } finally {
    db.close();
  }
}

export interface RunLease {
  id: string;
  role: string;
  status: string;
  host: string | null;
  pid: number | null;
  issue: string | null;
  lastHeartbeat: string;
}
export async function workingRuns(workspace: string): Promise<RunLease[]> {
  return schedulerRead(workspace, (db) =>
    db
      .prepare('SELECT id, role, status, host, pid, issue, last_heartbeat FROM runs ORDER BY id')
      .all()
      .flatMap((r) => {
        if (
          typeof r.id !== 'string' ||
          !RUN_ID.test(r.id) ||
          typeof r.role !== 'string' ||
          !r.role ||
          !['working', 'finished'].includes(String(r.status)) ||
          typeof r.last_heartbeat !== 'string' ||
          !Number.isFinite(Date.parse(r.last_heartbeat)) ||
          (r.issue !== null && (typeof r.issue !== 'string' || !ISSUE_ID.test(r.issue)))
        )
          throw new Error('Invalid scheduler run lease');
        if (r.status !== 'working') return [];
        if (
          typeof r.host !== 'string' ||
          !r.host ||
          typeof r.pid !== 'number' ||
          !Number.isSafeInteger(r.pid) ||
          r.pid <= 0
        )
          throw new Error('Working run lacks valid ownership');
        return [
          {
            id: r.id,
            role: r.role,
            status: r.status,
            host: r.host,
            pid: r.pid,
            issue: r.issue as string | null,
            lastHeartbeat: r.last_heartbeat,
          },
        ];
      }),
  );
}
