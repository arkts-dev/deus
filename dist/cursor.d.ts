export declare class SignedCursor {
    private readonly key;
    private sign;
    encode(value: Record<string, unknown>): string;
    decode(cursor: string): Record<string, unknown>;
}
