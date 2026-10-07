import { redact } from './process.js';
export function boundedText(text, bytes) {
    const buffer = Buffer.from(text);
    let end = Math.min(buffer.length, bytes);
    while (end < buffer.length && end > 0 && (buffer[end] & 0xc0) === 0x80)
        end--;
    return buffer.subarray(0, end).toString('utf8');
}
export function bytePage(content, offset, limit) {
    const bytes = Buffer.from(content);
    if (!Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > bytes.length ||
        (offset < bytes.length && (bytes[offset] & 0xc0) === 0x80))
        throw new Error('Invalid UTF-8 byte offset');
    const text = boundedText(bytes.subarray(offset).toString('utf8'), limit);
    const end = offset + Buffer.byteLength(text);
    if (offset < bytes.length && end === offset)
        throw new Error('Byte limit is too small for the next UTF-8 character');
    return { text, nextOffset: end < bytes.length ? end : null };
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
