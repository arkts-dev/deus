import { isAbsolute } from 'node:path';
import { runProcess, type ProcessResult } from './process.js';
import { verifyCommitSignature } from './dexter-signature.js';
import { mutationReceipt, type MutationReceipt } from './receipt.js';

export const MUTATION_COMMANDS = [
  'submit',
  'issue',
  'nudge-issue',
  'reprioritize-issue',
  'relink-issue',
  'accept-architecture',
] as const;
export interface ProbeReport {
  executable: string;
  profile: 'dexter-signed' | 'unknown';
  baselineRevision: string;
  supportedCommands: readonly (typeof MUTATION_COMMANDS)[number][];
  diagnostics: Record<string, ProcessResult>;
  reasons: string[];
  verifiedCommit?: string;
  verifiedFingerprint?: string;
}
export interface Submission {
  workspace: string;
  title: string;
  body: string;
}
export interface IssueCreation extends Submission {
  parent?: string;
  dependencies?: string[];
  priority?: number;
}
export interface IssueTarget {
  workspace: string;
  issue: string;
}
export interface IssueRelink extends IssueTarget {
  parent?: string | null;
  addDependencies?: string[];
  removeDependencies?: string[];
}
const issueId = (value: string) => /^ISSUE-\d+$/.test(value);
const priorityValid = (value: number) => Number.isInteger(value) && value >= 1 && value <= 4;
const literal = (value: string) => typeof value === 'string' && !value.includes('\0');
const submissionValid = (p: Submission) =>
  p.title.trim().length > 0 && literal(p.title) && literal(p.body);

/** Typed mutations use one verified executable/argv route, never a shell or retries. */
export class DexterPlugin {
  private cached?: { identity: string; report: ProbeReport };
  constructor(
    readonly executable = process.env.DEXTER_BIN || 'dexter',
    readonly cwd = process.cwd(),
  ) {}

  async probe(signal?: AbortSignal): Promise<ProbeReport> {
    const result = await verifyCommitSignature(this.executable, this.cwd);
    const cacheKey = result.commit ? `commit:${result.commit}` : `error:${result.error}`;
    if (this.cached?.identity === cacheKey) return this.cached.report;
    const diagnostics = result.diagnostics;
    if (!result.error)
      diagnostics.version = await runProcess(this.executable, ['--version'], {
        cwd: this.cwd,
        signal,
      });
    const report: ProbeReport = {
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

  submit(p: Submission, signal?: AbortSignal) {
    return this.invoke(
      'submit',
      [`--body=${p.body}`, '--', p.title],
      p,
      submissionValid(p),
      signal,
    );
  }
  createIssue(p: IssueCreation, signal?: AbortSignal) {
    const args = [`--title=${p.title}`, `--body=${p.body}`, '--priority', String(p.priority ?? 3)];
    if (p.parent !== undefined) args.push('--parent', p.parent);
    if (p.dependencies?.length) args.push('--depends', p.dependencies.join(','));
    return this.invoke(
      'issue',
      args,
      p,
      submissionValid(p) &&
        priorityValid(p.priority ?? 3) &&
        (p.parent === undefined || issueId(p.parent)) &&
        (p.dependencies ?? []).every(issueId),
      signal,
    );
  }
  nudgeIssue(p: IssueTarget, signal?: AbortSignal) {
    return this.invoke('nudge-issue', [p.issue], p, issueId(p.issue), signal);
  }
  reprioritizeIssue(p: IssueTarget & { priority: number }, signal?: AbortSignal) {
    return this.invoke(
      'reprioritize-issue',
      [p.issue, '--priority', String(p.priority)],
      p,
      issueId(p.issue) && priorityValid(p.priority),
      signal,
    );
  }
  relinkIssue(p: IssueRelink, signal?: AbortSignal) {
    const args = [p.issue];
    if (p.parent === null) args.push('--clear-parent');
    else if (p.parent !== undefined) args.push('--parent', p.parent);
    for (const dep of p.addDependencies ?? []) args.push('--add-dependency', dep);
    for (const dep of p.removeDependencies ?? []) args.push('--remove-dependency', dep);
    return this.invoke(
      'relink-issue',
      args,
      p,
      issueId(p.issue) &&
        (p.parent == null || issueId(p.parent)) &&
        [...(p.addDependencies ?? []), ...(p.removeDependencies ?? [])].every(issueId) &&
        (p.parent !== undefined || args.length > 1) &&
        !(p.addDependencies ?? []).some((dep) => p.removeDependencies?.includes(dep)),
      signal,
    );
  }
  acceptArchitecture(p: IssueTarget & { candidate: string; reason: string }, signal?: AbortSignal) {
    return this.invoke(
      'accept-architecture',
      [p.issue, '--candidate', p.candidate, `--reason=${p.reason}`],
      p,
      issueId(p.issue) &&
        /^AC-\d+$/.test(p.candidate) &&
        literal(p.reason) &&
        p.reason.trim().length > 0,
      signal,
    );
  }

  private async invoke(
    command: (typeof MUTATION_COMMANDS)[number],
    args: string[],
    { workspace, issue }: { workspace: string; issue?: string },
    valid: boolean,
    signal?: AbortSignal,
  ): Promise<MutationReceipt> {
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
    const status =
      raw.exitCode === 0 && !raw.error && !raw.timedOut && !raw.cancelled && !raw.signal
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
