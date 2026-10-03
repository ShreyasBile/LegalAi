import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, KEY, ADMIN } from './helpers.js';

const ACTIVE = 'MHCC010012342026';
const DISPOSED = 'DLHC050132072026';
const UNKNOWN = 'MHCC010099992026';
const DRIFTED = 'MHCC019999992026';
const OUTAGE = 'MHER000000002026';

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });

test('GET / returns service info', async () => {
  const r = await srv.get('/');
  assert.equal(r.status, 200);
  assert.equal(r.body.service, 'ecourts-service');
});

test('GET /health is ok', async () => {
  const r = await srv.get('/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
});

test('GET /health/source passes self-check', async () => {
  const r = await srv.get('/health/source');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
});

test('case-status without api key -> 401', async () => {
  const r = await srv.get(`/api/case-status/${ACTIVE}`);
  assert.equal(r.status, 401);
});

test('case-status with bad api key -> 401', async () => {
  const r = await srv.get(`/api/case-status/${ACTIVE}`, { 'x-api-key': 'nope' });
  assert.equal(r.status, 401);
});

test('valid CNR -> 200 with correct data, uncached first', async () => {
  const r = await srv.get(`/api/case-status/${ACTIVE}`, KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.found, true);
  assert.equal(r.body.cnr, ACTIVE);
  assert.equal(r.body.caseType, 'CRIMINAL BAIL APPLICATION');
  assert.equal(r.body.status.nextHearingDateIso, '2026-09-11');
  assert.equal(r.body.meta.source, 'fixture');
  assert.equal(r.body.meta.cached, false);
});

test('second identical lookup is served from cache', async () => {
  const r = await srv.get(`/api/case-status/${ACTIVE}`, KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.meta.cached, true);
});

test('accepts a hyphenated CNR and normalizes it', async () => {
  const r = await srv.get('/api/case-status/DLHC05-013207-2026', KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.cnr, DISPOSED);
  assert.equal(r.body.status.disposed, true);
});

test('unknown but valid CNR -> 404 found:false', async () => {
  const r = await srv.get(`/api/case-status/${UNKNOWN}`, KEY);
  assert.equal(r.status, 404);
  assert.equal(r.body.found, false);
  assert.equal(r.body.reason, 'not_found');
});

test('malformed CNR -> 400', async () => {
  const r = await srv.get('/api/case-status/ABC123', KEY);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /invalid CNR/);
});

test('markup drift -> 502 upstream_format_error', async () => {
  const r = await srv.get(`/api/case-status/${DRIFTED}`, KEY);
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'upstream_format_error');
});

test('source outage -> 502 upstream_unavailable', async () => {
  const r = await srv.get(`/api/case-status/${OUTAGE}`, KEY);
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'upstream_unavailable');
});

test('rate limiting kicks in past the per-minute cap', async () => {
  const small = await startTestServer({ rateLimitPerMin: 3 });
  try {
    const codes = [];
    for (let i = 0; i < 5; i++) {
      // vary CNR so caching never masks the upstream/limiter path
      const r = await small.get(`/api/case-status/MHCC0100${String(1000 + i)}2026`, KEY);
      codes.push(r.status);
    }
    assert.equal(codes.slice(0, 3).every(c => c !== 429), true, `first 3 should pass: ${codes}`);
    assert.equal(codes.includes(429), true, `expected a 429 in ${codes}`);
    const last = await small.get(`/api/case-status/MHCC010099992026`, KEY);
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers.get('retry-after')) > 0);
  } finally {
    await small.close();
  }
});

test('admin usage requires admin key', async () => {
  const denied = await srv.get('/admin/usage');
  assert.equal(denied.status, 401);
  const ok = await srv.get('/admin/usage', ADMIN);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.usage['Test Firm']);
  assert.ok(ok.body.cache);
});

test('unknown route -> 404', async () => {
  const r = await srv.get('/nope');
  assert.equal(r.status, 404);
});

test('CORS preflight is answered', async () => {
  const res = await fetch(`${srv.base}/api/case-status/${ACTIVE}`, { method: 'OPTIONS' });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('a malformed percent-escape in the URL returns 400 and does not crash the server', async () => {
  const r = await srv.get('/api/case-status/%E0%A4');
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'bad url');
  const alive = await srv.get('/health');           // the process is still serving requests
  assert.equal(alive.status, 200);
});
