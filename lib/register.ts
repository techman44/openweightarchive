import { readFile } from 'node:fs/promises';
import { runSchema, type BenchRun, type Benchmark, type Model } from './schemas.ts';

export function parseRun(input: unknown): BenchRun {
  return runSchema.parse(input);
}

export async function loadRegisterFile(path: string | URL): Promise<BenchRun> {
  return parseRun(JSON.parse(await readFile(path, 'utf8')));
}

export function hardwareLabel(hardware: BenchRun['hardware']): string {
  if (typeof hardware === 'string') return hardware;
  return Object.entries(hardware).map(([key, value]) => `${key}: ${value ?? 'unavailable'}`).join(' · ') || 'Unavailable';
}

export function registerRows(benchmarks: Benchmark[], models: Model[]) {
  const index = new Map(models.map((model) => [model.slug, model]));
  return benchmarks.flatMap((entry) => {
    const model = index.get(entry.model);
    if (!model) throw new Error(`Benchmark ${entry.slug} refers to missing model ${entry.model}.`);
    return Object.entries(entry.run.metrics).map(([task, metric]) => ({
      id: `${entry.slug}:${task}`,
      model: model.name,
      modelSlug: model.slug,
      provenance: entry.provenance,
      suite: entry.run.suite,
      task,
      score: metric.n === 0 ? null : metric.score,
      n: metric.n,
      stderr: metric.stderr ?? null,
      unit: metric.unit ?? '',
      status: metric.status ?? entry.provenance,
      note: metric.note ?? '',
      evidence: entry.run.evidence,
      config: entry.run.config,
      arm: entry.run.arm,
      hardware: hardwareLabel(entry.run.hardware),
      ts: entry.run.ts,
    }));
  }).sort((a, b) => b.ts.localeCompare(a.ts) || a.id.localeCompare(b.id));
}

export type RegisterRow = ReturnType<typeof registerRows>[number];
