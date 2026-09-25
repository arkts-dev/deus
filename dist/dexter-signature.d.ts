import { type ProcessResult } from './process.js';
export declare function trustedFingerprints(): string[];
export interface SignatureVerification {
    commit: string;
    fingerprint: string | null;
    error: string | null;
    diagnostics: Record<string, ProcessResult>;
}
export declare function verifyCommitSignature(executable: string, cwd: string): Promise<SignatureVerification>;
