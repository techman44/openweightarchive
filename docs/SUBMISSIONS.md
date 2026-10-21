# Submission integrity and reproduction design

## Trust boundary

A submission is a **claim** until independently reproduced. The form, JSON API, database representation and editorial display must preserve that distinction. A signature authenticates our challenge; it does not authenticate the submitter's result, model weights, endpoint ownership or hardware. Requested hardware tiers are never automatically awarded.

Phase 1 implements validated intake, a signed nonce receipt, persistent rate limits, private JSON storage, basic-auth administration and review notes. **The ct-bench runner, random task selection, result comparison, evidence-upload pipeline and verified badge are design only.** No Phase 1 API, collection value or admin control can create a verified result. Claim receipts expire after 72 hours; the stored historical claim remains unverified and shows the expiry. No background worker runs yet.

## Proposed protocol

1. The submitter declares their handle, model identifier, inference endpoint, full ct-bench configuration, raw per-task scores and sample counts, run time, hardware, requested attestation tier and permission to perform the reproduction. A production claim must additionally pin the model/weights digest, quantization, tokenizer and chat-template hashes, runtime version, suite and harness revisions, dataset manifest, seeds and scoring policy. Credentials must use a separate expiring secret channel; never put them in the endpoint, public record, challenge or logs.
2. The server validates the declaration and freezes it as an immutable claim. It creates a CSPRNG 256-bit nonce, unique claim ID, issue time, 72-hour expiry and SHA-256 digest of the canonical declaration. It signs a versioned, base64url payload with HMAC-SHA256 using a runtime secret. This Phase 1 token is returned as a receipt and stored privately with the declaration. Changes to an endpoint, configuration or score require a new claim and challenge.
3. The future runner claims an unexpired job transactionally. The endpoint proves control by echoing the challenge nonce in the prescribed authenticated handshake. A one-use challenge is bound to the claim, endpoint and exact config. The runner records challenge consumption, with idempotent retry semantics for its own job ID. A receipt cannot be reused for a different run or reset the 72-hour window.
4. **Our ct-bench harness re-runs a random 5% task subset against their declared endpoint within 72 hours of challenge issuance.** Define the population as eligible scored task instances in the pinned suite manifest; choose `max(1, ceil(0.05 × N))` without replacement using a cryptographic RNG. Commit to the sample/seed hash privately before requests; reveal selected IDs and the seed in the final evidence. Do not disclose the subset to the submitter in advance. Record per-task coverage; tasks with no selected instances have no reproduced evidence. Selection must not be controlled by the submitter.
5. The runner uses the frozen config exactly: thinking, max generation tokens, temperature, prompts/templates and other declared settings. It records request/response hashes, task IDs, raw outputs subject to redaction, timing, scorer version, per-item results and hardware-attestation evidence. The operator's harness, not a submitter callback, computes the verdict.
6. Only a passing completed reproduction may set a record to **verified**, with a linked report containing the reproduced subset, coverage, actual config, time and comparison policy. The label means that the recorded subset passed under those conditions. It is not an endorsement of the model, the entire suite, legal compliance, absence of training contamination or claimed hardware.

## Pass, fail and uncertainty

Before accepting production claims, publish and version a task-specific comparison policy. A random 5% subset must not be compared naively to an aggregate score on the whole suite. Require original per-item evidence for selected IDs, or use a predefined statistical test with adequate sample size. Use exact comparisons only where the scoring process is deterministic. For stochastic outputs use predeclared repetitions, confidence bounds and tolerances; do not choose tolerances after seeing a result. A small subset may be inconclusive rather than passing.

All sampled tasks must complete with a valid scorer result within the deadline. An inconclusive result, timeout, endpoint failure, changed model/config or missing evidence produces `needs-information`, `expired` or `failed` as appropriate, never verified. A corrected submission gets a new claim, preserving the old history. Requests for manual review must not provide a verification bypass.

The future state machine is `claim → challenge-issued → queued → running → verified | failed | inconclusive | expired`, with editorial rejection as a separate audited action. Phase 1 deliberately exposes only `claim`, `needs-information` and `rejected`; challenge dates are metadata. Verified status requires a runner-owned report ID, not a client-supplied boolean or a human clicking an approval button.

## Hardware attestation tiers

| Tier | Evidence and scope | Limitations |
| --- | --- | --- |
| Self-reported | Submitter's hardware declaration, runtime and memory settings. Default; visibly labelled self-reported. | No independent hardware assurance. |
| Photo | Reviewer inspects time-bound photographs showing hardware and a fresh nonce; retain evidence digest and review date. Redact serial numbers and identifying surroundings before any publication. | A photograph does not prove which hardware served inference. |
| Witnessed-remote | Operator witnesses a consented remote session with nonce, device enumeration, runtime process, configuration and live reproduction. Record reviewer, time and evidence digest. | Remote environments and routing can still be manipulated; this is witnessed evidence, not cryptographic device attestation. |

