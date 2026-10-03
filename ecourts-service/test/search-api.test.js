import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, KEY } from './helpers.js';

let srv;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });

test('GET /api/courts returns the hierarchy, no auth required', async () => {
  const r = await srv.get('/api/courts');
  assert.equal(r.status, 200);
  assert.ok(r.body.hierarchy.Maharashtra);
  assert.ok(r.body.hierarchy.Maharashtra.Mumbai.includes('Bombay High Court'));
});

test('search requires auth', async () => {
  const r = await srv.get('/api/search?mode=party&name=Sharma');
  assert.equal(r.status, 401);
});

test('search rejects an unknown mode', async () => {
  const r = await srv.get('/api/search?mode=nonsense', KEY);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /unknown or missing mode/);
});

test('search rejects a missing mode', async () => {
  const r = await srv.get('/api/search', KEY);
  assert.equal(r.status, 400);
});

test('party name search over HTTP', async () => {
  const r = await srv.get('/api/search?mode=party&name=Sharma', KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'party');
  assert.equal(r.body.count, 1);
  assert.equal(r.body.results[0].cnr, 'MHCC010012342026');
});

test('party name search with no match returns count 0, not an error', async () => {
  const r = await srv.get('/api/search?mode=party&name=zzzznobody', KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 0);
  assert.deepEqual(r.body.results, []);
});

test('party name search missing required field -> 400', async () => {
  const r = await srv.get('/api/search?mode=party', KEY);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /party name/);
});

test('filing number search over HTTP', async () => {
  const r = await srv.get(`/api/search?mode=filing&filingNumber=${encodeURIComponent('4521/2026')}`, KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.results[0].cnr, 'MHCC020045212026');
});

test('FIR search over HTTP', async () => {
  const r = await srv.get(`/api/search?mode=fir&firNumber=${encodeURIComponent('211/2026')}`, KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1);
});

test('advocate search over HTTP', async () => {
  const r = await srv.get('/api/search?mode=advocate&name=Sethi', KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.results[0].cnr, 'DLHC050132072026');
});

test('act search over HTTP', async () => {
  const r = await srv.get(`/api/search?mode=act&act=${encodeURIComponent('Motor Vehicles Act')}`, KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1);
});

test('case type search over HTTP', async () => {
  const r = await srv.get(`/api/search?mode=caseType&caseType=${encodeURIComponent('writ')}`, KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.results[0].cnr, 'DLHC050132072026');
});

test('caveat search over HTTP', async () => {
  const r = await srv.get('/api/search?mode=caveat&name=Rao', KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1);
  assert.equal(r.body.results[0].caveatNumber, 'CAV/510/2026');
});

test('pre-trial / interim application search over HTTP, no required params', async () => {
  const r = await srv.get('/api/search?mode=pretrial', KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 4);
});

test('pre-trial search scoped by type', async () => {
  const r = await srv.get(`/api/search?mode=pretrial&type=${encodeURIComponent('condonation')}`, KEY);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1);
  assert.equal(r.body.results[0].iaNumber, 'IA/0765/2026');
});

test('invalid location combination -> 400', async () => {
  const r = await srv.get('/api/search?mode=party&name=Sharma&state=Gujarat', KEY);
  assert.equal(r.status, 400);
});

test('a search result CNR can be fetched in full via case-status', async () => {
  const s = await srv.get('/api/search?mode=party&name=Sharma', KEY);
  const cnr = s.body.results[0].cnr;
  const full = await srv.get(`/api/case-status/${cnr}`, KEY);
  assert.equal(full.status, 200);
  assert.equal(full.body.found, true);
  assert.equal(full.body.cnr, cnr);
});

test('rate limiting applies to /api/search too', async () => {
  const small = await startTestServer({ rateLimitPerMin: 2 });
  try {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await small.get('/api/search?mode=pretrial', KEY)).status);
    assert.ok(codes.includes(429), `expected a 429 in ${codes}`);
  } finally { await small.close(); }
});
