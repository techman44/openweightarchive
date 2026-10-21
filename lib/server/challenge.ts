import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Submission } from '../schemas.ts';

export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJSON(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJSON(value)).digest('hex');
}

export function createChallenge(claimId: string, submission: Submission, secret: string, now = new Date()) {
  const payload = {
    version: 1 as const,
    claimId,
    nonce: randomBytes(32).toString('base64url'),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(),
    claimDigest: digest(submission),
  };
  const encoded = Buffer.from(canonicalJSON(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return { ...payload, token: `${encoded}.${signature}` };
}

// A valid signature is only an intake receipt. It does not verify a score or hardware.
export function verifyChallenge(token: string, secret: string, now = new Date()): boolean {
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return false;
    const expected = createHmac('sha256', secret).update(payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.version === 1 && Date.parse(decoded.issuedAt) <= now.getTime() && Date.parse(decoded.expiresAt) > now.getTime();
  } catch { return false; }
}
