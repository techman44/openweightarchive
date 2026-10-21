import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getPlatformProxy } from 'wrangler';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { verifyChallenge } from '../lib/server/challenge.ts';

// Built Worker HTTP checks with ephemeral local D1 and secrets. No remote resource or submitted URL is accessed.
const directory = await mkdtemp(join(tmpdir(), 'archive-smoke-'));
try { await smoke(directory); }
finally { await rm(directory, { recursive: true, force: true }); }

async function smoke(directory) {
  const chunks = await readdir('dist/server/chunks');
  assert.ok(chunks.every((file) => !file.includes('file-store') && !file.includes('dev-env')), 'Development file storage must not ship in the Worker');
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  const password = randomBytes(32).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const base = `http://127.0.0.1:${port}`;
  const auth = `Basic ${Buffer.from(`test:${password}`).toString('base64')}`;
  const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
  const built = JSON.parse(await readFile('dist/server/wrangler.json', 'utf8'));
  const configPath = join(directory, 'wrangler.json');
  const persistence = join(directory, 'state');
  const config = {
    name: built.name, compatibility_date: built.compatibility_date, compatibility_flags: built.compatibility_flags,
    main: resolve('dist/server', built.main), no_bundle: true, rules: built.rules,
    assets: { ...built.assets, directory: resolve('dist/server', built.assets.directory) },
    d1_databases: built.d1_databases.map((db) => ({ ...db, migrations_dir: resolve('migrations') })),
    r2_buckets: built.r2_buckets, vars: { ADMIN_USERNAME: 'test' },
  };
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(join(directory, '.dev.vars'), `ADMIN_PASSWORD=${password}\nSUBMISSION_SECRET=${secret}\n`, { mode: 0o600 });
  const localEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ACCOUNT_ID: '' };
  await promisify(execFile)(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'OWA_DB', '--local', '--config', configPath, '--persist-to', persistence], { env: localEnv });
  let output = '';
  let server;
  function start() {
    output = '';
    server = spawn(process.execPath, [wrangler, 'dev', '--local', '--config', configPath, '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0', '--persist-to', persistence, '--log-level', 'error'], {
      env: localEnv, stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (data) => { output += data; });
    server.stderr.on('data', (data) => { output += data; });
  }
  const stop = () => { server.kill('SIGTERM'); };
  async function ready() {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (server.exitCode !== null) throw new Error(`Worker exited: ${output}`);
      try { if ((await fetch(base)).ok) return; } catch {}
      await delay(100);
    }
    throw new Error(`Worker did not start: ${output}`);
  }
  start();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  const post = (path, payload, authenticated = false, headers = {}) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: auth } : {}), ...headers }, body: JSON.stringify(payload),
  });
  try {
    await ready();
    for (const path of ['/', '/benchmarks', '/models/reference-8b', '/models/reference-14b', '/models/reference-32b', '/blog', '/blog/how-we-record-a-score', '/blog/reading-a-memory-estimate', '/blog/why-an-archive', '/submit']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=60, must-revalidate', path);
      const html = await response.text();
      if (path === '/') {
        const assetPath = html.match(/(?:href|src)="([^"]*\/_astro\/[^"]+)"/)?.[1];
        assert.ok(assetPath, 'Hashed asset is present');
        const asset = await fetch(new URL(assetPath, base));
        assert.equal(asset.status, 200);
        assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      }
      assert.match(html, /Skip to content/, path);
      assert.match(html, /<main/, path);
      if (path === '/submit') {
        // Exercise Astro's actual encrypted server-island request from the built page.
        const route = html.match(/\/_server-islands\/IntakeStatus\?[^"'\s<>]+/)?.[0];
        assert.ok(route, 'Intake server-island URL is present');
        const island = await fetch(base + route.replaceAll('&amp;', '&'));
        assert.equal(island.status, 200);
        assert.equal(island.headers.get('cache-control'), 'no-store');
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
    // A fresh Worker instance must read the same D1 state and duplicate/quota history.
    stop();
    await once(server, 'exit');
    start();
    await ready();
    const reopened = await fetch(base + '/admin', { headers: { Authorization: auth } });
    const reopenedHTML = await reopened.text();
    assert.match(reopenedHTML, /1 claims · 1 drafts/);
    assert.match(reopenedHTML, /needs-information/);
    assert.equal((await post('/api/submissions', claim)).status, 409);
    const platform = await getPlatformProxy({ configPath, persist: { path: join(persistence, 'v3') }, remoteBindings: false });
    try {
      const db = platform.env.OWA_DB;
      assert.equal(await db.prepare('SELECT count(*) AS n FROM submissions').first('n'), 1);
      assert.equal(await db.prepare('SELECT count(*) AS n FROM submission_reviews').first('n'), 1);
      assert.equal(await db.prepare('SELECT count(*) AS n FROM models').first('n'), 1);
    } finally { await platform.dispose(); }
    const publicPage = await (await fetch(base)).text();
    assert.ok(!publicPage.includes(claim.endpoint));
    assert.ok(!publicPage.includes(password));
    assert.ok(!publicPage.includes(secret));
    if (!process.argv.includes('--serve')) {
      stop();
      await once(server, 'exit');
      await writeFile(configPath, JSON.stringify({ ...config, d1_databases: [] }));
      start();
      await ready();
      assert.equal((await post('/api/submissions', { ...claim, submitter: 'No binding' })).status, 503);
      assert.equal((await post('/api/admin/drafts', { collection: 'models', data: model }, true)).status, 503);
      assert.equal((await fetch(base + '/admin', { headers: { Authorization: auth } })).status, 503);
      stop();
      await once(server, 'exit');
      await writeFile(configPath, JSON.stringify({
        ...config,
        d1_databases: config.d1_databases.map((db) => ({ ...db, database_id: '11111111-1111-1111-1111-111111111111' })),
      }));
      start();
      await ready();
      assert.equal((await post('/api/submissions', { ...claim, submitter: 'Unmigrated D1' })).status, 503);
      assert.equal((await post('/api/admin/drafts', { collection: 'models', data: model }, true)).status, 503);
    }
    console.log('Workers smoke checks passed: cache headers, server island, authentication, claims/reviews/drafts, persistent D1, and fail-closed storage.');
    if (process.argv.includes('--serve')) {
      console.log(`Temporary review server: ${base}`);
      await once(server, 'exit');
    }
  } finally {
    if (server.exitCode === null) { stop(); await once(server, 'exit'); }
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
