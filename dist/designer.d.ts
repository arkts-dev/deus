/** Designer: mechanical invariant checks and one-shot writing for design documents. */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
export declare const DESIGN_CAP = 15000;
export declare function designPath(cwd: string, requested: string): {
    absolute: string;
    rel: string;
};
export declare function designCheck(cwd: string, requested: string, content: string): {
    ok: boolean;
    path: string;
    words: number;
    errors: string[];
    warnings: string[];
};
export declare function designWrite(cwd: string, requested: string, content: string): Promise<{
    status: "rejected";
    ok: boolean;
    path: string;
    words: number;
    errors: string[];
    warnings: string[];
} | {
    status: "written";
    ok: boolean;
    path: string;
    words: number;
    errors: string[];
    warnings: string[];
}>;
export default function designer(pi: ExtensionAPI): void;
