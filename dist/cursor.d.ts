export declare class SignedCursor {
    private readonly key;
    private sign;
    encode(value: Record<string, unknown>): string;
    decode(cursor: string): Record<string, unknown>;
}
/** Complete records, bounded wire bytes; never silently drops a large board. */
export declare class RecordPager {
    private readonly cursor;
    page(workspace: string, rows: Record<string, unknown>[], cursor: string | null, limit: number): {
        records: Record<string, unknown>[];
        total: number;
        revision: string;
        nextCursor: string | null;
    };
}
