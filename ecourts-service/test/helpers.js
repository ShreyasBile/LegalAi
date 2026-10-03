import { buildServer } from '../src/server.js';

/* Boots a real HTTP server on an ephemeral port with deterministic test config
   (own API keys, own cache/usage) and returns helpers to call it. */
export async function startTestServer(overrides = {}) {
  const built = buildServer({
    apiKeys: new Map([['test-key', { tenant: 'Test Firm' }]]),
    adminKey: 'test-admin',
    rateLimitPerMin: 30,
    ...overrides
  });
  await new Promise(res => built.server.listen(0, res));
  const port = built.server.address().port;
  const base = `http://127.0.0.1:${port}`;

  async function get(path, headers = {}) {
    const res = await fetch(base + path, { headers });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body, headers: res.headers };
  }

  return {
    base,
    get,
    ctx: built,
    close: () => new Promise(res => built.server.close(res))
  };
}

export const KEY = { 'x-api-key': 'test-key' };
export const ADMIN = { 'x-admin-key': 'test-admin' };
