import type { TestContext } from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

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
export function secret(t: TestContext, value: string) {
  const old = process.env.DEUS_TEST_SECRET;
  process.env.DEUS_TEST_SECRET = value;
  t.after(() => {
    if (old === undefined) delete process.env.DEUS_TEST_SECRET;
    else process.env.DEUS_TEST_SECRET = old;
  });
}
