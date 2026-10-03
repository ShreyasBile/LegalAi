# ecourts-service

A small, self-contained microservice that turns an Indian **eCourts** case lookup into a clean JSON API. The LegalAI frontend (and any number of other customers) call **this** service instead of scraping eCourts themselves — the hard, fragile, rate-limited part lives here, once.

```
frontend / customers ──HTTP──▶ ecourts-service ──▶ [ cache ] ──▶ source ──▶ eCourts
                                                       │             (fixture | live+Playwright)
                                                       └── shared HTML parser + shape validation
```

## Why it exists

There is **no clean official eCourts REST API**. Real products get this data by driving the public portal (which sits behind a CAPTCHA) and reselling the result. This service is that layer, built so the fragile scraping concern is isolated, cached, metered, and monitored — and so that when eCourts changes their markup you find out from a **red CI build**, not a lawyer whose hearing date vanished.

## Run it

```bash
cd ecourts-service
cp .env.example .env
npm start            # boots on :8080 in fixture mode (no dependencies needed)
```

```bash
curl -H "x-api-key: demo-key-firm-a" \
  http://localhost:8080/api/case-status/MHCC01-001234-2026
```

Zero npm install required for fixture mode, the tests, or CI — it runs on plain Node ≥ 20. Playwright is only needed for live mode and is an *optional* dependency.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | — | Service info |
| GET | `/health` | — | Liveness |
| GET | `/health/source` | — | **Readiness / drift check** — parses a known case and 503s if the parser degraded |
| GET | `/api/case-status/:cnr` | `x-api-key` | The lookup. CNR may be hyphenated. |
| GET | `/admin/usage` | `x-admin-key` | Per-tenant usage + cache stats |

Response codes: `200` found · `404` valid CNR but no record · `400` malformed CNR · `429` rate-limited · `502` upstream unavailable / CAPTCHA failed / **markup drift** · `503` source degraded (health).

## The features that make it production-shaped

- **Adapter-isolated sources** — the app only sees `{ fetchCase, selfCheck }`. `fixture` (deterministic, used in tests/CI) and `live` (Playwright) both hand HTML to the **same parser**, so fixture tests validate the real scraping path.
- **Markup-drift tripwires** — the parser throws on structural drift instead of returning half-empty data; `npm run drift-check` fails CI the moment a fixture stops parsing; `/health/source` catches it at runtime and logs an **alert**.
- **Response-shape validation** — every response is schema-checked *before* it's cached or returned, so a half-broken parser can never poison the cache or ship garbage.
- **Aggressive caching + single-flight** — repeat lookups are served from memory (TTL), and concurrent lookups for the same CNR collapse into one upstream fetch. This is what keeps you under eCourts' bot detection at scale.
- **Multi-tenant API keys + per-key rate limiting + usage metering** — built for reselling from day one.
- **Pluggable CAPTCHA** — `none` / `manual` / `twocaptcha`, switched by one env var.
- **Structured logging with an `alert` channel** — wire it to Slack/PagerDuty in prod.

## Testing

```bash
npm test           # 80 unit + end-to-end tests (node:test, no deps)
npm run smoke      # human-readable end-to-end walkthrough over real HTTP
npm run drift-check# CI tripwire: fail if a real-case fixture stops parsing
```

Scenarios covered: CNR validation, active/disposed/not-found parsing, markup-drift detection, shape validation, cache hit/miss + TTL + single-flight, auth (missing/bad key), rate limiting, admin auth, health/readiness, and every HTTP status path.

## Going live (real eCourts)

1. `npm i playwright && npx playwright install chromium`
2. In `.env`: `ECOURTS_SOURCE=live`, and `CAPTCHA_STRATEGY=twocaptcha` + `TWOCAPTCHA_API_KEY=…` (or `manual` for a demo).
3. Update the CSS selectors in [`src/sources/liveSource.js`](src/sources/liveSource.js) if eCourts' DOM has changed — the fixture drift test tells you when.

Everything else — API, cache, rate limiting, health, the parser — is identical between fixture and live.

## Security note

The `x-api-key` model is **server-to-server**: your customers' backends hold the key and call this service. A browser frontend should call *its own* backend, which then calls this service — never ship the key to the browser. (The LegalAI prototype calls it directly from the browser with a demo key purely for local demonstration.)
