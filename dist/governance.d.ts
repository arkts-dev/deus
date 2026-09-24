/** Shared parsing and governance primitives. */
export type Fields = Map<string, string | string[]>;
export declare function frontmatter(text: string): {
    fields: Fields;
    body: string;
};
export declare const field: (fm: {
    fields: Fields;
}, key: string) => string;
export declare const list: (fm: {
    fields: Fields;
}, key: string) => string[];
export declare const words: (text: string) => number;
export declare const banned: (text: string) => string[];
export declare function duplicates(body: string): string[];
export declare const terms: (text: string, limit?: number) => string[];
export declare function contradictions(body: string, limit?: number): string[];
