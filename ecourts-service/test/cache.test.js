import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../src/cache.js';

test('miss then hit; loader runs once', async () => {
  const cache = new TtlCache({ ttlMs: 1000 });
  let calls = 0;
  const load = async () => { calls++; return { v: 1 }; };
  const a = await cache.resolve('k', load);
  const b = await cache.resolve('k', load);
  assert.equal(a.cached, false);
  assert.equal(b.cached, true);
  assert.equal(calls, 1);
});

test('single-flight: concurrent callers trigger one load', async () => {
  const cache = new TtlCache({ ttlMs: 1000 });
  let calls = 0;
  const load = async () => { calls++; await new Promise(r => setTimeout(r, 30)); return calls; };
  const [a, b, c] = await Promise.all([cache.resolve('x', load), cache.resolve('x', load), cache.resolve('x', load)]);
  assert.equal(calls, 1);
  assert.deepEqual([a.value, b.value, c.value], [1, 1, 1]);
});

test('entries expire after TTL', async () => {
  const cache = new TtlCache({ ttlMs: 20 });
  await cache.resolve('k', async () => 42);
  assert.equal(cache.get('k'), 42);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(cache.get('k'), undefined);
});

test('respects maxEntries (evicts oldest)', async () => {
  const cache = new TtlCache({ ttlMs: 10000, maxEntries: 2 });
  cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
  assert.equal(cache.get('a'), undefined); // evicted
  assert.equal(cache.get('c'), 3);
});

test('stats track hits and misses', async () => {
  const cache = new TtlCache({ ttlMs: 1000 });
  await cache.resolve('k', async () => 1); // miss
  await cache.resolve('k', async () => 1); // hit
  const s = cache.stats();
  assert.equal(s.hits, 1);
  assert.equal(s.misses, 1);
});
