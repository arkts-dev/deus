import type { TestContext } from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile, chmod, rm, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

export async function fixture(t: TestContext, folder = '') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'deus-reader-')));
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