Hardware tier and score verification are separate axes. A photo cannot verify a score; a reproduced score cannot prove the declared GPU. In Phase 1 the selector stores a **requested** tier and all hardware is treated as self-reported. No file uploads or remote sessions are implemented.

## Abuse and endpoint safety

- Phase 1 accepts at most five claims per direct peer address per hour and ten per endpoint origin per 24 hours. The counters are HMAC-keyed and persisted atomically with successful claims, so a server restart does not erase them. Duplicate active declarations are rejected. Body size is capped at 64 KiB, including streamed requests.
- A bounded in-memory limiter caps public intake attempts at 30 per 15 minutes per direct peer; admin requests at 120 per 15 minutes. Return 429 and Retry-After. These attempt limits reset on restart. Put additional request, connection, failed-login and disk/queue limits at the deployment proxy before enabling public service.
- The application deliberately does not trust arbitrary forwarded-IP headers. Behind a proxy the direct peer limit may apply to all users. Configure and test a trusted proxy identity boundary before using client-specific limits; never read a user-supplied X-Forwarded-For value as identity.
- Phase 1 stores endpoints but makes **no outbound network requests**. HTTPS, no embedded credentials, no query string and no fragment are required. This is input hygiene, not an SSRF defence for a future runner.
- Before enabling the runner, isolate outbound traffic. Resolve and validate every A/AAAA address; deny loopback, private, link-local, multicast, reserved and metadata ranges, including IPv4-mapped IPv6. Revalidate/pin DNS at connection time; disable redirects or validate each target and enforce an egress firewall. Restrict ports, request/response sizes, timeouts, concurrency and total tokens. Protect against DNS rebinding, redirect escapes and unbounded generations.
- A submitter may proxy requests to a different model or hosted service. Keep unpredictable sampling, endpoint control checks, consistency checks and independent hardware attestation; disclose residual uncertainty. Reproduction alone cannot establish weight identity.

## Storage, authentication and publication

`lib/server/store.ts` implements the `ArchiveRepository` interface with one versioned private `archive.json` document containing claims, drafts, reviews and short-lived rate-limit records. It serialises writes in one process, writes to a unique 0600 temporary file, syncs it and atomically renames it. The directory is created with 0700 permissions. Corrupt storage fails closed rather than being overwritten. Maintain backups; atomic replacement is not a backup or a distributed transaction.

Run **one Node process** against a persistent local filesystem. Do not share this file across worker processes, containers or network filesystems. Keep DATA_DIR outside the public directory, restrict ownership, and never commit it. It contains private endpoints, handles, declarations and nonces. No submission is automatically published, and no endpoint, handle or token is rendered into public pages. Proxy logs must redact Authorization and request bodies.

`/admin` and `/api/admin/*` are guarded centrally by HTTP Basic authentication. ADMIN_PASSWORD must be a random secret of at least 32 characters; an unset/short value disables access with 503. Comparisons use constant-time digest comparison. Use HTTPS in production; Basic credentials are not encryption. Never expose admin over unauthenticated public HTTP. Responses are private/no-store and admin HTML is noindex. Writes reject cross-origin browser requests, require JSON and validate allowed fields. Client-supplied status/verified flags are rejected.

The draft endpoint validates models, benchmarks or posts and saves unpublished editorial content. The review endpoint can request information or reject a claim, recording an append-only note. It cannot edit the original declaration or issue verified status. Draft publication is a manual reviewed change to the build-time collections, followed by a rebuild. Do not transfer private submission endpoints into public content.

## Secret rotation, retention and Postgres migration

Keep ADMIN_PASSWORD, SUBMISSION_SECRET and any future runner credentials separate. SUBMISSION_SECRET is used for challenge signatures and rate-limit pseudonyms; rotating it invalidates old receipts and changes rate-limit keys. Schedule rotation, close intake during an emergency rotation and reissue affected claims explicitly. A future version should use key IDs and a short verification grace period limited to the original expiry. Never extend a receipt just because the service was down.

Rate-limit keys older than 24 hours are pruned on successful intake. Phase 1 has no automated claim/evidence retention or deletion job; the operator must define and communicate retention before public launch. Only retain consented data necessary for review; redact private evidence from published reports. Backups must follow the same access and deletion policy.

For Postgres, implement `ArchiveRepository` over transactions and keep route contracts stable. Split immutable claims, challenges, reproduction jobs, reports, drafts, append-only review events and expiring rate counters into tables. Add unique claim-digest and one-use nonce constraints, foreign keys, row locks for job leasing and transactional rate limits. Migrate with a versioned export/import and record-count/hash checks, then remove file writes. Store large evidence separately by immutable digest. The future runner must authenticate independently from human admin access.
