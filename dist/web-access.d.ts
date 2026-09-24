export declare function searchWithWebAccess(provider: 'brave' | 'tavily', query: string, key: string, signal?: AbortSignal): Promise<unknown>;
export declare function extractPublicPdf(bytes: Buffer, url: string, signal?: AbortSignal): Promise<string>;
