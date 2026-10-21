import { z } from 'astro/zod';
import { submissionSchema, draftSchema, reviewSchema, type Submission, type DraftInput, type ReviewInput } from '../schemas.ts';

const challengeSchema = z.object({
  version: z.literal(1), claimId: z.uuid(), nonce: z.string(), issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(), claimDigest: z.string(), token: z.string(),
});
export const claimSchema = z.object({
  id: z.uuid(), createdAt: z.iso.datetime(), status: z.enum(['claim', 'needs-information', 'rejected']),
  submission: submissionSchema, challenge: challengeSchema,
});
export const storedDraftSchema = z.object({ id: z.uuid(), createdAt: z.iso.datetime(), input: draftSchema });
const storedReviewSchema = reviewSchema.extend({ id: z.uuid(), createdAt: z.iso.datetime() });
export const stateSchema = z.object({
  version: z.literal(1), claims: z.array(claimSchema), drafts: z.array(storedDraftSchema), reviews: z.array(storedReviewSchema),
  limits: z.array(z.object({ key: z.string(), at: z.number() })),
}).strict();
export type State = z.infer<typeof stateSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Draft = z.infer<typeof storedDraftSchema>;

// Shared contract for D1 and the development-only JSON repository.
export interface ArchiveRepository {
  listClaims(): Promise<Claim[]>;
  listDrafts(): Promise<Draft[]>;
  createClaim(input: Submission, clientAddress: string, secret: string): Promise<Claim>;
  createDraft(input: DraftInput): Promise<Draft>;
  reviewClaim(input: ReviewInput): Promise<Claim>;
}
