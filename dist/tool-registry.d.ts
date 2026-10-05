import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { TSchema } from 'typebox';
/** Shared tool contract: Deus needs a working directory, not a Pi session. */
export type DeusTool<T extends TSchema = TSchema> = Pick<ToolDefinition<T>, 'name' | 'label' | 'description' | 'parameters'> & {
    execute(id: string, parameters: Parameters<ToolDefinition<T>['execute']>[1], signal: AbortSignal | undefined, update: Parameters<ToolDefinition<T>['execute']>[3], context: {
        cwd: string;
    }): ReturnType<ToolDefinition<T>['execute']>;
};
export interface ToolRegistrar {
    registerTool<T extends TSchema>(tool: DeusTool<T>): void;
}
