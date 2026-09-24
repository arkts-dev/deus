export interface SourceReceipt {
    id: string;
    kind: 'local' | 'external';
    locator: string;
    sha256: string;
    inspectedAt: string;
    revision?: string;
    dirtyDigest?: string;
    root?: string;
    path?: string;
    text: string;
}
export interface Finding {
    statement: string;
    provenance: 'local_verified' | 'external_verified' | 'inference' | 'parametric_unverified' | 'gap';
    sources: string[];
    quote?: string;
}
export interface ResearchReport {
    id: string;
    question: string;
    briefDigest: string;
    status: 'completed' | 'partial' | 'unavailable' | 'cancelled';
    findings: Finding[];
    mechanism: string;
    consequences: string;
    applicability: string;
    uncertainty: string[];
    decisionDimensions: string[];
    gaps: string[];
    receipts: SourceReceipt[];
    limits: {
        requests: number;
        maxRequests: number;
        turns: number;
        elapsedMs: number;
        usage?: unknown;
    };
    receiptValidation: 'passed';
    semanticReview: 'required';
    createdAt: string;
}
export declare function validateFindings(findings: Finding[], receipts: SourceReceipt[]): void;
export declare function newReceipt(input: Omit<SourceReceipt, 'id' | 'inspectedAt'>): SourceReceipt;
export declare function briefDigest(question: string, materials?: unknown): string;
