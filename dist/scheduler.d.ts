/** Current Dexter scheduler persistence. Opens existing databases read-only; never initializes. */
import { DatabaseSync } from 'node:sqlite';
export declare function schedulerRead<T>(workspace: string, read: (db: DatabaseSync) => T): Promise<T>;
export interface RunLease {
    id: string;
    role: string;
    status: string;
    host: string | null;
    pid: number | null;
    issue: string | null;
    lastHeartbeat: string;
}
export declare function workingRuns(workspace: string): Promise<RunLease[]>;
