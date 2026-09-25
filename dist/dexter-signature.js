// Trust the signer, not the help text. Named *_TRUSTED_FINGERPRINTS (not *_KEYS):
// process.ts redact() masks env values whose name matches /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/,
// which would corrupt the fingerprint in captured gpg output before comparison.
import { access, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { runProcess, succeeded } from './process.js';
const KEYSERVER = 'hkps://keyserver.ubuntu.com';
export function trustedFingerprints() {
    return (process.env.DEUS_DEXTER_TRUSTED_FINGERPRINTS ?? '')
        .split(',')
        .map((value) => value.replace(/\s/g, '').toUpperCase())
        .filter((value) => /^[0-9A-F]{40}$/.test(value));
}
async function resolveExecutablePath(executable, cwd) {
    const candidates = executable.includes('/')
        ? [isAbsolute(executable) ? executable : join(cwd, executable)]
        : (process.env.PATH ?? '').split(delimiter).map((dir) => join(dir || cwd, executable));
    for (const candidate of candidates) {
        try {
            await access(candidate);
            return await realpath(candidate);
        }
        catch {
            /* inspect next PATH entry */
        }
    }
    return null;
}
async function findRepoRoot(startDir) {
    let dir = startDir;
    for (;;) {
        try {
            await access(join(dir, '.git'));
            return dir;
        }
        catch {
            /* keep walking up */
        }
        const parent = dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
}
export async function verifyCommitSignature(executable, cwd) {
    const diagnostics = {};
    const trusted = trustedFingerprints();
    const fail = (error) => ({
        commit: '',
        fingerprint: null,
        error,
        diagnostics,
    });
    if (trusted.length === 0)
        return fail('DEUS_DEXTER_TRUSTED_FINGERPRINTS is empty or malformed');
    const exePath = await resolveExecutablePath(executable, cwd);
    if (!exePath)
        return fail(`cannot resolve executable: ${executable}`);
    const repo = await findRepoRoot(dirname(exePath));
    if (!repo)
        return fail(`no git repository found above ${dirname(exePath)}`);
    const revParse = await runProcess('git', ['-C', repo, 'rev-parse', 'HEAD'], { cwd });
    diagnostics['git rev-parse HEAD'] = revParse;
    if (!succeeded(revParse))
        return fail('git rev-parse HEAD failed');
    const commit = revParse.stdout.trim();
    const tmp = await mkdtemp(join(tmpdir(), 'deus-gpg-'));
    const env = { ...process.env, GNUPGHOME: tmp };
    try {
        for (const fingerprint of trusted) {
            diagnostics[`gpg --recv-keys ${fingerprint.slice(-16)}`] = await runProcess('gpg', ['--batch', '--keyserver', KEYSERVER, '--recv-keys', fingerprint], { cwd, env });
        }
        const verify = await runProcess('git', ['-C', repo, 'verify-commit', '--raw', commit], {
            cwd,
            env,
        });
        diagnostics['git verify-commit'] = verify;
        if (!succeeded(verify))
            return fail('git verify-commit failed (signature not valid)');
        const match = verify.stderr.match(/VALIDSIG\s+([0-9A-F]{40})/);
        const fingerprint = match ? match[1] : null;
        if (!fingerprint)
            return fail('no VALIDSIG status in verify-commit output');
        if (!trusted.includes(fingerprint))
            return fail(`signer ${fingerprint} is not in DEUS_DEXTER_TRUSTED_FINGERPRINTS`);
        return { commit, fingerprint, error: null, diagnostics };
    }
    finally {
        await rm(tmp, { recursive: true, force: true });
    }
}
