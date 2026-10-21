import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { modelSchema, benchmarkSchema, postSchema } from '../lib/schemas';
import { loadRegisterFile } from '../lib/register';
import manifest from '../fixtures/benchmarks.json';

const models = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/models' }),
  schema: modelSchema,
});

const benchmarks = defineCollection({
  loader: async () => Object.fromEntries(await Promise.all(manifest.map(async ({ file, ...entry }) => [entry.slug, {
    ...entry,
    run: await loadRegisterFile(new URL(`../fixtures/${file}`, import.meta.url)),
  }]))),
  schema: benchmarkSchema,
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: postSchema,
});

export const collections = { models, benchmarks, posts };
