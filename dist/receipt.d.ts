export type MutationStatus = 'rejected' | 'completed' | 'outcome_unknown';
export interface MutationReceipt {
    status: MutationStatus;
    profile?: 'dexter-signed' | 'unknown';
    issue?: string;
    changed?: boolean;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    cancelled: boolean;
    diagnostics: {
        stdout: string;
        stderr: string;
        truncated: boolean;
    };
    reasons: string[];
}
export declare function boundedText(text: string, bytes: number): string;
export declare function bytePage(content: string, offset: number, limit: number): {
    text: string;
    nextOffset: number | null;
};
export declare function mutationReceipt(status: MutationStatus, p?: Partial<Omit<MutationReceipt, 'status' | 'diagnostics'>> & {
    stdout?: string;
    stderr?: string;
    diagnosticsTruncated?: boolean;
}): MutationReceipt;
