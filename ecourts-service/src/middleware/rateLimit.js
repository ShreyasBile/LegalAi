/* Fixed-window per-key rate limiter. Protects both the service and — more
   importantly — eCourts, since bursts of uncached lookups are exactly what trips
   their bot detection. In a multi-instance deploy you'd back this with Redis;
   in-memory is correct for a single instance. */
export function createRateLimiter({ perMin, windowMs = 60000 }) {
  const buckets = new Map(); // key -> { count, resetAt }

  function check(key) {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now >= b.resetAt) { b = { count: 0, resetAt: now + windowMs }; buckets.set(key, b); }
    b.count++;
    const remaining = Math.max(0, perMin - b.count);
    if (b.count > perMin) {
      return { ok: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000), limit: perMin };
    }
    return { ok: true, remaining, retryAfterSec: 0, limit: perMin };
  }

  return { check, _buckets: buckets };
}
