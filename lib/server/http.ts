import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'astro/zod';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}

export function submissionSecret(): string | undefined {
  const secret = process.env.SUBMISSION_SECRET;
  return secret && secret.length >= 32 ? secret : undefined;
}

export function requireAdmin(request: Request): Response | undefined {
  const username = process.env.ADMIN_USERNAME || 'archivist';
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 32) return json({ error: 'Admin access is not configured.' }, 503);
  const header = request.headers.get('authorization') ?? '';
  const encoded = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header)?.[1];
  const supplied = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(hash(supplied), hash(`${username}:${password}`))) {
    return json({ error: 'Authentication required.' }, 401, { 'WWW-Authenticate': 'Basic realm="OpenWeightArchive admin", charset="UTF-8"' });
  }
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-origin writes are not allowed.');
}

export async function readJSON(request: Request): Promise<unknown> {
  requireSameOrigin(request);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, 'Send application/json.');
  const limit = 65_536;
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Request exceeds 64 KiB.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON body is required.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Request exceeds 64 KiB.'); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new HttpError(400, 'The request body is not valid JSON.'); }
  } finally { reader.releaseLock(); }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status, error.status === 429 ? { 'Retry-After': '3600' } : {});
  if (error instanceof z.ZodError) return json({ error: 'Please check the submitted fields.', fields: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }, 400);
  // Do not log request bodies, endpoints, auth headers or secrets.
  console.error('[archive] Request failed:', error instanceof Error ? error.name : 'Unknown error');
  return json({ error: 'The record could not be saved. Please try again later.' }, 503);
}

// Bound failed-auth and malformed-body traffic without an external dependency.
const attempts = new Map<string, { count: number; resets: number }>();
export function allowAttempt(key: string, limit = 30, now = Date.now()): boolean {
  for (const [key, entry] of attempts) if (entry.resets <= now) attempts.delete(key);
  const existing = attempts.get(key);
  if (existing) return ++existing.count <= limit;
  if (attempts.size >= 10_000) return false;
  attempts.set(key, { count: 1, resets: now + 15 * 60 * 1000 });
  return true;
}
