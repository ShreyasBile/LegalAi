import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCaseStatus } from './parser.js';
import { SourceUnavailableError } from '../errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', 'fixtures');

/* Deterministic source backed by bundled HTML fixtures. It models the real flow
   exactly — "get some HTML for this CNR, then hand it to the shared parser" —
   without a browser or network, so it's what the tests, CI and local dev use.
   Certain CNRs are wired to special fixtures so we can exercise every path
   (active, disposed, not-found, markup drift, upstream outage) end-to-end. */

const CNR_TO_FIXTURE = {
  MHCC010012342026: 'case-active.html',
  DLHC050132072026: 'case-disposed.html',
  MHCC019999992026: 'case-drifted.html'   // simulates an eCourts markup change
};
const OUTAGE_CNR = 'MHER000000002026';     // simulates eCourts being unreachable

function readFixture(name) {
  const path = join(fixturesDir, name);
  if (!existsSync(path)) throw new SourceUnavailableError(`fixture missing: ${name}`);
  return readFileSync(path, 'utf8');
}

export function createFixtureSource({ latencyMs = 0 } = {}) {
  return {
    name: 'fixture',

    async fetchCase(cnr) {
      if (latencyMs) await new Promise(r => setTimeout(r, latencyMs));
      if (cnr === OUTAGE_CNR) {
        throw new SourceUnavailableError('eCourts portal did not respond (simulated outage)', { cnr });
      }
      const fixture = CNR_TO_FIXTURE[cnr] || 'case-notfound.html';
      const html = readFixture(fixture);
      return parseCaseStatus(html); // may return {found:false} or throw ParseError (drift)
    },

    /* Health self-check: parse a known-good fixture and confirm the anchor field
       survives. If eCourts markup drifts and the parser silently degrades, this
       is what turns red in /health/source before any customer notices. */
    async selfCheck() {
      const html = readFixture('case-active.html');
      const parsed = parseCaseStatus(html);
      if (!parsed.found || parsed.cnr !== 'MHCC010012342026') {
        throw new Error('self-check parse mismatch');
      }
      return true;
    }
  };
}
