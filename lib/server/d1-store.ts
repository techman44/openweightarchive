import { createHmac, randomUUID } from 'node:crypto';
import { submissionSchema, draftSchema, reviewSchema } from '../schemas.ts';
import { createChallenge } from './challenge.ts';
import { HttpError } from './http.ts';
import { claimSchema, storedDraftSchema, type ArchiveRepository, type Claim } from './records.ts';

interface ClaimRow {
  id: string;
  created_at: string;
  status: string;
  submission_json: string;
  challenge_version: number;
  nonce: string;
  issued_at: string;
  expires_at: string;
  claim_digest: string;
  challenge_token: string;
}

function readClaim(row: ClaimRow): Claim {
  return claimSchema.parse({
    id: row.id, createdAt: row.created_at, status: row.status,
    submission: JSON.parse(row.submission_json),
    challenge: {
      version: row.challenge_version, claimId: row.id, nonce: row.nonce,
      issuedAt: row.issued_at, expiresAt: row.expires_at,
      claimDigest: row.claim_digest, token: row.challenge_token,
    },
  });
}

export function createD1Repository(db: D1Database): ArchiveRepository {
  return {
    async listClaims() {
      const { results } = await db.prepare('SELECT * FROM submissions ORDER BY created_at, id').all<ClaimRow>();
      return results.map(readClaim);
    },
    async listDrafts() {
      const { results } = await db.prepare(`
        SELECT id, created_at, 'posts' AS collection, data_json FROM posts
        UNION ALL SELECT id, created_at, 'models', data_json FROM models
        UNION ALL SELECT id, created_at, 'benchmarks', data_json FROM benchmark_runs
        ORDER BY created_at, id
      `).all<{ id: string; created_at: string; collection: string; data_json: string }>();
      return results.map((row) => storedDraftSchema.parse({
        id: row.id, createdAt: row.created_at,
        input: { collection: row.collection, data: JSON.parse(row.data_json) },
      }));
    },
    async createClaim(raw, address, secret) {
      const input = submissionSchema.parse(raw);
      const now = new Date();
      const id = randomUUID();
      const challenge = createChallenge(id, input, secret, now);
      const key = (value: string) => createHmac('sha256', secret).update(value).digest('hex');
      try {
        // D1 batch is one transaction: a failed quota or duplicate rolls back all writes.
        await db.batch([
          db.prepare(`INSERT INTO submissions
            (id, created_at, submission_json, nonce, issued_at, expires_at, claim_digest, challenge_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
            id, now.toISOString(), JSON.stringify(input), challenge.nonce, challenge.issuedAt,
            challenge.expiresAt, challenge.claimDigest, challenge.token,
          ),
          db.prepare('DELETE FROM submission_limits WHERE at <= ?').bind(now.getTime() - 86_400_000),
          db.prepare("INSERT INTO submission_limits (submission_id, kind, key, at) VALUES (?, 'ip', ?, ?)")
            .bind(id, key(`ip:${address}`), now.getTime()),
          db.prepare("INSERT INTO submission_limits (submission_id, kind, key, at) VALUES (?, 'endpoint', ?, ?)")
            .bind(id, key(`endpoint:${new URL(input.endpoint).origin}`), now.getTime()),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('OWA_ACTIVE_CHALLENGE')) throw new HttpError(409, 'This claim already has an active challenge.');
        if (message.includes('OWA_RATE_LIMIT')) throw new HttpError(429, 'Submission limit reached. Try again later.');
        throw error;
      }
      return { id, createdAt: now.toISOString(), status: 'claim', submission: input, challenge };
    },
    async createDraft(raw) {
      const input = draftSchema.parse(raw);
      const draft = { id: randomUUID(), createdAt: new Date().toISOString(), input };
      if (input.collection === 'benchmarks') {
        await db.prepare('INSERT INTO benchmark_runs (id, slug, model_slug, data_json, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(draft.id, input.data.slug, input.data.model, JSON.stringify(input.data), draft.createdAt).run();
      } else {
        // Table identifiers come exclusively from the validated discriminated union.
        const table = input.collection === 'posts' ? 'posts' : 'models';
        await db.prepare(`INSERT INTO ${table} (id, slug, data_json, created_at) VALUES (?, ?, ?, ?)`)
          .bind(draft.id, input.data.slug, JSON.stringify(input.data), draft.createdAt).run();
      }
      return draft;
    },
    async reviewClaim(raw) {
      const input = reviewSchema.parse(raw);
      const results = await db.batch<ClaimRow>([
        db.prepare('UPDATE submissions SET status = ? WHERE id = ? RETURNING *').bind(input.decision, input.claimId),
        db.prepare(`INSERT INTO submission_reviews (id, submission_id, decision, note, created_at)
          SELECT ?, id, ?, ?, ? FROM submissions WHERE id = ?`)
          .bind(randomUUID(), input.decision, input.note, new Date().toISOString(), input.claimId),
      ]);
      const claim = results[0].results[0];
      if (!claim) throw new HttpError(404, 'Claim not found.');
      return readClaim(claim);
    },
  };
}
