import { access, realpath, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';
import { digest, runProcess, succeeded } from './process.js';
import { PROFILE_HELP_HASHES, PROFILE_SHA } from './dexter-profile.js';
export const COMMANDS = [
    'init',
    'submit',
    'issue',
    'run',
    'status',
    'show',
    'doctor',
    'requests',
    'answer',
    'deny',
    'wiki',
    'nudge-issue',
    'reprioritize-issue',
    'accept-architecture',
    'relink-issue',
    'cmd',
];
async function executableIdentity(executable, cwd) {
    const candidates = executable.includes('/')
        ? [isAbsolute(executable) ? executable : join(cwd, executable)]
        : (process.env.PATH ?? '').split(delimiter).map((dir) => join(dir || cwd, executable));
    for (const candidate of candidates) {
        try {
            await access(candidate);
            const path = await realpath(candidate);
            const s = await stat(path);
            return `${path}:${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
        }
        catch {
            /* inspect next PATH entry */
        }
    }
    return `missing:${executable}:${process.env.PATH ?? ''}`;
}
/** No disk cache: a replaced executable always gets new help/version evidence. */
export class DexterPlugin {
    executable;
    cwd;
    cached;
    constructor(executable = process.env.DEXTER_BIN || 'dexter', cwd = process.cwd()) {
        this.executable = executable;
        this.cwd = cwd;
    }
    async probe(signal) {
        const identity = await executableIdentity(this.executable, this.cwd);
        if (this.cached?.identity === identity)
            return this.cached.report;
        const diagnostics = {};
        diagnostics.version = await runProcess(this.executable, ['--version'], {
            cwd: this.cwd,
            signal,
        });
        diagnostics.help = await runProcess(this.executable, ['--help'], { cwd: this.cwd, signal });
        const reasons = [];
        for (const [name, expected] of Object.entries(PROFILE_HELP_HASHES)) {
            if (name !== 'version' && name !== 'help')
                diagnostics[name] = await runProcess(this.executable, [name, '--help'], {
                    cwd: this.cwd,
                    signal,
                });
            const actual = diagnostics[name];
            if (!succeeded(actual) || digest(actual.stdout) !== expected)
                reasons.push(`Unrecognized ${name} help/version fingerprint`);
        }
        const report = {
            executable: this.executable,
            profile: reasons.length ? 'unknown' : 'dexter-3fb8d375',
            baselineRevision: PROFILE_SHA,
            supportedCommands: reasons.length ? [] : COMMANDS,
            diagnostics,
            reasons,
        };
        if (!Object.values(diagnostics).some((result) => result.cancelled))
            this.cached = { identity, report };
        return report;
    }
    async exec(command, args, workspace, signal) {
        if (!COMMANDS.includes(command))
            throw new Error('Unsupported Dexter command');
        if (!isAbsolute(workspace) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0')))
            throw new Error('Absolute workspace and string argv required');
        if (args.includes('--dir') || args.some((arg) => arg.startsWith('--dir=')))
            throw new Error('Workspace binding belongs to deus_dexter_exec');
        const probe = await this.probe(signal);
        if (probe.profile === 'unknown')
            return {
                command,
                workspace,
                profile: 'unknown',
                status: 'blocked_unknown_profile',
                reasons: probe.reasons,
            };
        const argv = command === 'init' ? [command, workspace, ...args] : [command, ...args, '--dir', workspace];
        const raw = await runProcess(this.executable, argv, {
            cwd: this.cwd,
            signal,
            timeoutMs: command === 'run' || command === 'init' ? null : undefined,
            truncateOutput: command === 'run',
        });
        return {
            command,
            workspace,
            profile: probe.profile,
            status: 'executed',
            raw,
            reasons: probe.reasons,
        };
    }
}
