import { authenticate, authenticateAdmin } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { createCaseStatusService } from './service.js';
import { ValidationError, SourceUnavailableError, CaptchaError, ParseError } from './errors.js';
import { logger } from './logger.js';
import { COURT_HIERARCHY } from './data/courts.js';
import { SEARCH_MODES } from './search.js';

const VERSION = '1.0.0';

/* Builds the HTTP request listener with all dependencies injected, so tests can
   assemble it with a fixture source and tiny limits and drive it over real HTTP. */
export function createApp({ config, source, cache, usage }) {
  const service = createCaseStatusService({ source, cache });
  const limiter = createRateLimiter({ perMin: config.rateLimitPerMin });
  const startedAt = Date.now();

  function sendJson(res, status, body, extra = {}) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'x-api-key, x-admin-key, content-type',
      'access-control-allow-methods': 'GET, OPTIONS',
      'cache-control': 'no-store',
      ...extra
    });
    res.end(payload);
  }

  async function handleCaseStatus(req, res, cnrParam) {
    const auth = authenticate(req, config);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });

    const rl = limiter.check(auth.apiKey);
    const rlHeaders = { 'x-ratelimit-limit': String(rl.limit), 'x-ratelimit-remaining': String(rl.remaining) };
    if (!rl.ok) {
      usage.record({ tenant: auth.tenant, error: true });
      return sendJson(res, 429, { error: 'rate limit exceeded', retryAfterSec: rl.retryAfterSec }, { ...rlHeaders, 'retry-after': String(rl.retryAfterSec) });
    }

    try {
      const result = await service.getCaseStatus(cnrParam);
      if (result.found === false) {
        usage.record({ tenant: auth.tenant, cached: result.meta.cached });
        return sendJson(res, 404, { found: false, cnr: result.cnr, reason: result.reason || 'not_found', meta: result.meta }, rlHeaders);
      }
      usage.record({ tenant: auth.tenant, cached: result.meta.cached });
      logger.info('case-status served', { tenant: auth.tenant, cnr: result.cnr, cached: result.meta.cached, source: source.name });
      return sendJson(res, 200, result, rlHeaders);
    } catch (err) {
      usage.record({ tenant: auth.tenant, error: true });
      return sendError(res, err, { tenant: auth.tenant, cnr: cnrParam }, rlHeaders);
    }
  }

  function sendError(res, err, ctx, extra = {}) {
    if (err instanceof ValidationError) return sendJson(res, 400, { error: err.message, detail: err.detail }, extra);
    if (err instanceof CaptchaError) { logger.error('captcha failure', { ...ctx, err: err.message }); return sendJson(res, 502, { error: 'captcha_failed', detail: err.message }, extra); }
    if (err instanceof SourceUnavailableError) { logger.error('source unavailable', { ...ctx, err: err.message }); return sendJson(res, 502, { error: 'upstream_unavailable', detail: err.message }, extra); }
    if (err instanceof ParseError) { logger.alert('parse failure serving request', { ...ctx, err: err.message, detail: err.detail }); return sendJson(res, 502, { error: 'upstream_format_error', detail: err.message }, extra); }
    logger.error('unhandled error', { ...ctx, err: err?.message, stack: err?.stack });
    return sendJson(res, 500, { error: 'internal_error' }, extra);
  }

  /* Unified non-CNR search dispatcher: /api/search?mode=party&name=...&state=...
     One endpoint, one auth/rate-limit/usage path, mode picks the pure search fn.
     Results are summaries — the client fetches full detail per-CNR via the
     existing /api/case-status/:cnr endpoint, so there's exactly one place that
     ever returns a full case record. */
  async function handleSearch(req, res, url) {
    const auth = authenticate(req, config);
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.error });

    const rl = limiter.check(auth.apiKey);
    const rlHeaders = { 'x-ratelimit-limit': String(rl.limit), 'x-ratelimit-remaining': String(rl.remaining) };
    if (!rl.ok) {
      usage.record({ tenant: auth.tenant, error: true });
      return sendJson(res, 429, { error: 'rate limit exceeded', retryAfterSec: rl.retryAfterSec }, { ...rlHeaders, 'retry-after': String(rl.retryAfterSec) });
    }

    const mode = url.searchParams.get('mode');
    const entry = SEARCH_MODES[mode];
    if (!entry) {
      usage.record({ tenant: auth.tenant, error: true });
      return sendJson(res, 400, { error: `unknown or missing mode — expected one of: ${Object.keys(SEARCH_MODES).join(', ')}` }, rlHeaders);
    }

    const params = Object.fromEntries(url.searchParams.entries());
    try {
      const results = entry.fn(params);
      usage.record({ tenant: auth.tenant, cached: false });
      logger.info('search served', { tenant: auth.tenant, mode, count: results.length });
      return sendJson(res, 200, { mode, count: results.length, results }, rlHeaders);
    } catch (err) {
      usage.record({ tenant: auth.tenant, error: true });
      return sendError(res, err, { tenant: auth.tenant, mode }, rlHeaders);
    }
  }

  async function handleHealthSource(res) {
    try {
      await source.selfCheck();
      return sendJson(res, 200, { status: 'ok', source: source.name, check: 'parser+source self-test passed' });
    } catch (err) {
      logger.alert('source health check FAILED — markup drift or source outage', { source: source.name, err: err.message });
      return sendJson(res, 503, { status: 'degraded', source: source.name, error: err.message });
    }
  }

  const requestListener = async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return sendJson(res, 400, { error: 'bad url' }); }
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'OPTIONS') return sendJson(res, 204, {});
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });

    if (path === '/') return sendJson(res, 200, { service: 'ecourts-service', version: VERSION, source: source.name, endpoints: ['/health', '/health/source', '/api/courts', '/api/case-status/:cnr', '/api/search?mode=...', '/admin/usage'], searchModes: Object.keys(SEARCH_MODES) });
    if (path === '/health') return sendJson(res, 200, { status: 'ok', version: VERSION, source: source.name, uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
    if (path === '/health/source') return handleHealthSource(res);
    if (path === '/api/courts') return sendJson(res, 200, { hierarchy: COURT_HIERARCHY });
    if (path === '/api/search') return handleSearch(req, res, url);

    const caseMatch = path.match(/^\/api\/case-status\/([^/]+)$/);
    if (caseMatch) {
      let cnr;
      try { cnr = decodeURIComponent(caseMatch[1]); } catch { return sendJson(res, 400, { error: 'bad url' }); }   // e.g. /%E0%A4
      return handleCaseStatus(req, res, cnr);
    }

    if (path === '/admin/usage') {
      const admin = authenticateAdmin(req, config);
      if (!admin.ok) return sendJson(res, admin.status, { error: admin.error });
      return sendJson(res, 200, { usage: usage.snapshot(), cache: cache.stats(), rateLimitPerMin: config.rateLimitPerMin });
    }

    return sendJson(res, 404, { error: 'not found', path });
  };

  return { requestListener, service, limiter, version: VERSION };
}
