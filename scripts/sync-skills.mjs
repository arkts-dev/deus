import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const lockPath = join(root, 'skills.lock.json');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
if (lock.schema !== 3 || lock.version !== '0.3.0') throw new Error('Unknown skills lock format');
const expected = [
  'dexter-control',
  'designer',
  'product-control',
  'web-research',
  'local-research',
  'simplify-review',
];
if (
  lock.entries.length !== expected.length ||
  expected.some((name) => !lock.entries.some((entry) => entry.output === `skills/${name}/SKILL.md`))
)
  throw new Error('Skill discovery and lock disagree');
for (const entry of lock.entries) {
  if (
    !entry.output.startsWith('skills/') ||
    entry.output.includes('..') ||
    entry.origin !== 'deus-original' ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  )
    throw new Error('Invalid skill ownership or digest');
  const actual = sha(readFileSync(join(root, entry.output)));
  if (process.argv.includes('--update')) entry.sha256 = actual;
  else if (actual !== entry.sha256) throw new Error('Skill integrity mismatch: ' + entry.output);
}
if (process.argv.includes('--update'))
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(`Verified ${lock.entries.length} Deus skills`);
