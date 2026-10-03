import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, KEY } from './helpers.js';

test('healthy source -> /health/source 200 ok', async () => {
  const srv = await startTestServer();
  try {
    const r = await srv.get('/health/source');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
  } finally { await srv.close(); }
});

test('a source whose self-check fails -> /health/source 503 degraded', async () => {
  const brokenSource = {
    name: 'broken',
    async fetchCase() { return { found: false, reason: 'not_found' }; },
    async selfCheck() { throw new Error('simulated markup drift'); }
  };
  const srv = await startTestServer({ source: brokenSource });
  try {
    const r = await srv.get('/health/source');
    assert.equal(r.status, 503);
    assert.equal(r.body.status, 'degraded');
    assert.match(r.body.error, /drift/);
  } finally { await srv.close(); }
});

test('liveness /health stays 200 even if the source is degraded', async () => {
  const brokenSource = {
    name: 'broken',
    async fetchCase() { throw new Error('down'); },
    async selfCheck() { throw new Error('down'); }
  };
  const srv = await startTestServer({ source: brokenSource });
  try {
    const r = await srv.get('/health');
    assert.equal(r.status, 200); // liveness != readiness
  } finally { await srv.close(); }
});
