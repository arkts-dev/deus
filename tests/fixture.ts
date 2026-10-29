import type { TestContext } from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { DexterPlugin, MUTATION_COMMANDS } from '../src/dexter.js';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

/** Exact current scheduler table/column layout, not a CLI implementation. */
export async function schedulerFixture(root: string) {
  const db = new DatabaseSync(join(root, 'scheduler.sqlite3'));
  db.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL,
      host TEXT, pid INTEGER, issue TEXT, last_heartbeat TEXT NOT NULL,
      CONSTRAINT runs_status CHECK (status in ('working','finished'))) STRICT;
    CREATE TABLE notification_events (seq TEXT PRIMARY KEY NOT NULL, seq_length INTEGER NOT NULL, document TEXT NOT NULL) STRICT;
    CREATE INDEX notification_events_sequence ON notification_events(seq_length, seq);
  `);
  db.close();
}
export function schedulerWrite(root: string, write: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(join(root, 'scheduler.sqlite3'));
  try {
    write(db);
  } finally {
    db.close();
  }
}
export function eventFixture(root: string, seq: number, note = 'started') {
  schedulerWrite(root, (db) =>
    db
      .prepare('INSERT OR REPLACE INTO notification_events VALUES (?, ?, ?)')
      .run(
        String(seq),
        String(seq).length,
        `---\nseq: ${seq}\nts: 2026-10-07T07:00:00Z\ntype: run.started\nissue: ISSUE-0001\nnote: ${note}\n---\nPRIVATE BODY`,
      ),
  );
}

export async function fixture(t: TestContext, folder = '') {
  const root = await mkdtemp(join(tmpdir(), 'deus-reader-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (path: string, text: string) => {
    const file = join(root, folder, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  return { root, put };
}
export function environment(t: TestContext, key: string, value?: string) {
  const old = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
  });
}
export const secret = (t: TestContext, value: string) => environment(t, 'DEUS_TEST_SECRET', value);
export function trust(t: TestContext, client = DexterPlugin.prototype, signed = true) {
  t.mock.method(client, 'probe', async () => ({
    executable: 'fixture',
    profile: signed ? 'dexter-signed' : 'unknown',
    baselineRevision: 'fixture',
    supportedCommands: signed ? MUTATION_COMMANDS : [],
    diagnostics: {},
    reasons: signed ? [] : ['test: unsigned'],
  }));
}
export async function program(path: string, body: string) {
  await writeFile(path, `#!${process.execPath}\n${body}`);
  await chmod(path, 0o755);
}
export async function waitFile(path: string, contains = '') {
  for (let i = 0; i < 200; i++) {
    let text: string | undefined;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (text !== undefined && text.includes(contains)) return text;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Fixture process did not reach the expected state');
}
