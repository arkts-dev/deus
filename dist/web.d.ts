import { lookup } from 'node:dns/promises';
export declare function publicAddress(address: string): boolean;
export declare function pinDestination(url: URL, resolve?: typeof lookup): Promise<{
    address: string;
    family: number;
}>;
export declare function readableText(raw: string, type: string): string;
/** Resolve once and pin the actual socket lookup; redirects repeat validation. No global agent/DNS reuse. */
export declare function fetchPublic(url: string, signal?: AbortSignal, consume?: () => void): Promise<{
    url: string;
    text: string;
    sha256: string;
    contentType: string;
    locator: string;
    redirects: number;
}>;
