export declare class GitHubPlugin {
    readonly cwd: string;
    readonly repositories: string[];
    readonly executable: string;
    private readonly cursor;
    constructor(cwd?: string, repositories?: string[], executable?: string);
    private allowed;
    private json;
    private mutation;
    submit(p: {
        repository: string;
        kind: 'objective' | 'task';
        title: string;
        body: string;
    }, signal?: AbortSignal): Promise<import("./receipt.js").MutationReceipt>;
    answer(p: {
        repository: string;
        issue: number;
        inputKey: string;
        decisionKey: string;
        answer: string;
    }, signal?: AbortSignal): Promise<import("./receipt.js").MutationReceipt>;
    accept(p: {
        repository: string;
        issue: number;
        revision: string;
        evidence: string;
        decision: 'accepted' | 'rejected';
    }, signal?: AbortSignal): Promise<import("./receipt.js").MutationReceipt>;
    read(p: {
        repository: string;
        issue: number;
        section: 'issue' | 'comments' | 'pull-request';
        cursor: string | null;
        limit: number;
    }, signal?: AbortSignal): Promise<{
        text: string;
        revision: string;
        nextCursor: string | null;
    }>;
    archive(p: {
        repository: string;
        ref: string;
        path: string;
        cursor: string | null;
        limit: number;
    }, signal?: AbortSignal): Promise<{
        text: string;
        revision: string;
        nextCursor: string | null;
    }>;
    private page;
}
