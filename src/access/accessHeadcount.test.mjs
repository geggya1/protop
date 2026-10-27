import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sectionHeadcounts } from './accessHeadcount.js';

const person = (id, levels, extra = {}) => ({
  id,
  company: { accessLevels: levels, accessLevel: levels[levels.length - 1] || '', status: 'active', ...extra },
});

// Aktive med tilgang per gruppe. Deaktiverte og slettede telles ikke.
assert.deepEqual(sectionHeadcounts([
  person('kari', ['hr_ansvarlig', 'ansatt']),
  person('ola', ['ansatt']),
  person('per', ['ansatt'], { status: 'inactive' }),
  person('slettet', ['ansatt'], { status: 'deleted' }),
  person('anders', ['avdelingsleder', 'leder']),
  person('regn', ['regnskap_ekstern']),
  person('inn1', ['innleie_ekstern']),
  person('inn2', ['innleie_ekstern']),
  person('avd', ['ansatt_andre_avdelinger']),
]), { company: 3, specialist: 1, external: 4 });
assert.deepEqual(sectionHeadcounts([]), { company: 0, specialist: 0, external: 0 });

// Bare et tall i overskriften, ingen egen oversikt over siden.
const page = readFileSync(new URL('../../components/project/CompanyAccessSettings.jsx', import.meta.url), 'utf8');
assert.match(page, /\(\$\{sectionCounts\[section\.id\] \|\| 0\}\)/);
assert.equal(/AccessHeadcount|company-access-headcount/.test(page), false);

console.log('accessHeadcount.test.mjs: ok');
