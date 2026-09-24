import { type ProcessResult } from './process.js';
export declare const COMMANDS: readonly ["init", "submit", "issue", "run", "status", "show", "doctor", "requests", "answer", "deny", "wiki", "nudge-issue", "reprioritize-issue", "accept-architecture", "relink-issue", "cmd"];
export type DexterCommand = (typeof COMMANDS)[number];
export interface ProbeReport {
    executable: string;
    profile: 'dexter-bridge-b53f384' | 'unknown';
    baselineRevision: string;
    supportedCommands: readonly DexterCommand[];
    diagnostics: Record<string, ProcessResult>;
    reasons: string[];
}
export interface ExecResult {
    command: DexterCommand;
    workspace: string;
    profile: ProbeReport['profile'];
    status: 'executed' | 'blocked_unknown_profile';
    raw?: ProcessResult;
    reasons: string[];
}
/** No disk cache: a replaced executable always gets new help/version evidence. */
export declare class DexterPlugin {
    readonly executable: string;
    readonly cwd: string;
    private cached?;
    constructor(executable?: string, cwd?: string);
    probe(signal?: AbortSignal): Promise<ProbeReport>;
    exec(command: DexterCommand, args: string[], workspace: string, signal?: AbortSignal): Promise<ExecResult>;
}
