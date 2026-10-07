import { redact } from './process.js';

export type MutationStatus = 'rejected' | 'completed' | 'outcome_unknown';
export interface MutationReceipt {
  status: MutationStatus;
  profile?: 'dexter-signed' | 'unknown';
  issue?: string;
  changed?: boolean;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
  diagnostics: { stdout: string; stderr: string; truncated: boolean };
  reasons: string[];
}
export function boundedText(text: string, bytes: number): string {
  const buffer = Buffer.from(text);
  let end = Math.min(buffer.length, bytes);
  while (end < buffer.length && end > 0 && (buffer[end]! & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString('utf8');
}
export function mutationReceipt(
  status: MutationStatus,
  p: Partial<Omit<MutationReceipt, 'status' | 'diagnostics'>> & {
    stdout?: string;
    stderr?: string;
    diagnosticsTruncated?: boolean;
  } = {},
): MutationReceipt {
  const stdout = redact(p.stdout ?? '');
  const stderr = redact(p.stderr ?? '');
  return {
    status,
    profile: p.profile,
    issue: p.issue,
    changed: p.changed,
    exitCode: p.exitCode ?? null,
    signal: p.signal ?? null,
    timedOut: p.timedOut ?? false,
    cancelled: p.cancelled ?? false,
    diagnostics: {
      stdout: boundedText(stdout, 2048),
      stderr: boundedText(stderr, 2048),
      truncated:
        Boolean(p.diagnosticsTruncated) ||
        Buffer.byteLength(stdout) > 2048 ||
        Buffer.byteLength(stderr) > 2048,
    },
    reasons: (p.reasons ?? []).slice(0, 8).map((reason) => boundedText(redact(reason), 512)),
  };
}
