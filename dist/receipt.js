import { redact } from './process.js';
export function boundedText(text, bytes) {
    const buffer = Buffer.from(text);
    let end = Math.min(buffer.length, bytes);
    while (end < buffer.length && end > 0 && (buffer[end] & 0xc0) === 0x80)
        end--;
    return buffer.subarray(0, end).toString('utf8');
}
export function mutationReceipt(status, p = {}) {
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
            truncated: Boolean(p.diagnosticsTruncated) ||
                Buffer.byteLength(stdout) > 2048 ||
                Buffer.byteLength(stderr) > 2048,
        },
        reasons: (p.reasons ?? []).slice(0, 8).map((reason) => boundedText(redact(reason), 512)),
    };
}
