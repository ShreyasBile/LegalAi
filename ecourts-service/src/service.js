import { validateCnr } from './cnr.js';
import { validateCaseStatus } from './schema.js';
import { ValidationError, ParseError } from './errors.js';
import { logger } from './logger.js';

/* Orchestrates a single lookup: validate CNR -> cache/single-flight -> source
   fetch -> response-shape validation. This is source-agnostic and cache-agnostic
   (both injected), which is what makes it unit-testable and swappable. */
export function createCaseStatusService({ source, cache }) {
  async function getCaseStatus(rawCnr) {
    const v = validateCnr(rawCnr);
    if (!v.ok) throw new ValidationError(`invalid CNR: ${v.reason}`, { reason: v.reason, detail: v.detail });
    const cnr = v.cnr;

    const { value, cached, ageMs, coalesced } = await cache.resolve(cnr, async () => {
      const parsed = await source.fetchCase(cnr);

      // Shape-check BEFORE caching, so a parser regression can never poison the cache.
      const shape = validateCaseStatus(parsed);
      if (!shape.ok) {
        logger.alert('response failed shape validation — possible parser/markup drift', { cnr, source: source.name, errors: shape.errors });
        throw new ParseError('response failed shape validation', { errors: shape.errors });
      }
      return parsed;
    });

    return {
      ...value,
      cnr: value.found === false ? cnr : value.cnr,
      meta: { source: source.name, cached: !!cached, cacheAgeMs: cached ? Math.max(0, Math.round(ageMs || 0)) : 0, coalesced: !!coalesced, fetchedAt: new Date().toISOString() }
    };
  }

  return { getCaseStatus };
}
