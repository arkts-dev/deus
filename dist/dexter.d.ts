import { type ProcessResult } from './process.js';
export declare const COMMANDS: readonly ["init", "submit", "issue", "run", "status", "show", "doctor", "requests", "answer", "deny", "wiki", "nudge-issue", "reprioritize-issue", "accept-architecture", "relink-issue", "cmd"];
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
export declare class DexterPlugin {
    readonly executable: string;
    readonly cwd: string;
    private cached?;
    constructor(executable?: string, cwd?: string);
    probe(signal?: AbortSignal): Promise<ProbeReport>;
    exec(command: DexterCommand, args: string[], workspace: string, signal?: AbortSignal): Promise<ExecResult>;
}
