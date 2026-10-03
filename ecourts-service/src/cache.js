/* TTL cache with single-flight. Two jobs:
   1. Serve repeat lookups from memory so we don't re-scrape eCourts for every
      request — this is the main thing that keeps you under their rate limiter
      when many customers query the same popular cases.
   2. Single-flight: if 10 requests for the same CNR arrive while one scrape is
      in progress, only ONE scrape runs; the rest await the same promise. */

export class TtlCache {
  constructor({ ttlMs, maxEntries } = {}) {
    this.ttlMs = ttlMs ?? 6 * 60 * 60 * 1000;
    this.maxEntries = maxEntries ?? 5000;
    this.store = new Map();       // key -> { value, expires }
    this.inflight = new Map();    // key -> Promise
    this.hits = 0;
    this.misses = 0;
  }

  _evictIfNeeded() {
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value; // Map preserves insertion order
      this.store.delete(oldest);
    }
  }

  get(key) {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) { this.store.delete(key); return undefined; }
    // refresh recency
    this.store.delete(key);
    this.store.set(key, e);
    return e.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    this.store.set(key, { value, expires: Date.now() + ttlMs });
    this._evictIfNeeded();
  }

  ageMs(key) {
    const e = this.store.get(key);
    return e ? this.ttlMs - (e.expires - Date.now()) : null;
  }

  /* Return cached value if fresh, else run loader() exactly once even under
     concurrent callers. Returns { value, cached, ageMs }. */
  async resolve(key, loader) {
    const cached = this.get(key);
    if (cached !== undefined) { this.hits++; return { value: cached, cached: true, ageMs: this.ageMs(key) }; }

    if (this.inflight.has(key)) {
      const value = await this.inflight.get(key);
      return { value, cached: true, ageMs: 0, coalesced: true };
    }

    this.misses++;
    const promise = (async () => loader())();
    this.inflight.set(key, promise);
    try {
      const value = await promise;
      this.set(key, value);
      return { value, cached: false, ageMs: 0 };
    } finally {
      this.inflight.delete(key);
    }
  }

  stats() {
    return { size: this.store.size, hits: this.hits, misses: this.misses, inflight: this.inflight.size };
  }

  clear() { this.store.clear(); this.inflight.clear(); }
}
