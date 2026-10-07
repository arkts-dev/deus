/** Per-reader authenticated cursors; callers validate identity and continuation semantics. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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
