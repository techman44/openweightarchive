import { z } from 'astro/zod';

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const text = z.string().trim().min(1).max(240);
const date = z.iso.datetime({ offset: true });

export const configSchema = z.object({
  thinking: z.boolean().nullable(),
  max_gen_toks: z.number().int().min(1).max(1_048_576).nullable(),
  temperature: z.number().finite().min(0).max(10).nullable(),
}).strict();

// Preserve the ct-bench envelope. Scores are raw; no implicit percent conversion.
export const runSchema = z.object({
  arm: text,
  suite: text,
  config: configSchema,
  metrics: z.record(text, z.object({
    score: z.number().finite().nullable(),
    n: z.number().int().nonnegative(),
    stderr: z.number().finite().nullable().optional(),
    unit: z.string().optional(),
    status: z.enum(['verified', 'partial', 're-running', 'queued', 'scheduled', 'pass']).optional(),
    note: z.string().optional(),
  }).strict()).refine((metrics) => Object.keys(metrics).length > 0, 'At least one task is required.'),
  evidence: z.object({
    engine: text, image: text, kv: text, context: text,
    source: z.string(), raw: z.string(), note: z.string(),
  }).strict().optional(),
  ts: date,
  hardware: z.union([
    text,
    z.record(text, z.union([text, z.number().finite(), z.boolean(), z.null()])),
  ]),
}).strict();

export const modelSchema = z.object({
  slug: slugSchema,
  name: text,
  publisher: text,
  parameters: text,
  summary: z.string().trim().min(1).max(2000),
  license: z.object({ name: text, url: z.url({ protocol: /^https?$/ }).optional(), notes: text }).strict(),
  contextTokens: z.number().int().positive(),
  fixture: z.boolean(),
  quantizations: z.array(z.object({
    quant: text,
    weightGiB: z.number().positive(),
    vram4kGiB: z.number().positive().nullable(),
    vram16kGiB: z.number().positive().nullable(),
    basis: z.enum(['estimated', 'measured']),
  }).strict()),
}).strict();

export const benchmarkSchema = z.object({
  slug: slugSchema,
  model: slugSchema,
  provenance: z.enum(['fixture', 'claim', 'verified', 'partial']),
  run: runSchema,
}).strict();

export const postSchema = z.object({
  title: text,
  description: z.string().trim().min(1).max(400),
  published: z.iso.date(),
  category: z.enum(['Editorial', 'Methods', 'Archive notes']),
  author: text,
}).strict();

export const attestationSchema = z.enum(['self-reported', 'photo', 'witnessed-remote']);

export const submissionSchema = z.object({
  submitter: text,
  model: slugSchema,
  endpoint: z.url().max(2048).refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search;
  }, 'Use an HTTPS endpoint without credentials, query parameters, or a fragment.'),
  attestation: attestationSchema,
  run: runSchema,
  consent: z.literal(true),
}).strict();

export const draftSchema = z.discriminatedUnion('collection', [
  z.object({ collection: z.literal('models'), data: modelSchema }).strict(),
  z.object({ collection: z.literal('benchmarks'), data: benchmarkSchema }).strict(),
  z.object({ collection: z.literal('posts'), data: postSchema.extend({
    slug: slugSchema, body: z.string().trim().min(1).max(30_000),
  }) }).strict(),
]);

export const reviewSchema = z.object({
  claimId: z.uuid(),
  decision: z.enum(['needs-information', 'rejected']),
  note: z.string().trim().min(1).max(2000),
}).strict();

export type BenchRun = z.infer<typeof runSchema>;
export type Model = z.infer<typeof modelSchema>;
export type Benchmark = z.infer<typeof benchmarkSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type DraftInput = z.infer<typeof draftSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
