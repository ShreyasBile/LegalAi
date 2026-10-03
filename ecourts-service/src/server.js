import { createServer } from 'node:http';
import { config, exposureProblem } from './config.js';
import { logger } from './logger.js';
import { createSource } from './sources/index.js';
import { TtlCache } from './cache.js';
import { createUsage } from './usage.js';
import { createApp } from './app.js';

export function buildServer(overrides = {}) {
  const cfg = { ...config, ...overrides };
  const source = overrides.source || createSource(cfg);
  const cache = overrides.cache || new TtlCache(cfg.cache);
  const usage = overrides.usage || createUsage();
  const { requestListener, ...rest } = createApp({ config: cfg, source, cache, usage });
  const server = createServer(requestListener);
  return { server, cfg, source, cache, usage, ...rest };
}

/* Start only when run directly (not when imported by tests). */
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain) {
  const problem = exposureProblem(config);
  if (problem) { logger.alert(problem); process.exit(1); }
  const { server, source } = buildServer();

  // Startup self-check: fail fast & loud if the source can't parse a known case.
  source.selfCheck()
    .then(() => logger.info('source self-check passed', { source: source.name }))
    .catch(err => logger.alert('source self-check FAILED at startup', { source: source.name, err: err.message }));

  server.listen(config.port, config.host, () => {
    logger.info('ecourts-service listening', { port: config.port, source: config.source, tenants: [...config.apiKeys.values()].map(v => v.tenant) });
  });

  const shutdown = sig => { logger.info('shutting down', { sig }); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
