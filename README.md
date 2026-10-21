# OpenWeightArchive

Cloudflare Workers scaffold for **openweightarchive.com**: a dark, editorial model archive built with Astro, plain CSS and native browser scripts. This implements [BRIEF.md](BRIEF.md); it is not a production benchmark verification service.

All three model records, their specifications and benchmark scores are **fictional fixtures**. Journal entries explain the proposed methods, not current AI news. Submitted scores remain unverified claims. No image assets have been generated.

## Local development

Use Node **22.22.0 or newer** (Node 24 recommended) and npm 9.6 or newer.

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Open `http://localhost:4321`. Astro runs in the local Workers runtime; `OWA_DB` uses local SQLite and `OWA_MEDIA` uses local R2 emulation. These commands require no Cloudflare credentials and do not access remote resources. Local data lives under ignored `.wrangler/state/`. The all-zero D1 ID in `wrangler.jsonc` is a deliberate deployment placeholder and works for local emulation.

To exercise private functionality locally:

```sh
cp .dev.vars.example .dev.vars
openssl rand -hex 32
openssl rand -hex 32
```

Put the two different random values into `ADMIN_PASSWORD` and `SUBMISSION_SECRET` in `.dev.vars`. Both need at least 32 characters. The username defaults to `archivist` in `wrangler.jsonc`; use a username without a colon. Never commit secret files. Restart the dev server after changing runtime configuration. Open `/admin` and use the browser's Basic-auth prompt.

| Binding / variable | Purpose |
| --- | --- |
| `OWA_DB` | D1 database `owa-cms`; required for production persistence |
| `OWA_MEDIA` | R2 bucket `owa-media`; reserved for future evidence/media uploads |
| `ADMIN_USERNAME` | Basic-auth username; defaults to `archivist` |
| `ADMIN_PASSWORD` | Random Worker secret; missing/short disables admin |
| `SUBMISSION_SECRET` | Independent Worker HMAC secret; missing/short disables intake |

Server code reads bindings and secrets at request time from `cloudflare:workers`. The build does not need secrets. `npm run cf:types` regenerates binding declarations after config changes. Runtime binding types are imported individually so Workers' HTMLRewriter types do not collide with browser DOM types.

For development without D1, use **`npm run dev:json`**. This explicit Node/Vite development configuration loads `.dev.vars` and `.env`, and uses `./data/archive.json` (override `DATA_DIR` in `.env`). Keep that directory private and run one dev process against it. `repository()` selects D1 whenever present; it dynamically imports the JSON implementation only under `import.meta.env.DEV`. A failed D1 operation never falls back to a file. The production build removes the file-storage branch and returns 503 if D1 is absent.

## Build, run and verify

```sh
npm run check
npm test
npm run build
npm run test:smoke
npm run preview
```

The build validates JSON Schemas and content collections, emits prerendered public pages in `dist/client`, and bundles the Worker in `dist/server`. `npm run check` runs `astro check`. `npm run preview` (also `npm start`) serves the build locally using Workers emulation; it is not a production server command. The `workerd` override pins the local runtime to `1.20261021.1`, which supports the configured compatibility date; the adapter's transitive runtime was older. Review that override when upgrading Wrangler/the adapter.

Tests use Node's built-in runner plus local D1 emulation to check concurrent quotas, duplicates, immutable claims, review rollback and all draft tables. The smoke test applies migrations in a temporary local database, starts the built Worker with generated test secrets, checks public pages/cache headers, server islands, protected APIs and persistence across a restart, then removes its temporary state. It does not use your `.dev.vars`, local development database, or submitted endpoints.

## Deploy to Cloudflare Workers

The only production target is **Cloudflare Workers with Workers Static Assets, D1 and R2**. No standalone Node process, local persistent volume, reverse proxy or Cloudflare Pages deployment is required.

Before the first deploy:

