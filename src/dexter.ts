import { isAbsolute } from 'node:path';
import { runProcess, type ProcessResult } from './process.js';
import { verifyCommitSignature } from './dexter-signature.js';

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
] as const;
export type DexterCommand = (typeof COMMANDS)[number];
export interface ProbeReport {
  executable: string;
  profile: 'dexter-signed' | 'unknown';
  baselineRevision: string;
  supportedCommands: readonly DexterCommand[];
  diagnostics: Record<string, ProcessResult>;
  reasons: string[];
  verifiedCommit?: string;
  verifiedFingerprint?: string;
}
export interface ExecResult {
  command: DexterCommand;
  workspace: string;
  profile: ProbeReport['profile'];
  status: 'executed' | 'blocked_unknown_profile';
  raw?: ProcessResult;
  reasons: string[];
}

/**
 * Trust is established solely by verifying the installed Dexter commit's GPG signature
 * against DEUS_DEXTER_TRUSTED_FINGERPRINTS. The report is cached per commit SHA.
 */
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
    if (!result.error) {
      diagnostics.version = await runProcess(this.executable, ['--version'], {
        cwd: this.cwd,
        signal,
      });
    }
    const report: ProbeReport = {
      executable: this.executable,
      profile: result.error ? 'unknown' : 'dexter-signed',
      baselineRevision: result.commit,
      supportedCommands: result.error ? [] : COMMANDS,
      diagnostics,
      reasons: result.error ? [result.error] : [],
      verifiedCommit: result.commit || undefined,
      verifiedFingerprint: result.fingerprint ?? undefined,
    };
    if (!Object.values(diagnostics).some((r) => r.cancelled)) {
      this.cached = { identity: cacheKey, report };
    }
    return report;
  }

  async exec(
    command: DexterCommand,
    args: string[],
    workspace: string,
    signal?: AbortSignal,
  ): Promise<ExecResult> {
    if (!COMMANDS.includes(command)) throw new Error('Unsupported Dexter command');
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
    const argv =
      command === 'init' ? [command, workspace, ...args] : [command, ...args, '--dir', workspace];
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
