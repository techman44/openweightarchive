import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'astro/zod';
import { modelSchema, benchmarkSchema, runSchema, postSchema } from '../lib/schemas.ts';

const schemas = { models: modelSchema, benchmarks: benchmarkSchema, 'ct-bench': runSchema, posts: postSchema };
await mkdir(new URL('../schemas/', import.meta.url), { recursive: true });
for (const [name, schema] of Object.entries(schemas)) {
  const path = new URL(`../schemas/${name}.schema.json`, import.meta.url);
  const content = JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== content) throw new Error(`Stale ${name} JSON Schema. Run npm run schemas.`);
  } else {
    await writeFile(path, content);
  }
}
