import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadRegisterFile, parseRun, registerRows } from '../lib/register.ts';
import { modelSchema } from '../lib/schemas.ts';
import { compareValues } from '../lib/sort.ts';

const run = await loadRegisterFile(new URL('../tests/fixtures/run-reference-8b.json', import.meta.url));
const model = modelSchema.parse(JSON.parse(await readFile(new URL('./fixtures/reference-8b.json', import.meta.url), 'utf8')));

test('ct-bench loader preserves config, raw scores and all task sample counts', () => {
  const rows = registerRows([{ slug: 'test-run', model: model.slug, provenance: 'fixture', run }], [model]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.task === 'reasoning')?.score, 0.625);
  assert.equal(rows.find((row) => row.task === 'reasoning')?.n, 80);
  assert.deepEqual(rows[0].config, run.config);
  assert.match(rows[0].hardware, /Example GPU/);
});

test('missing scores and zero samples stay unavailable; a measured zero stays zero', () => {
  const rows = registerRows([{ slug: 'test-run', model: model.slug, provenance: 'claim', run: { ...run, metrics: {
    missing: { score: null, n: 10 }, empty: { score: 1, n: 0 }, zero: { score: 0, n: 10 },
  } } }], [model]);
  assert.equal(rows.find((row) => row.task === 'missing')?.score, null);
  assert.equal(rows.find((row) => row.task === 'empty')?.score, null);
  assert.equal(rows.find((row) => row.task === 'zero')?.score, 0);
});

test('malformed run envelopes and missing model references fail loudly', () => {
  for (const input of [{ ...run, metrics: {} }, { ...run, metrics: { test: { score: 1, n: -1 } } }, { ...run, ts: 'yesterday' }, { ...run, config: { ...run.config, thinking: 'false' } }]) {
    assert.throws(() => parseRun(input));
  }
  assert.throws(() => registerRows([{ slug: 'bad', model: 'unknown', provenance: 'claim', run }], [model]), /missing model/);
});

test('numeric sorting is numeric and keeps unavailable values last in both directions', () => {
  const values = ['10', '', '2', '0', '0.625'];
  assert.deepEqual([...values].sort((a, b) => compareValues(a, b, true, 1)), ['0', '0.625', '2', '10', '']);
  assert.deepEqual([...values].sort((a, b) => compareValues(a, b, true, -1)), ['10', '2', '0.625', '0', '']);
});
