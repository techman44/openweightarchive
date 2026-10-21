import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { submissionSchema, reviewSchema } from '../lib/schemas.ts';
import { loadRegisterFile } from '../lib/register.ts';
import { createChallenge, verifyChallenge, digest } from '../lib/server/challenge.ts';
import { createFileRepository } from '../lib/server/file-store.ts';
import { readJSON, requireAdmin, requireSameOrigin } from '../lib/server/http.ts';

const secret = 'test-secret-with-at-least-thirty-two-characters';
const run = await loadRegisterFile(new URL('../fixtures/reference-8b.json', import.meta.url));
const input = submissionSchema.parse({ submitter: 'Test', model: 'reference-8b', endpoint: 'https://inference.example.com/v1', attestation: 'self-reported', run, consent: true });

test('challenge binds the full declaration, has a 72h lifetime, and rejects tampering/expiry', () => {
  const now = new Date('2026-10-21T00:00:00Z');
  const challenge = createChallenge(randomUUID(), input, secret, now);
  assert.equal(challenge.expiresAt, '2026-10-24T00:00:00.000Z');
  assert.equal(challenge.claimDigest, digest(input));
  assert.notEqual(challenge.claimDigest, digest({ ...input, endpoint: 'https://other.example.com/v1' }));
  assert.ok(verifyChallenge(challenge.token, secret, now));
  assert.equal(verifyChallenge(challenge.token, 'wrong', now), false);
  assert.equal(verifyChallenge(challenge.token + '.extra', secret, now), false);
  assert.equal(verifyChallenge(challenge.token, secret, new Date(challenge.expiresAt)), false);
  assert.equal(verifyChallenge(challenge.token, secret, new Date('2026-10-20')), false);
});

test('claims cannot supply verified status, secret URLs or unconsented data', () => {
  for (const change of [{ status: 'verified' }, { verified: true }, { endpoint: 'http://example.com' }, { endpoint: 'https://user:pass@example.com' }, { endpoint: 'https://example.com?key=secret' }, { consent: false }]) {
    assert.equal(submissionSchema.safeParse({ ...input, ...change }).success, false);
  }
  assert.equal(reviewSchema.safeParse({ claimId: randomUUID(), decision: 'verified', note: 'approve' }).success, false);
});

test('file repository persists concurrent writes, reviews and limits across instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'archive-test-'));
  try {
    const repository = createFileRepository(directory);
    const claims = await Promise.all(Array.from({ length: 5 }, (_, index) => repository.createClaim({ ...input, submitter: `Test ${index}` }, '127.0.0.1', secret)));
    const reopened = createFileRepository(directory);
    assert.equal((await reopened.listClaims()).length, 5);
    assert.equal((await stat(join(directory, 'archive.json'))).mode & 0o777, 0o600);
    await assert.rejects(reopened.createClaim({ ...input, submitter: 'Sixth' }, '127.0.0.1', secret), /limit/);
    await assert.rejects(reopened.createClaim({ ...input, submitter: 'Test 0' }, '127.0.0.2', secret), /active challenge/);
    const reviewed = await reopened.reviewClaim({ claimId: claims[0].id, decision: 'needs-information', note: 'Need revision.' });
    assert.equal(reviewed.status, 'needs-information');
    assert.deepEqual(reviewed.submission, claims[0].submission);
    const saved = JSON.parse(await readFile(join(directory, 'archive.json'), 'utf8'));
    assert.equal(saved.reviews.length, 1);
    assert.equal(saved.reviews[0].note, 'Need revision.');
    await assert.rejects(reopened.reviewClaim({ claimId: randomUUID(), decision: 'rejected', note: 'missing' }), /not found/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('corrupt JSON is never replaced by an empty store', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'archive-corrupt-'));
  try {
    const path = join(directory, 'archive.json');
    await writeFile(path, '{broken');
    const repository = createFileRepository(directory);
    await assert.rejects(repository.listClaims());
    await assert.rejects(repository.createClaim(input, '127.0.0.1', secret));
    assert.equal(await readFile(path, 'utf8'), '{broken');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('admin auth fails closed, challenges missing auth and accepts only the configured credential', () => {
  const env = { ADMIN_PASSWORD: secret, ADMIN_USERNAME: 'test' };
  assert.equal(requireAdmin(new Request('http://localhost/admin'), {})?.status, 503);
  const denied = requireAdmin(new Request('http://localhost/admin'), env)!;
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate')!, /Basic/);
  assert.equal(requireAdmin(new Request('http://localhost/admin', { headers: { Authorization: `Basic ${Buffer.from(`test:${secret}`).toString('base64')}` } }), env), undefined);
  assert.equal(requireAdmin(new Request('http://localhost/admin', { headers: { Authorization: 'Basic bad' } }), env)?.status, 401);
});

test('JSON intake rejects cross-origin, malformed, non-JSON and oversized bodies', async () => {
  const request = (body: string, headers: Record<string, string> = {}) => new Request('http://localhost/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  assert.throws(() => requireSameOrigin(request('{}', { Origin: 'https://evil.example' })), /Cross-origin/);
  await assert.rejects(readJSON(request('{')), /valid JSON/);
  await assert.rejects(readJSON(request('{}', { 'Content-Type': 'text/plain' })), /application\/json/);
  await assert.rejects(readJSON(request('x'.repeat(65_537))), /64 KiB/);
  assert.deepEqual(await readJSON(request('{"a":1}')), { a: 1 });
});
