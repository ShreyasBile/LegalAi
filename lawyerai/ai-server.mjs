/* The AI routes of the workspace server: the provider call, the saved API key and the case-law lookup.
   The rules for prompts, answers and citations are in ai-core.mjs.

   The API key lives in <repo>/.local/ai.json (git-ignored, outside the web root) or in OPENROUTER_API_KEY. The browser can
   save a key but can never read it back: it only learns the last four characters.

   The routes only answer requests that come from this machine's own pages: the Host must be localhost, a request that
   carries an Origin must be from the same host, and a POST must be JSON (which a web page on another site cannot send
   without a cross-origin check that this server never grants). Otherwise any web page you visit could spend your key. */
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiError, ACTIONS, citationReport, runAction } from './ai-core.mjs';

const DEFAULTS = { baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' };
const MAX_BODY = 400_000;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function isSafeBaseUrl(s) {
  let u; try { u = new URL(s); } catch { return false; }
  return u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname));      // plain http only for a model running on this machine
}

export function createAiHandler({
  settingsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.local'),
  caselawUrl = process.env.CASELAW_API_URL || 'http://127.0.0.1:8090',
  env = process.env,
  perMinute = 30
} = {}) {
  const file = join(settingsDir, 'ai.json');
  const stamps = [];

  const readSaved = () => { try { const j = JSON.parse(readFileSync(file, 'utf8')); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
  function effective() {
    const s = readSaved();
    const apiKey = String(s.apiKey || env.OPENROUTER_API_KEY || '').trim();
    return {
      apiKey,
      source: s.apiKey ? 'settings' : env.OPENROUTER_API_KEY ? 'environment' : 'none',
      model: String(s.model || env.OPENROUTER_MODEL || DEFAULTS.model).trim(),
      baseUrl: String(s.baseUrl || env.AI_BASE_URL || DEFAULTS.baseUrl).trim().replace(/\/+$/, '')
    };
  }
  const publicStatus = () => {
    const e = effective();
    return { configured: !!e.apiKey, usable: !!e.apiKey || (isSafeBaseUrl(e.baseUrl) && /^http:/.test(e.baseUrl)), source: e.source, keyHint: e.apiKey ? `••••${e.apiKey.slice(-4)}` : '', model: e.model, baseUrl: e.baseUrl, defaults: DEFAULTS };
  };

  async function call(messages, { maxTokens = 3000 } = {}) {
    const e = effective();
    // A model that runs on this machine (Ollama) needs no key; a hosted one does.
    const local = isSafeBaseUrl(e.baseUrl) && /^http:/.test(e.baseUrl);
    if (!e.apiKey && !local) throw new AiError('no_key', 'No API key is set. Add your OpenRouter key in Settings.', 400);
    let res;
    try {
      res = await fetch(`${e.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(e.apiKey ? { Authorization: `Bearer ${e.apiKey}` } : {}), 'X-Title': 'LegalAI workspace' },
        body: JSON.stringify({ model: e.model, messages, temperature: 0.2, max_tokens: maxTokens, stream: false }),
        signal: AbortSignal.timeout(180_000)
      });
    } catch (err) {
      throw new AiError('provider_unreachable', err?.name === 'TimeoutError' ? 'The model took too long to answer.' : 'Could not reach the model provider. Check your internet connection and the address in Settings.', 502);
    }
    if (res.status === 401 || res.status === 403) throw new AiError('bad_key', 'The provider rejected the API key. Check it in Settings.', 502);
    if (res.status === 402) throw new AiError('no_credit', 'The provider says this key has no credit left.', 502);
    if (res.status === 429) throw new AiError('rate_limited', 'The provider is rate-limiting this key. Wait a minute and try again.', 502);
    if (!res.ok) {
      let detail = ''; try { detail = String((await res.json())?.error?.message || '').slice(0, 200); } catch { /* not JSON */ }
      throw new AiError('provider_error', `The provider answered ${res.status}${detail ? `: ${detail}` : ''}.`, 502);
    }
    let data; try { data = await res.json(); } catch { throw new AiError('bad_model_output', 'The provider sent something that is not JSON.', 502); }
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new AiError('bad_model_output', 'The model returned an empty answer. Try again, or choose a different model in Settings.', 502);
    return text;
  }

  /* cards for q from the case-law API (Supreme Court only: that is what the citation graph and verifier cover) */
  async function lookup(q) {
    const url = new URL(`${caselawUrl.replace(/\/+$/, '')}/api/caselaw/search`);
    url.searchParams.set('q', q); url.searchParams.set('court', 'SC'); url.searchParams.set('pageSize', '8');
    let res;
    try { res = await fetch(url, { signal: AbortSignal.timeout(25_000) }); }
    catch { throw new AiError('caselaw_down', 'The case-law database is not reachable. Start it (Docker, then the case-law API) and try again.', 503); }
    if (!res.ok) throw new AiError('caselaw_down', `The case-law database answered ${res.status}.`, 503);
    const d = await res.json();
    return Array.isArray(d.results) ? d.results : [];
  }

  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

  async function readBody(req) {
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > MAX_BODY) throw new AiError('too_large', 'That is too much text for one request.', 413); chunks.push(c); }
    try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; }
    catch { throw new AiError('bad_request', 'The request was not valid JSON.', 400); }
  }

  /* returns true when it handled the request */
  return async function handle(req, res, pathname) {
    if (!pathname.startsWith('/api/ai/')) return false;
    try {
      if (!LOCAL_HOST.test(req.headers.host || '')) throw new AiError('forbidden', 'This service only answers on localhost.', 403);
      const origin = req.headers.origin;
      if (origin) { let h = ''; try { h = new URL(origin).host; } catch { /* leave empty */ } if (h !== req.headers.host) throw new AiError('forbidden', 'Cross-site requests are not allowed.', 403); }
      if (req.method === 'POST' && !/^application\/json\b/i.test(req.headers['content-type'] || '')) throw new AiError('bad_request', 'Send JSON.', 415);

      if (pathname === '/api/ai/status' && req.method === 'GET') return send(res, 200, publicStatus()), true;

      if (pathname === '/api/ai/settings' && req.method === 'POST') {
        const b = await readBody(req);
        const cur = readSaved(), next = { ...cur };
        if (b.clear === true) { delete next.apiKey; }
        if (typeof b.apiKey === 'string' && b.apiKey.trim()) {
          const k = b.apiKey.trim();
          if (k.length < 8 || k.length > 300 || /\s/.test(k)) throw new AiError('bad_request', 'That does not look like an API key.');
          next.apiKey = k;
        }
        if (typeof b.model === 'string') { const m = b.model.trim().slice(0, 120); if (m) next.model = m; else delete next.model; }
        if (typeof b.baseUrl === 'string') { const u = b.baseUrl.trim().replace(/\/+$/, ''); if (u) { if (!isSafeBaseUrl(u)) throw new AiError('bad_request', 'The address must start with https:// (or http://localhost for a model on this machine).'); next.baseUrl = u; } else delete next.baseUrl; }
        mkdirSync(settingsDir, { recursive: true });
        if (Object.keys(next).length) writeFileSync(file, JSON.stringify(next, null, 1), { mode: 0o600 });
        else if (existsSync(file)) rmSync(file);
        return send(res, 200, publicStatus()), true;
      }

      if (pathname === '/api/ai/test' && req.method === 'POST') {
        const text = await call([{ role: 'user', content: 'Reply with the single word OK.' }], { maxTokens: 20 });
        return send(res, 200, { ok: true, model: effective().model, reply: text.trim().slice(0, 40) }), true;
      }

      if (pathname === '/api/ai/run' && req.method === 'POST') {
        const now = Date.now();
        while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
        if (stamps.length >= perMinute) throw new AiError('rate_limited', 'Too many requests this minute. Wait a moment.', 429);
        stamps.push(now);
        const b = await readBody(req);
        const action = String(b.action || '');
        if (action === 'citation-check') return send(res, 200, { action, result: await citationReport(b.payload?.text, lookup) }), true;
        if (!Object.hasOwn(ACTIONS, action)) throw new AiError('unknown_action', 'Unknown action.', 404);
        return send(res, 200, { action, model: effective().model, result: await runAction(action, b.payload, { call, lookup }) }), true;
      }
      throw new AiError('not_found', 'Not found.', 404);
    } catch (err) {
      if (err instanceof AiError) return send(res, err.status, { error: err.code, message: err.message }), true;
      console.error('ai route failed:', err?.message);
      return send(res, 500, { error: 'server_error', message: 'Something went wrong on the server.' }), true;
    }
  };
}
