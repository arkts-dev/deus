import { DefaultResourceLoader, SettingsManager, type InlineExtension } from '@earendil-works/pi-coding-agent';
export declare const packageRoot: string;
export declare const skillsRoot: string;
export declare function isolatedLoader(cwd: string, agentDir: string, systemPrompt: string, skillNames?: string[], factories?: InlineExtension[]): Promise<{
    loader: DefaultResourceLoader;
    settings: SettingsManager;
}>;
/** Validate shipped resources without network access before starting an isolated research session. */
export declare function verifySkillIntegrity(): Promise<number>;
