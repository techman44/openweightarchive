import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import { createD1Repository } from '../lib/server/d1-store.ts';
import { repository } from '../lib/server/store.ts';
import { submissionSchema, draftSchema } from '../lib/schemas.ts';
import { verifyChallenge } from '../lib/server/challenge.ts';

const secret = 'local-test-secret-with-at-least-thirty-two-characters';
const run = JSON.parse(await readFile(new URL('../fixtures/reference-8b.json', import.meta.url), 'utf8'));
const input = submissionSchema.parse({ submitter: 'Test', model: 'reference-8b', endpoint: 'https://inference.example.com/v1', attestation: 'self-reported', run, consent: true });

test('D1 migrations and repositories preserve claims, quotas, drafts and review history', async (t) => {
  const platform = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc', persist: false, remoteBindings: false, envFiles: [] });
  t.after(() => platform.dispose());
  const db = platform.env.OWA_DB;
  const sql = await readFile(new URL('../migrations/0001_archive.sql', import.meta.url), 'utf8');
  await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
  const store = await repository(platform.env);

  const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
    createD1Repository(db).createClaim({ ...input, submitter: `Concurrent ${index}` }, '127.0.0.1', secret)));
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 5);
  for (const result of attempts) if (result.status === 'rejected') assert.equal(result.reason.status, 429);
  const claims = await store.listClaims();
  assert.equal(claims.length, 5, 'quota failures roll back the inserted claim');
  assert.equal(await db.prepare('SELECT count(*) AS n FROM submission_limits').first('n'), 10);
  assert.ok(verifyChallenge(claims[0].challenge.token, secret));
  await assert.rejects(store.createClaim(claims[0].submission, '127.0.0.2', secret), { status: 409 });
  assert.equal(await db.prepare('SELECT count(*) AS n FROM submission_limits').first('n'), 10, 'duplicates consume no quota');

  const duplicateInput = { ...input, submitter: 'Concurrent duplicate', endpoint: 'https://duplicate.example.com/v1' };
  const duplicates = await Promise.allSettled(Array.from({ length: 3 }, (_, i) => store.createClaim(duplicateInput, `duplicate-${i}`, secret)));
  assert.equal(duplicates.filter((result) => result.status === 'fulfilled').length, 1);
  for (const result of duplicates) if (result.status === 'rejected') assert.equal(result.reason.status, 409);

  for (let i = 0; i < 5; i++) await store.createClaim({ ...input, submitter: `Endpoint quota ${i}` }, `other-${i}`, secret);
  await assert.rejects(store.createClaim({ ...input, submitter: 'Endpoint overflow' }, 'new-peer', secret), { status: 429 });
  assert.equal(await db.prepare('SELECT count(*) AS n FROM submissions').first('n'), 11);
  assert.equal(await db.prepare('SELECT count(*) AS n FROM submission_limits').first('n'), 22, 'endpoint quota also rolls back the IP counter');

  const reviewed = await store.reviewClaim({ claimId: claims[0].id, decision: 'needs-information', note: 'Please pin the revision.' });
  assert.equal(reviewed.status, 'needs-information');
  assert.deepEqual(reviewed.submission, claims[0].submission);
  assert.deepEqual(reviewed.challenge, claims[0].challenge);
  await store.reviewClaim({ claimId: claims[0].id, decision: 'rejected', note: 'Insufficient evidence.' });
  assert.equal(await db.prepare('SELECT count(*) AS n FROM submission_reviews').first('n'), 2);
  await assert.rejects(store.reviewClaim({ claimId: randomUUID(), decision: 'rejected', note: 'Unknown.' }), { status: 404 });
  await assert.rejects(db.prepare("UPDATE submissions SET status = 'verified' WHERE id = ?").bind(claims[0].id).run(), /CHECK constraint/);
  await assert.rejects(db.prepare('UPDATE submissions SET nonce = ? WHERE id = ?').bind('replacement', claims[0].id).run(), /OWA_IMMUTABLE_CLAIM/);
  assert.equal(await db.prepare('SELECT nonce_consumed_at FROM submissions WHERE id = ?').bind(claims[0].id).first('nonce_consumed_at'), null);

  const model = JSON.parse(await readFile(new URL('../src/content/models/reference-8b.json', import.meta.url), 'utf8'));
  const drafts = [
    draftSchema.parse({ collection: 'models', data: model }),
    draftSchema.parse({ collection: 'benchmarks', data: { slug: 'test-run', model: 'reference-8b', provenance: 'claim', run } }),
    draftSchema.parse({ collection: 'posts', data: { slug: 'test-post', title: 'Private draft', description: 'Testing', published: '2026-10-21', category: 'Methods', author: 'Test', body: 'Unpublished text.' } }),
  ];
  for (const draft of drafts) await store.createDraft(draft);
  assert.deepEqual((await createD1Repository(db).listDrafts()).map((draft) => draft.input).sort((a, b) => a.collection.localeCompare(b.collection)), drafts.sort((a, b) => a.collection.localeCompare(b.collection)));
  for (const table of ['posts', 'models', 'benchmark_runs']) assert.equal(await db.prepare(`SELECT status FROM ${table}`).first('status'), 'draft');

  // Force a late failure in the review transaction; its status change must roll back.
  await db.prepare("CREATE TRIGGER test_review_failure BEFORE INSERT ON submission_reviews BEGIN SELECT RAISE(ABORT, 'test_failure'); END").run();
  await assert.rejects(store.reviewClaim({ claimId: claims[0].id, decision: 'needs-information', note: 'Must roll back.' }), /test_failure/);
  assert.equal(await db.prepare('SELECT status FROM submissions WHERE id = ?').bind(claims[0].id).first('status'), 'rejected');
});
