/** Read-only product board snapshots, classifications and scheduling proposals. */
import { type ToolRegistrar } from './tool-registry.js';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
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
    candidates: string[];
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
export declare function planBoard(board: Board): {
    objectiveTerms: string[];
    classifications: {
        id: string;
        classification: string;
        evidence: string[];
    }[];
    actions: {
        tool: string;
        parameters: Record<string, unknown>;
        reason: string;
    }[];
    reports: string[];
    saturation: {
        before: number;
        after: number;
    };
};
export declare function registerBoardTools(pi: ToolRegistrar): void;
export default function board(pi: ExtensionAPI): void;
