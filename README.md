# OpenWeightArchive

Phase 1 scaffold for **openweightarchive.com**: a dark, editorial model archive built with Astro, plain CSS and native browser scripts. This implements [BRIEF.md](BRIEF.md); it is not a production benchmark verification service.

All three model records, their specifications and benchmark scores are **fictional fixtures**. Journal entries explain the proposed methods, not current AI news. Submitted scores remain unverified claims. No image assets have been generated.

## Local development

Use Node **22.22.0 or newer** (Node 24 recommended) and npm 9.6 or newer.

```sh
npm install
npm run dev
```

Open `http://localhost:4321`. All public pages work without secrets; the admin and submission write endpoints return 503 until configured. The only direct dependencies are `astro` and its official `@astrojs/node` adapter. No framework, database, CSS library or test dependency is installed. Commit the lockfile for repeatable installs.

To exercise private functionality locally:

```sh
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Put the two different random values into `ADMIN_PASSWORD` and `SUBMISSION_SECRET` in `.env`. Keep `ADMIN_USERNAME=archivist` or choose a username without a colon. Both secrets need at least 32 characters. Never commit `.env`. Restart the dev server after changing runtime configuration. Open `/admin` and use the browser's Basic-auth prompt.

| Variable | Purpose / default |
| --- | --- |
| `ADMIN_USERNAME` | Basic-auth username; defaults to `archivist` |
| `ADMIN_PASSWORD` | Required random admin secret; missing/short disables admin |
| `SUBMISSION_SECRET` | Independent HMAC key; missing/short disables claim intake |
| `DATA_DIR` | Private persistent JSON store; defaults to `./data` relative to the process cwd |
| `HOST` | Node listener; `.env.example` uses `127.0.0.1` |
| `PORT` | Node listener; `.env.example` uses `4321` |

Development and start scripts load `.env` through Node. Server code reads secrets from `process.env` **at runtime**, never from `PUBLIC_*` variables or build-time interpolation. The build does not need secrets.

## Build, run and verify

```sh
npm install && npm run build
npm test
npm run test:smoke
npm start
```

`npm run build` checks that committed JSON Schemas match their TypeScript definitions, validates content collections and builds static pages plus a standalone Node server. `npm start` serves the build, including static assets, POST endpoints and the server island; `npm run preview` is an alias. The configured listener is `127.0.0.1:4321`; HOST and PORT override it at runtime. `astro preview` alone is not the production deployment process. As with a standard Astro build, this transpiles TypeScript; it does not run a full standalone type check. Type-checking tools and Node type definitions are not added under the brief's dependency restriction.

Unit tests use Node's built-in runner and temporary directories. The smoke script starts the **built** server on a temporary loopback port with generated test secrets, exercises public pages, server-island output, protected APIs, nonce receipts and persistence, then deletes the temporary data. It does not contact a submitted endpoint or use your `.env`/real data.

For deployment, run one Node process, persist a private DATA_DIR outside `dist/client` and the web root, and terminate HTTPS at a configured reverse proxy. Back up the store. Do not run multiple workers against the JSON file. Set proxy body/connection/rate limits and preserve the correct request origin for same-origin checks. The app deliberately ignores untrusted forwarded-IP headers; behind a proxy, direct-peer limits may be shared. Configure a trusted boundary before public intake. Secrets should be injected by the service manager. Keep the deployed server and client output from the same build so encrypted server-island props remain compatible.

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

[docs/DESIGN.md](docs/DESIGN.md) specifies tokens, typography, layout, components, accessibility and the written ink-line vault art direction. [docs/SUBMISSIONS.md](docs/SUBMISSIONS.md) specifies the signed nonce protocol, random 5% reproduction within 72 hours, pass criteria, rate limits, hardware tiers and Postgres migration boundary.

The reproduction worker, endpoint-control handshake, outbound-network sandbox, evidence uploads, scoring tolerances, automated publishing and verified badges are deliberately not implemented in this phase. The repository interface in `lib/server/store.ts` provides the seam for replacing the single-process JSON store with transactional Postgres later.

Astro implementation references: [content collections](https://docs.astro.build/en/guides/content-collections/), [server islands](https://docs.astro.build/en/guides/server-islands/) and [Node adapter](https://docs.astro.build/en/guides/integrations-guide/node/).
