/* API-key auth. Callers send `x-api-key`; we map it to a tenant so every request
   is attributable (for rate limiting, usage metering and billing). */
export function authenticate(req, config) {
  const key = req.headers['x-api-key'];
  if (!key) return { ok: false, status: 401, error: 'missing x-api-key header' };
  const entry = config.apiKeys.get(key);
  if (!entry) return { ok: false, status: 401, error: 'invalid api key' };
  return { ok: true, tenant: entry.tenant, apiKey: key };
}

export function authenticateAdmin(req, config) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== config.adminKey) return { ok: false, status: 401, error: 'admin auth required' };
  return { ok: true };
}
