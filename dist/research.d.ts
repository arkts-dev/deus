import { ModelRuntime, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type SourceReceipt, type ResearchReport } from './evidence.js';
export interface WebConfig {
    searxngUrl?: string;
    exaKey?: string;
    braveKey?: string;
    tavilyKey?: string;
    searchProvider?: 'exa' | 'searxng' | 'brave' | 'tavily' | 'fetch';
}
export declare function webConfigFromEnv(): WebConfig;
export declare function webSearchProvider(config: WebConfig): "brave" | "tavily" | "exa" | "searxng" | "fetch";
export declare function searchWeb(query: string, config: WebConfig, signal?: AbortSignal): Promise<unknown>;
export declare function externalResearchTools(config: WebConfig, receipts: SourceReceipt[], consume: () => void): ToolDefinition[];
export declare function researchWeb(question: string, config?: WebConfig, runtime?: ModelRuntime, signal?: AbortSignal): Promise<{
    status: string;
    reason: string;
    evidence?: undefined;
    errors?: undefined;
} | {
    status: string;
    evidence: ResearchReport;
    errors: string[];
    reason?: undefined;
}>;
