/* CI tripwire. Parses every "real case" fixture and asserts the anchor fields
   still come through. If eCourts changes markup and someone refreshes the
   fixtures from the live site without updating the parser, THIS fails in CI —
   so you find out from a red build, not from a lawyer whose hearing date vanished.
   Run: npm run drift-check   (exit code 1 on drift) */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCaseStatus } from '../src/sources/parser.js';
import { validateCaseStatus } from '../src/schema.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fx = name => readFileSync(join(dir, '..', 'fixtures', name), 'utf8');

const expectFound = ['case-active.html', 'case-disposed.html'];
let failed = 0;

for (const name of expectFound) {
  try {
    const parsed = parseCaseStatus(fx(name));
    const shape = validateCaseStatus(parsed);
    if (!parsed.found) throw new Error('expected found:true');
    if (!shape.ok) throw new Error('shape errors: ' + shape.errors.join('; '));
    console.log(`  ok    ${name}  -> ${parsed.cnr} (${parsed.caseType})`);
  } catch (e) {
    failed++;
    console.error(`  DRIFT ${name}  -> ${e.message}`);
  }
}

if (failed) { console.error(`\n  ${failed} fixture(s) drifted — parser needs updating.\n`); process.exit(1); }
console.log('\n  No drift detected. Parser matches all fixtures.\n');
