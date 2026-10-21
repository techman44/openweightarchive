# OpenWeightArchive — Phase 1 brief (for Codex)

You are building the scaffold + design spec for **openweightarchive.com**: a public,
editorial-quality website that archives open-weight AI models, their benchmark
results, and honest AI news. Owner: Dean (self-hosting systems engineer, Sydney).
Tone: calm authority, museum/archivist aesthetic. ZERO buzzword slogans, no
"unleash/supercharge/revolutionary" copy, no emoji in UI, no gradients-from-hell.
Think: elegant typography, generous whitespace, dark-first theme, serif display
headings + clean sans body, tabular data done properly (aligned numerals).

## Deliverables for this run (Phase 1 only)
1. `docs/DESIGN.md` — full design spec: colour tokens (name + hex), type scale,
   spacing grid, component inventory, and a written description of the logo/banner
   art direction (ink-line archive vault motif; do NOT generate images).
2. Astro (static + server islands) scaffold in repo root:
   - Routes: `/` (register table + latest posts), `/models/[slug]` (model card:
     quant, VRAM matrix, license, scores), `/benchmarks` (sortable register),
     `/blog`, `/blog/[slug]`, `/submit` (score submission form), `/admin` (stub).
   - Content collections: `models`, `benchmarks` (JSON-schema typed), `posts`.
   - `lib/register.ts` loader that reads the ct-bench JSON shape:
     {arm, suite, config:{thinking,max_gen_toks,temperature}, metrics:{task:{score,n}}, ts, hardware}
     and renders the sortable table. Sample fixtures in `fixtures/`.
3. `docs/SUBMISSIONS.md` — anti-fraud design: submissions are CLAIMS until
   reproduced. Scheme: submitter declares endpoint + config; site issues a
   signed nonce challenge; our harness (ct-bench) re-runs a random 5% task
   subset against their endpoint within 72h; only "verified" badge on pass.
   Rate-limit + hardware attestation tiers (self-reported / photo / witnessed-remote).
4. Minimal hand-rolled admin: JSON-file-backed POST endpoints guarded by an
   HTTP basic-auth secret (env), no DB yet — keep it swappable to Postgres later.
5. Tailwind optional; plain CSS custom properties preferred. No UI frameworks.
6. Everything must build: `npm install && npm run build` green. Commit with
   conventional messages.

## Hard rules
- No new dependencies beyond Astro + its integrations.
- Accessible: real table markup with captions, skip-link, focus states.
- Responsive; mobile = single column, tables scroll with sticky first column.
- Write README.md with local dev steps.
