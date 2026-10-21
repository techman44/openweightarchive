import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { verifyChallenge } from '../lib/server/challenge.ts';

// Real production HTTP checks with ephemeral secrets and storage. No submitted URL is fetched.
const directory = await mkdtemp(join(tmpdir(), 'archive-smoke-'));
const portProbe = createServer();
portProbe.listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const password = randomBytes(32).toString('hex');
const secret = randomBytes(32).toString('hex');
const base = `http://127.0.0.1:${port}`;
const auth = `Basic ${Buffer.from(`test:${password}`).toString('base64')}`;
let output = '';
const server = spawn(process.execPath, ['dist/server/entry.mjs'], {
  cwd: new URL('../', import.meta.url),
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: directory, ADMIN_USERNAME: 'test', ADMIN_PASSWORD: password, SUBMISSION_SECRET: secret },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (data) => { output += data; });
server.stderr.on('data', (data) => { output += data; });
const stop = () => { server.kill('SIGTERM'); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

const post = (path, payload, authenticated = false, headers = {}) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: auth } : {}), ...headers }, body: JSON.stringify(payload),
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, `Server did not start: ${output}`);
  for (const path of ['/', '/benchmarks', '/models/reference-8b', '/models/reference-14b', '/models/reference-32b', '/blog', '/blog/how-we-record-a-score', '/blog/reading-a-memory-estimate', '/blog/why-an-archive', '/submit']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /Skip to content/, path);
    assert.match(html, /<main/, path);
    if (path === '/submit') {
      // Exercise Astro's actual encrypted server-island request from the built page.
      const route = html.match(/\/_server-islands\/IntakeStatus\?[^"'\s<>]+/)?.[0];
      assert.ok(route, 'Intake server-island URL is present');
      const island = await fetch(base + route.replaceAll('&amp;', '&'));
      assert.equal(island.status, 200);
      assert.match(await island.text(), /Claim intake is available/);
    }
  }
  assert.equal((await fetch(base + '/not-a-record')).status, 404);
  const unauthenticated = await fetch(base + '/admin');
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get('www-authenticate'), /Basic/);
  for (const route of ['/api/admin/drafts', '/api/admin/reviews']) assert.equal((await post(route, {})).status, 401);
  for (const route of ['/%61dmin', '//admin', '/admin/']) assert.equal((await fetch(base + route)).status, 401);
  for (const route of ['/api/%61dmin/drafts', '/api//admin/drafts']) assert.equal((await post(route, {})).status, 401);
  const admin = await fetch(base + '/admin', { headers: { Authorization: auth } });
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get('cache-control'), 'no-store');
  assert.match(await admin.text(), /Admin stub/);

  const run = JSON.parse(await readFile(new URL('../fixtures/reference-8b.json', import.meta.url), 'utf8'));
  const claim = { submitter: 'Smoke test', model: 'reference-8b', endpoint: 'https://inference.example.com/v1', attestation: 'self-reported', run, consent: true };
  assert.equal((await post('/api/submissions', { ...claim, status: 'verified' })).status, 400);
  assert.equal((await post('/api/submissions', claim, false, { Origin: 'https://evil.example' })).status, 403);
  const response = await post('/api/submissions', claim);
  assert.equal(response.status, 201);
  const receipt = await response.json();
  assert.equal(receipt.status, 'claim');
  assert.ok(verifyChallenge(receipt.challenge.token, secret));
  assert.equal((await post('/api/submissions', claim)).status, 409);

  assert.equal((await post('/api/admin/reviews', { claimId: receipt.id, decision: 'verified', note: 'Invalid promotion' }, true)).status, 400);
  assert.equal((await post('/api/admin/reviews', { claimId: receipt.id, decision: 'needs-information', note: 'Please supply revision.' }, true, { Origin: 'https://evil.example' })).status, 403);
  const review = await post('/api/admin/reviews', { claimId: receipt.id, decision: 'needs-information', note: 'Please supply revision.' }, true);
  assert.equal(review.status, 200);
  assert.equal((await review.json()).status, 'needs-information');
  const model = JSON.parse(await readFile(new URL('../src/content/models/reference-8b.json', import.meta.url), 'utf8'));
  const draft = await post('/api/admin/drafts', { collection: 'models', data: model }, true);
  assert.equal(draft.status, 201);
  const state = JSON.parse(await readFile(join(directory, 'archive.json'), 'utf8'));
  assert.equal(state.claims.length, 1);
  assert.equal(state.reviews.length, 1);
  assert.equal(state.drafts.length, 1);
  assert.equal(state.claims[0].status, 'needs-information');
  const publicPage = await (await fetch(base)).text();
  assert.ok(!publicPage.includes(claim.endpoint));
  assert.ok(!publicPage.includes(password));
  assert.ok(!publicPage.includes(secret));
  console.log('Production smoke checks passed: 10 public routes, 404, server island, authentication, claims, validation, reviews, drafts and persistence.');
  if (process.argv.includes('--serve')) {
    console.log(`Temporary review server: ${base}`);
    await once(server, 'exit');
  }
} finally {
  if (server.exitCode === null) { stop(); await once(server, 'exit'); }
  await rm(directory, { recursive: true, force: true });
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
