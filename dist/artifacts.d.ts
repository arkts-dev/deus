export declare const SECTIONS: {
    readonly issue: readonly ["summary", "metadata", "body", "notes"];
    readonly mr: readonly ["summary", "metadata", "body", "reviews", "notes"];
    readonly wiki: readonly ["summary", "metadata", "body"];
    readonly run: readonly ["metadata", "assignment", "system", "transcript", "stderr"];
};
export type ArtifactKind = keyof typeof SECTIONS;
export interface ReadRequest {
    workspace: string;
    id: string;
    section?: string;
    cursor?: string | null;
    /** Maximum UTF-8 content bytes, not number of history records. */
    limit?: number;
}
export interface ArtifactPage {
    id: string;
    section: string;
    text: string;
    revision: string;
    nextCursor: string | null;
}
export declare function safePath(root: string, ...parts: string[]): Promise<string>;
export declare function source(root: string, parts: string[]): Promise<string>;
export declare function document(text: string): {
    metadata: Record<string, unknown>;
    body: string;
};
export declare class ArtifactReader {
    private readonly cursor;
    read(kind: ArtifactKind, p: ReadRequest): Promise<ArtifactPage>;
}
