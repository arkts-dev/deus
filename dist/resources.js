import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
export const packageRoot = fileURLToPath(new URL('..', import.meta.url));
export const skillsRoot = join(packageRoot, 'skills');
/** Validate shipped skills without network access. */
export async function verifySkillIntegrity() {
    const { readFile } = await import('node:fs/promises');
    const { digest } = await import('./process.js');
    const lock = JSON.parse(await readFile(join(packageRoot, 'skills.lock.json'), 'utf8'));
    if (lock.schema !== 3)
        throw new Error('Unknown skills lock format');
    for (const entry of lock.entries) {
        if (!entry.output.startsWith('skills/') || entry.output.includes('..'))
            throw new Error('Invalid resource lock path');
        if (digest(await readFile(join(packageRoot, entry.output))) !== entry.sha256)
            throw new Error('Skill integrity mismatch: ' + entry.output);
    }
    return lock.entries.length;
}
