# Benchmark data and preview deployment

The public collection is a snapshot, not a live monitor. One set of weights, DeepSeek-V4.1-Flash-1017 EXL3 2.9bpw, has two measured engine arms on 2 × DGX Spark / TP2. Queued models are not counted as measured models.

## Evidence

- `public/evidence/classics-1024.json`: fresh ct-bench copy of `/opt/bench/results/lme/styles01-starved-1024tok/results_2026-10-21T02-18-05.924996.json`. GSM8K flexible-extract, math500 math_verify and IFEval prompt-strict are retained with actual sample counts and stderr. Fractions are converted to percent for display, including stderr. The original raw JSON remains unchanged.
- `public/evidence/needle-styles01.log`: fresh Spark copy of `/home/dean/logs/needle_styles01.log`, confirming 194,871 tokens, recovered answer, and 100.6 seconds. Depth 60% comes from the operator record. Generation cap and temperature are unknown, not invented.
- Speed medians: operator-verified summary supplied 21 October 2026 (three greedy 512-token trials). Styles01: code 91.2, prose 49.5, structured 102.0 tok/s. MiaAI kit: 38.2, 23.9, 49.2. Original per-trial artifacts were not located, so these are labelled operator summaries, not fresh raw exports. MiaAI thinking/image/KV details are not recorded.
- Image tag `ghcr.io/styles01/dsv41-1017-exl3-2x-dgx-sparks:v2` was read from the running Spark container. Server context, vision and per-rank KV are from the operator record, not inferred from harness context.
- Classics use 1,024 generation tokens and 16,384 harness context. HumanEval, MBPP and ARC results from that starved run are not published as valid zero scores: they remain `re-running`, with 8,192 planned generation tokens. The source artifact preserves its historical results.
- Speed/needle timestamps are archive dates, explicitly labelled in evidence notes. Only the classics record has the source completion timestamp.
- HLE is scheduled nightly over 2,158 text-only questions. No full HLE score is available; the smoke run is deliberately not used as a frontier score.

`fixtures/benchmarks.json` selects public normalized records. Fictional examples exist only in `tests/fixtures`, never in the public collection. `verified` here means operator-verified, not independently replicated. Community verified submissions remain zero.

## Preview

Run `npm run deploy:preview`. This builds with `OWA_PREVIEW=1`, selects `wrangler.preview.jsonc`, and deploys the generated `dist/server/wrangler.json`. Inspect that generated config before deployment: its name must be `openweightarchive-v2`, routes must be empty, and D1/R2 bindings must be empty.

Preview: https://openweightarchive-v2.dean-mcintosh.workers.dev

The preview is noindex and deliberately has no production database, bucket or secrets. Public pages and raw evidence work; admin and community intake fail closed. Do not attach production storage just to make the preview form accept writes.

Checks: `npm test`, `OWA_PREVIEW=1 npm run check`, `npm run build:preview`, `npm run test:smoke`. Smoke tests use their own ephemeral, explicitly local D1 even when the preview build has no bindings. Browser checks cover filtering, numeric sort with missing values last, evidence expansion, selection limits, comparison bars, and mobile overflow.