1. Ensure D1 database `owa-cms` and R2 bucket `owa-media` exist in the target Cloudflare account. Replace the all-zero `database_id` in `wrangler.jsonc` with the D1 UUID. Keep binding names `OWA_DB` and `OWA_MEDIA` unchanged.
2. Configure independent `ADMIN_PASSWORD` and `SUBMISSION_SECRET` Worker secrets, each at least 32 characters, using the Cloudflare dashboard or your secret-management workflow. Public pages work without these; private functionality fails closed until they are set. These application secrets are separate from deployment credentials.
3. The existing GitHub repository secrets **`CLOUDFLARE_API_TOKEN`** and **`CLOUDFLARE_ACCOUNT_ID`** authenticate CI. The token needs permissions to deploy Workers/assets, apply D1 migrations and bind R2 in that account.

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on pushes to `main` and manual dispatch. It installs the lockfile, runs checks/tests, builds and smoke-tests the Worker, rejects the placeholder D1 UUID, applies `./migrations` to remote D1, then deploys with the locally installed Wrangler. Keep future migrations backward-compatible with the previous Worker because schema migration precedes deployment.

For an already configured account, the equivalent release commands are:

```sh
npm ci
npm run check
npm test
npm run build
npm run test:smoke
npx wrangler d1 migrations apply OWA_DB --remote --config dist/server/wrangler.json
npm run deploy
```

The last two commands require credentials and modify Cloudflare; they were **not run** as part of this migration. For credential-free packaging verification, use `npm run deploy -- --dry-run` after building. Astro generates `dist/server/wrangler.json` and `.wrangler/deploy/config.json`; Wrangler follows this deployment redirect to upload the matching Worker and `dist/client` assets. Edit the root `wrangler.jsonc`, never generated files. The initial deployment uses the Worker's `workers.dev` address; configure `openweightarchive.com` as a custom domain in Cloudflare when ready.

`public/_headers` gives `/_astro/*` a one-year immutable cache lifetime and public HTML a 60-second lifetime with revalidation. Middleware sets the corresponding short HTML policy on dynamic public responses; admin, API and server-island responses use `no-store`. Header rules for HTML and hashed assets are disjoint so Cloudflare does not combine conflicting Cache-Control values. Private D1 records are never static assets. Back up D1 according to the retention policy in [docs/SUBMISSIONS.md](docs/SUBMISSIONS.md). R2 is bound but the upload pipeline remains unimplemented.

## Routes and rendering

| Route | Rendering / content |
| --- | --- |
| `/` | Static register, archive counts, latest posts |
| `/models/[slug]` | Static model card, quantization / VRAM matrix, license, scores |
| `/benchmarks` | Static, progressively enhanced sortable/filterable register |
| `/blog` and `/blog/[slug]` | Static Markdown journal |
| `/submit` | Static form with a deferred server island for runtime intake availability |
| `/admin` | On-demand, Basic-auth protected queue and draft/review stub |
| `/api/submissions` | Public POST: validate and save a private claim + signed challenge |
| `/api/admin/drafts` | Basic-auth POST: save a typed, unpublished editorial draft |
| `/api/admin/reviews` | Basic-auth POST: request information or reject a claim; append a review note |

All POST bodies are JSON, limited to 64 KiB. Browser writes must have a matching origin; command-line clients without an Origin header are supported. Bad input returns 400; auth failures 401; cross-origin requests 403; missing claim 404; duplicate active claim 409; oversized bodies 413; wrong content type 415; rate limits 429; unavailable configuration/storage 503. Admin responses are no-store. Read-only public pages never expose the private store.

## Content and ct-bench data

- `src/content/models/*.json`: model specifications, quantization/memory entries and license metadata.
- `fixtures/*.json`: original ct-bench-shaped runs. `fixtures/benchmarks.json` supplies the run-to-model mapping and fixture provenance.
- `lib/register.ts`: validates/reads ct-bench JSON and produces one register row per task; it does not average unrelated scores or convert raw scores to percentages.
- `src/content/posts/*.md`: journal articles with validated frontmatter.
- `src/content.config.ts`: all three Astro collections: `models`, `benchmarks`, `posts`.
- `lib/schemas.ts` and `schemas/*.schema.json`: shared runtime types and generated JSON Schema (draft 2020-12). Runtime validation additionally requires at least one metric task.

