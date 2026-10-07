/** Per-reader authenticated cursors; callers validate identity and continuation semantics. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class SignedCursor {
  private readonly key = randomBytes(32);
  private sign(payload: string) {
    return createHmac('sha256', this.key).update(payload).digest('hex');
  }
  encode(value: Record<string, unknown>): string {
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }
  decode(cursor: string): Record<string, unknown> {
    const [payload, signature, extra] = cursor.split('.');
    if (cursor.length > 2048 || !payload || !signature || extra) throw new Error('Invalid cursor');
    const expected = this.sign(payload);
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new Error('Invalid or expired cursor');
    const value: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid cursor payload');
    return value as Record<string, unknown>;
  }
}
