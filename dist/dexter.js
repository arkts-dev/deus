import { isAbsolute } from 'node:path';
import { runProcess } from './process.js';
import { verifyCommitSignature } from './dexter-signature.js';
import { mutationReceipt } from './receipt.js';
export const MUTATION_COMMANDS = [
    'submit',
    'issue',
    'nudge-issue',
    'reprioritize-issue',
    'relink-issue',
    'accept-architecture',
];
const issueId = (value) => /^ISSUE-\d+$/.test(value);
const priorityValid = (value) => Number.isInteger(value) && value >= 1 && value <= 4;
const literal = (value) => typeof value === 'string' && !value.includes('\0');
const submissionValid = (p) => p.title.trim().length > 0 && literal(p.title) && literal(p.body);
/** Typed mutations use one verified executable/argv route, never a shell or retries. */
export class DexterPlugin {
    executable;
    cwd;
    cached;
    constructor(executable = process.env.DEXTER_BIN || 'dexter', cwd = process.cwd()) {
        this.executable = executable;
        this.cwd = cwd;
    }
    async probe(signal) {
        const result = await verifyCommitSignature(this.executable, this.cwd);
        const cacheKey = result.commit ? `commit:${result.commit}` : `error:${result.error}`;
        if (this.cached?.identity === cacheKey)
            return this.cached.report;
        const diagnostics = result.diagnostics;
        if (!result.error)
            diagnostics.version = await runProcess(this.executable, ['--version'], {
                cwd: this.cwd,
                signal,
            });
        const report = {
            executable: this.executable,
            profile: result.error ? 'unknown' : 'dexter-signed',
            baselineRevision: result.commit,
            supportedCommands: result.error ? [] : MUTATION_COMMANDS,
            diagnostics,
            reasons: result.error ? [result.error] : [],
            verifiedCommit: result.commit || undefined,
            verifiedFingerprint: result.fingerprint ?? undefined,
        };
        if (!Object.values(diagnostics).some((r) => r.cancelled))
            this.cached = { identity: cacheKey, report };
        return report;
    }
    submit(p, signal) {
        return this.invoke('submit', [`--body=${p.body}`, '--', p.title], p, submissionValid(p), signal);
    }
    createIssue(p, signal) {
        const args = [`--title=${p.title}`, `--body=${p.body}`, '--priority', String(p.priority ?? 3)];
        if (p.parent !== undefined)
            args.push('--parent', p.parent);
        if (p.dependencies?.length)
            args.push('--depends', p.dependencies.join(','));
        return this.invoke('issue', args, p, submissionValid(p) &&
            priorityValid(p.priority ?? 3) &&
            (p.parent === undefined || issueId(p.parent)) &&
            (p.dependencies ?? []).every(issueId), signal);
    }
    nudgeIssue(p, signal) {
        return this.invoke('nudge-issue', [p.issue], p, issueId(p.issue), signal);
    }
    reprioritizeIssue(p, signal) {
        return this.invoke('reprioritize-issue', [p.issue, '--priority', String(p.priority)], p, issueId(p.issue) && priorityValid(p.priority), signal);
    }
    relinkIssue(p, signal) {
        const args = [p.issue];
        if (p.parent === null)
            args.push('--clear-parent');
        else if (p.parent !== undefined)
            args.push('--parent', p.parent);
        for (const dep of p.addDependencies ?? [])
            args.push('--add-dependency', dep);
        for (const dep of p.removeDependencies ?? [])
            args.push('--remove-dependency', dep);
        return this.invoke('relink-issue', args, p, issueId(p.issue) &&
            (p.parent == null || issueId(p.parent)) &&
            [...(p.addDependencies ?? []), ...(p.removeDependencies ?? [])].every(issueId) &&
            (p.parent !== undefined || args.length > 1) &&
            !(p.addDependencies ?? []).some((dep) => p.removeDependencies?.includes(dep)), signal);
    }
    acceptArchitecture(p, signal) {
        return this.invoke('accept-architecture', [p.issue, '--candidate', p.candidate, `--reason=${p.reason}`], p, issueId(p.issue) &&
            /^AC-\d+$/.test(p.candidate) &&
            literal(p.reason) &&
            p.reason.trim().length > 0, signal);
    }
    async invoke(command, args, { workspace, issue }, valid, signal) {
        if (!isAbsolute(workspace) || !literal(workspace) || !valid || !args.every(literal))
            return mutationReceipt('rejected', {
                issue,
                reasons: ['Invalid typed arguments or workspace'],
            });
        const probe = await this.probe(signal);
        if (probe.profile === 'unknown')
            return mutationReceipt('rejected', { profile: probe.profile, issue, reasons: probe.reasons });
        if (signal?.aborted)
            return mutationReceipt('rejected', {
                profile: probe.profile,
                issue,
                cancelled: true,
                reasons: ['Cancelled before execution'],
            });
        const raw = await runProcess(this.executable, [command, `--dir=${workspace}`, ...args], {
            cwd: this.cwd,
            signal,
            truncateOutput: true,
        });
        const status = raw.exitCode === 0 && !raw.error && !raw.timedOut && !raw.cancelled && !raw.signal
            ? 'completed'
            : 'outcome_unknown';
        const created = /\bcreated (ISSUE-\d+)\b/.exec(raw.stdout)?.[1];
        return mutationReceipt(status, {
            profile: probe.profile,
            issue: issue ?? created,
            exitCode: raw.exitCode,
            signal: raw.signal,
            timedOut: raw.timedOut,
            cancelled: raw.cancelled,
            stdout: raw.stdout,
            stderr: raw.stderr,
            diagnosticsTruncated: raw.truncated,
            reasons: raw.error
                ? [raw.error]
                : status === 'outcome_unknown'
                    ? ['Inspect live state before another decision; do not retry automatically']
                    : [],
        });
    }
}
