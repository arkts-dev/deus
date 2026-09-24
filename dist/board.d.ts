/** Product control: typed board snapshot, PRODUCT classification, and the one approval-gated close edit. */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
export type Reason = 'NOISE' | 'DEAD' | 'SUPERSEDED';
export interface Issue {
    id: string;
    kind: string;
    status: string;
    priority: number;
    deps: string[];
    parent: string | null;
    workdir: string | null;
    mr: string | null;
    breakdown: string | null;
    claimed: boolean;
    title: string;
    body: string;
    file: string;
}
export interface Board {
    workspace: string;
    issues: Issue[];
    claims: string[];
    ready: string[];
    unclaimed: string[];
    blocked: string[];
}
export declare function loadBoard(workspace: string): Promise<Board>;
export declare function classify(issue: Issue, objective: string[]): {
    id: string;
    classification: string;
    evidence: string[];
};
export declare function preconditions(issue: Issue, board: Board): string[];
export declare function planBoard(board: Board): {
    objectiveTerms: string[];
    classifications: {
        id: string;
        classification: string;
        evidence: string[];
    }[];
    closes: {
        issue: string;
        reason: "NOISE";
        evidence: string[];
        unblocks: string[];
        errors: string[];
    }[];
    commands: {
        command: string;
        argv: string[];
        reason: string;
    }[];
    reports: string[];
    saturation: {
        before: number;
        after: number;
    };
};
export declare function applyClose(workspace: string, board: Board, issueId: string, reason: Reason, successor?: string): Promise<{
    issue: string;
    changed: boolean;
    reason: Reason;
}>;
export default function board(pi: ExtensionAPI): void;
