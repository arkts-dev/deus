export declare const digest: (value: string | Buffer) => string;
export declare function redact(value: string): string;
export declare function redactedJson(value: unknown, space?: number): string;
export interface ProcessResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    cancelled: boolean;
    truncated: boolean;
    error?: string;
}
export interface ProcessOptions {
    cwd: string;
    timeoutMs?: number | null;
    maxBytes?: number;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
    truncateOutput?: boolean;
}
export declare function runProcess(executable: string, argv: string[], options: ProcessOptions): Promise<ProcessResult>;
export declare const succeeded: (r: ProcessResult) => boolean;
