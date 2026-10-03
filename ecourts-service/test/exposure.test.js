import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exposureProblem } from '../src/config.js';

const cfg = (host, keys, adminKey) => ({ host, apiKeys: new Map(keys.map(k => [k, { tenant: 't' }])), adminKey });

test('the demo keys are fine while the service listens on this machine only', () => {
  for (const host of ['127.0.0.1', '::1', 'localhost']) assert.equal(exposureProblem(cfg(host, ['demo-key-firm-a'], 'demo-admin-key')), null);
});

test('the service refuses to listen on the network with a published demo key', () => {
  assert.match(exposureProblem(cfg('0.0.0.0', ['demo-key-firm-a'], 'a-real-secret')), /demo-key-firm-a/);
  assert.match(exposureProblem(cfg('0.0.0.0', ['a-real-key'], 'demo-admin-key')), /demo-admin-key/);
  assert.match(exposureProblem(cfg('192.168.1.5', ['demo-key-firm-b'], 'x')), /demo-key-firm-b/);
});

test('the service may listen on the network once every key is changed', () => {
  assert.equal(exposureProblem(cfg('0.0.0.0', ['k1', 'k2'], 'secret')), null);
});
