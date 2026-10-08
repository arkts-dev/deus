/** Per-reader authenticated cursors; callers validate identity and continuation semantics. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { digest, redactedJson } from './process.js';
export class SignedCursor {
    key = randomBytes(32);
    sign(payload) {
        return createHmac('sha256', this.key).update(payload).digest('hex');
    }
    encode(value) {
        const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
        return `${payload}.${this.sign(payload)}`;
    }
    decode(cursor) {
        const [payload, signature, extra] = cursor.split('.');
        if (cursor.length > 2048 || !payload || !signature || extra)
            throw new Error('Invalid cursor');
        const expected = this.sign(payload);
        if (signature.length !== expected.length ||
            !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
            throw new Error('Invalid or expired cursor');
        const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Invalid cursor payload');
        return value;
    }
}
/** Complete records, bounded wire bytes; never silently drops a large board. */
export class RecordPager {
    cursor = new SignedCursor();
    page(workspace, rows, cursor, limit) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
            throw new Error('limit must be 1..100 records');
        const identity = digest(workspace), revision = digest(redactedJson(rows));
        let offset = 0;
        if (cursor) {
            const decoded = this.cursor.decode(cursor);
            if (decoded.identity !== identity || decoded.revision !== revision)
                throw new Error('Snapshot changed or cursor belongs to another workspace; restart with null');
            if (!Number.isSafeInteger(decoded.offset) ||
                Number(decoded.offset) < 0 ||
                Number(decoded.offset) > rows.length)
                throw new Error('Invalid page offset');
            offset = Number(decoded.offset);
        }
        const records = [];
        const result = () => ({
            records,
            total: rows.length,
            revision,
            nextCursor: offset < rows.length ? this.cursor.encode({ identity, revision, offset }) : null,
        });
        while (offset < rows.length && records.length < limit) {
            records.push(rows[offset++]);
            if (Buffer.byteLength(redactedJson(result())) > 8192) {
                records.pop();
                offset--;
                if (!records.length)
                    throw new Error('Record exceeds 8 KiB; use the dedicated section reader');
                break;
            }
        }
        return result();
    }
}
