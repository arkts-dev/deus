import { type ProcessResult } from './process.js';
import { type MutationReceipt } from './receipt.js';
export declare const MUTATION_COMMANDS: readonly ["submit", "issue", "nudge-issue", "reprioritize-issue", "relink-issue", "accept-architecture", "reject-issue"];
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
export interface EpicCreation {
    workspace: string;
    title: string;
    body: string;
}
export interface TaskCreation extends EpicCreation {
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
/** Typed mutations use one verified executable/argv route, never a shell or retries. */
export declare class DexterPlugin {
    readonly executable: string;
    readonly cwd: string;
    constructor(executable?: string, cwd?: string);
    probe(signal?: AbortSignal): Promise<ProbeReport>;
    createEpic(p: EpicCreation, signal?: AbortSignal): Promise<MutationReceipt>;
    createTask(p: TaskCreation, signal?: AbortSignal): Promise<MutationReceipt>;
    nudgeIssue(p: IssueTarget, signal?: AbortSignal): Promise<MutationReceipt>;
    rejectIssue(p: IssueTarget, signal?: AbortSignal): Promise<MutationReceipt>;
    reprioritizeIssue(p: IssueTarget & {
        priority: number;
    }, signal?: AbortSignal): Promise<MutationReceipt>;
    relinkIssue(p: IssueRelink, signal?: AbortSignal): Promise<MutationReceipt>;
    acceptArchitecture(p: IssueTarget & {
        candidate: string;
        reason: string;
    }, signal?: AbortSignal): Promise<MutationReceipt>;
    private invoke;
}
