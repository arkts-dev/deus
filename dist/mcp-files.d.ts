import { type ToolRegistrar } from './tool-registry.js';
/** Reject links, traversal and special files; the workspace owner remains trusted. */
export declare function workspacePath(root: string, path: string, missing?: boolean): Promise<string>;
export declare function artifactPath(path: string): void;
export declare function registerFileTools(registry: ToolRegistrar): void;