The ct-bench input envelope is preserved:

```json
{
  "arm": "model-quantization",
  "suite": "suite-version",
  "config": { "thinking": false, "max_gen_toks": 2048, "temperature": 0 },
  "metrics": { "task": { "score": 0.625, "n": 80 } },
  "ts": "2026-10-20T08:00:00Z",
  "hardware": { "gpu": "declared GPU", "runtime": "declared runtime" }
}
```

`hardware` can also be a string. Scores are finite raw numbers or `null`; zero is a real value, while null or zero samples display as unavailable. Tasks, suites, arm names and config are retained. Model references must resolve or the build fails. Update JSON Schemas with `npm run schemas` after changing schema definitions. Rebuild after content/fixture edits; the custom fixture loader reads the files during content synchronisation (restart the dev server after editing those fixtures).

## API examples

Create a local payload using the fictional fixture (test data only):

```sh
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const run = JSON.parse(readFileSync("fixtures/reference-8b.json", "utf8"));
writeFileSync("/tmp/archive-claim.json", JSON.stringify({
  submitter: "local-test", model: "reference-8b",
  endpoint: "https://inference.example.com/v1",
  attestation: "self-reported", run, consent: true
}));'
curl --fail-with-body http://localhost:4321/api/submissions \
  -H 'Content-Type: application/json' --data-binary @/tmp/archive-claim.json
```

The 201 response contains a claim ID and signed challenge with `issuedAt`, `expiresAt`, nonce, digest and token. Save the receipt. It neither starts a runner nor proves any result. Active identical declarations return 409. Never include API credentials in endpoint URLs or hardware/config fields.

Admin draft payloads have the shape `{ "collection": "models", "data": { ...modelRecord } }`, or collections `benchmarks` / `posts` with the corresponding schema. Post drafts additionally require `slug` and Markdown `body`. For example, using curl's interactive password prompt:

```sh
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
writeFileSync("/tmp/archive-draft.json", JSON.stringify({
  collection: "models", data: JSON.parse(readFileSync("src/content/models/reference-8b.json", "utf8"))
}));'
curl --fail-with-body --user archivist http://localhost:4321/api/admin/drafts \
  -H 'Content-Type: application/json' --data-binary @/tmp/archive-draft.json
```

A review body is `{ "claimId": "<UUID from receipt>", "decision": "needs-information", "note": "Please supply the model revision." }`. `rejected` is the other permitted decision. There is no verified/publish operation. Drafts do not change live content: inspect them, move reviewed records to the appropriate collection/fixture files, then build and deploy. Do not copy private endpoints or other private evidence into public content.

## Phase boundary and design documents

[docs/DESIGN.md](docs/DESIGN.md) specifies tokens, typography, layout, components, accessibility and the written ink-line vault art direction. [docs/SUBMISSIONS.md](docs/SUBMISSIONS.md) specifies the signed nonce protocol, random 5% reproduction within 72 hours, pass criteria, rate limits, hardware tiers and D1 storage boundary.

The reproduction worker, endpoint-control handshake, outbound-network sandbox, evidence uploads, scoring tolerances, automated publishing and verified badges are deliberately not implemented in this phase. The repository interface in `lib/server/records.ts` is implemented by transactional D1 storage in `lib/server/d1-store.ts`, with SQLite migrations in `migrations/`. JSON storage is retained only for local development. Existing Phase 1 JSON data is not automatically imported; any import must preserve IDs, digests, nonces and review history and validate record counts before cutover.

Astro implementation references: [content collections](https://docs.astro.build/en/guides/content-collections/), [server islands](https://docs.astro.build/en/guides/server-islands/) and [Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/).

Platform references: [Workers static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/), [D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), and [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
