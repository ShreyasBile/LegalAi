import { createFixtureSource } from './fixtureSource.js';
import { createLiveSource } from './liveSource.js';

/* Source factory. The rest of the app only ever sees the { name, fetchCase,
   selfCheck } interface, so swapping fixture <-> live is a one-line config change
   and nothing downstream knows the difference. */
export function createSource(config) {
  if (config.source === 'live') return createLiveSource(config.live);
  return createFixtureSource();
}
