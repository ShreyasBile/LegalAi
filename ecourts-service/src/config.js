import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* Minimal .env loader — avoids a dotenv dependency. Values already in the real
   environment win over the file, so container/CI env vars are never clobbered. */
function loadDotEnv() {
  const path = join(root, '.env');
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip an inline comment that follows whitespace (but keep '#' inside quotes/values)
    const hash = val.indexOf(' #');
    if (hash !== -1) val = val.slice(0, hash).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/* API_KEYS = "key1:Tenant One,key2:Tenant Two" -> Map<key, {tenant}> */
function parseApiKeys(raw) {
  const map = new Map();
  for (const pair of (raw || '').split(',')) {
    const t = pair.trim();
    if (!t) continue;
    const idx = t.indexOf(':');
    if (idx === -1) { map.set(t, { tenant: t }); continue; }
    const key = t.slice(0, idx).trim();
    const tenant = t.slice(idx + 1).trim() || key;
    if (key) map.set(key, { tenant });
  }
  return map;
}

/* The keys that ship in the README, .env.example and the sample workspace. */
const DEMO_KEYS = new Set(['demo-key-firm-a', 'demo-key-firm-b', 'demo-admin-key']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/* Returns a message when the service would listen beyond this machine while still accepting a published demo key, else null. */
export function exposureProblem(cfg) {
  if (LOOPBACK_HOSTS.has(cfg.host)) return null;
  const demo = [...cfg.apiKeys.keys(), cfg.adminKey].filter(k => DEMO_KEYS.has(k));
  if (!demo.length) return null;
  return `refusing to listen on ${cfg.host} with the published demo key(s) ${[...new Set(demo)].join(', ')}: set API_KEYS and ADMIN_KEY, or leave HOST at 127.0.0.1`;
}

export const config = {
  root,
  port: num(process.env.PORT, 8080),
  host: process.env.HOST || '127.0.0.1',            // this machine only; set HOST=0.0.0.0 to expose the service on your network
  logLevel: process.env.LOG_LEVEL || 'info',
  source: process.env.ECOURTS_SOURCE || 'fixture',
  apiKeys: parseApiKeys(process.env.API_KEYS || 'demo-key-firm-a:Kamat & Partners'),
  adminKey: process.env.ADMIN_KEY || 'demo-admin-key',
  cache: {
    ttlMs: num(process.env.CACHE_TTL_MS, 6 * 60 * 60 * 1000),
    maxEntries: num(process.env.CACHE_MAX_ENTRIES, 5000)
  },
  rateLimitPerMin: num(process.env.RATE_LIMIT_PER_MIN, 30),
  live: {
    baseUrl: process.env.ECOURTS_BASE_URL || 'https://services.ecourts.gov.in/ecourtindia_v6',
    timeoutMs: num(process.env.SCRAPE_TIMEOUT_MS, 30000),
    headless: (process.env.SCRAPE_HEADLESS || 'true') !== 'false',
    captchaStrategy: process.env.CAPTCHA_STRATEGY || 'none',
    twoCaptchaKey: process.env.TWOCAPTCHA_API_KEY || ''
  }
};
