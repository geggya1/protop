import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { OLD_BRAND_PATTERN } from '../src/utils/legacyNames.js';

// Produktnavnet fra før ProTop skal ikke stå i repoet: ikke i filnavn, tekst eller kode.
// Bare src/utils/legacyNames.js kjenner det, og der er det satt sammen av deler.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const hits = [];
for (const file of files) {
  if (OLD_BRAND_PATTERN.test(file)) {
    hits.push(`${file} (filnavn)`);
    continue;
  }
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    continue;
  }
  if (buf.includes(0)) continue;
  buf.toString('utf8').split('\n').forEach((line, i) => {
    if (OLD_BRAND_PATTERN.test(line)) hits.push(`${file}:${i + 1}`);
  });
}
assert.deepEqual(hits, [], `Det gamle produktnavnet står fortsatt her:\n${hits.join('\n')}`);
console.log(`old-brand.test.mjs: ok (${files.length} filer)`);
