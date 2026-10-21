import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHmac } from 'node:crypto';
import { z } from 'astro/zod';
import { submissionSchema, draftSchema, reviewSchema, type Submission, type DraftInput, type ReviewInput } from '../schemas.ts';
import { createChallenge, digest } from './challenge.ts';
import { HttpError } from './http.ts';

const challengeSchema = z.object({
  version: z.literal(1), claimId: z.uuid(), nonce: z.string(), issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(), claimDigest: z.string(), token: z.string(),
});
const claimSchema = z.object({
  id: z.uuid(), createdAt: z.iso.datetime(), status: z.enum(['claim', 'needs-information', 'rejected']),
  submission: submissionSchema, challenge: challengeSchema,
});
const storedDraftSchema = z.object({ id: z.uuid(), createdAt: z.iso.datetime(), input: draftSchema });
const storedReviewSchema = reviewSchema.extend({ id: z.uuid(), createdAt: z.iso.datetime() });
const stateSchema = z.object({
  version: z.literal(1), claims: z.array(claimSchema), drafts: z.array(storedDraftSchema), reviews: z.array(storedReviewSchema),
  limits: z.array(z.object({ key: z.string(), at: z.number() })),
}).strict();
type State = z.infer<typeof stateSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Draft = z.infer<typeof storedDraftSchema>;

// Route code only depends on this interface; a Postgres implementation can replace it.
export interface ArchiveRepository {
  listClaims(): Promise<Claim[]>;
  listDrafts(): Promise<Draft[]>;
  createClaim(input: Submission, clientAddress: string, secret: string): Promise<Claim>;
  createDraft(input: DraftInput): Promise<Draft>;
  reviewClaim(input: ReviewInput): Promise<Claim>;
}

const queues = new Map<string, Promise<unknown>>();

export function createFileRepository(directory: string): ArchiveRepository {
  const path = join(resolve(directory), 'archive.json');
  const empty = (): State => ({ version: 1, claims: [], drafts: [], reviews: [], limits: [] });
  async function read(): Promise<State> {
    try { return stateSchema.parse(JSON.parse(await readFile(path, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty();
      throw error; // A corrupt store must never be silently replaced with an empty one.
    }
  }
  async function write(state: State) {
    await mkdir(resolve(directory), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(state, null, 2) + '\n'); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, path);
    } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
  }
  function mutate<T>(operation: (state: State) => T): Promise<T> {
    const next = (queues.get(path) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const state = await read();
      const result = operation(state);
      await write(stateSchema.parse(state));
      return result;
    });
    queues.set(path, next);
    return next;
  }
  return {
    async listClaims() { return (await read()).claims; },
    async listDrafts() { return (await read()).drafts; },
    createClaim(raw, address, secret) {
      const input = submissionSchema.parse(raw);
      return mutate((state) => {
        const now = Date.now();
        const ipKey = createHmac('sha256', secret).update(`ip:${address}`).digest('hex');
        const endpointKey = createHmac('sha256', secret).update(`endpoint:${new URL(input.endpoint).origin}`).digest('hex');
        state.limits = state.limits.filter((limit) => limit.at > now - 86_400_000);
        if (state.limits.filter((limit) => limit.key === ipKey && limit.at > now - 3_600_000).length >= 5 || state.limits.filter((limit) => limit.key === endpointKey).length >= 10) {
          throw new HttpError(429, 'Submission limit reached. Try again later.');
        }
        if (state.claims.some((claim) => claim.challenge.claimDigest === digest(input) && Date.parse(claim.challenge.expiresAt) > now)) throw new HttpError(409, 'This claim already has an active challenge.');
        const id = randomUUID();
        const claim: Claim = { id, createdAt: new Date(now).toISOString(), status: 'claim', submission: input, challenge: createChallenge(id, input, secret, new Date(now)) };
        state.claims.push(claim);
        state.limits.push({ key: ipKey, at: now }, { key: endpointKey, at: now });
        return claim;
      });
    },
    createDraft(raw) {
      const input = draftSchema.parse(raw);
      return mutate((state) => {
        const draft = { id: randomUUID(), createdAt: new Date().toISOString(), input };
        state.drafts.push(draft);
        return draft;
      });
    },
    reviewClaim(raw) {
      const input = reviewSchema.parse(raw);
      return mutate((state) => {
        const claim = state.claims.find((claim) => claim.id === input.claimId);
        if (!claim) throw new HttpError(404, 'Claim not found.');
        claim.status = input.decision;
        state.reviews.push({ ...input, id: randomUUID(), createdAt: new Date().toISOString() });
        return claim;
      });
    },
  };
}

export function repository(): ArchiveRepository { return createFileRepository(process.env.DATA_DIR || './data'); }
