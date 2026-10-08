import { type ToolRegistrar } from './tool-registry.js';
export interface MetricsRequest {
    workspace: string;
    since: string;
    until: string;
    utcOffsetMinutes: number;
}
export declare function metrics(p: MetricsRequest, signal?: AbortSignal, observed?: number): Promise<{
    since: string;
    until: string;
    utcOffsetMinutes: number;
    collection: {
        startedAt: string;
        finishedAt: string;
    };
    days: {
        day: string;
        dayClosed: boolean;
        runs: {
            total: {
                durationMs: {
                    median: number | null;
                    sum: number | null;
                    samples: number;
                };
                timeoutDurationMs: {
                    sum: number | null;
                    samples: number;
                };
                promptTokens: {
                    sum: number | null;
                    samples: number;
                };
                starts: number;
                done: number;
                failed: number;
                unfinished: number;
                timedOut: number;
            };
            byRole: {
                [k: string]: {
                    durationMs: {
                        median: number | null;
                        sum: number | null;
                        samples: number;
                    };
                    timeoutDurationMs: {
                        sum: number | null;
                        samples: number;
                    };
                    promptTokens: {
                        sum: number | null;
                        samples: number;
                    };
                    starts: number;
                    done: number;
                    failed: number;
                    unfinished: number;
                    timedOut: number;
                };
            };
        };
        workspaceActivity: {
            reviewVerdicts: {
                [k: string]: number;
            };
        };
    }[];
}>;
export declare function registerMetricsTool(registry: ToolRegistrar): void;
