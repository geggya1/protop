import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accessHeadcount } from './accessHeadcount.js';

const person = (id, levels, extra = {}) => ({
  id,
  company: { accessLevels: levels, accessLevel: levels[levels.length - 1] || '', status: 'active', ...extra },
});

const sum = accessHeadcount([
  person('kari', ['hr_ansvarlig', 'ansatt']),
  person('ola', ['ansatt']),
  person('per', ['ansatt'], { status: 'inactive' }),
  person('slettet', ['ansatt'], { status: 'deleted' }),
  person('anders', ['avdelingsleder', 'leder']),
  person('regn', ['regnskap_ekstern']),
  person('inn1', ['innleie_ekstern']),
  person('inn2', ['innleie_ekstern']),
  person('avd', ['ansatt_andre_avdelinger']),
  { id: 'ny', company: { status: 'active' } },
]);

// Aktive med tilgang: 4 ansatte (én ikke plassert) og 4 eksterne. Deaktiverte og slettede telles ikke.
assert.deepEqual(sum.total, { staff: 4, external: 4, total: 8 });
assert.equal(sum.deactivated, 1);
assert.deepEqual(sum.unplaced, { staff: 1, external: 0, total: 1 });

const level = (id) => sum.sections.flatMap((section) => section.levels).find((row) => row.id === id);
assert.deepEqual(sum.sections.map((section) => section.id), ['company', 'specialist', 'external']);
assert.equal(level('ansatt').total, 2);
assert.equal(level('leder').total, 1);
assert.equal(level('avdelingsleder').total, 0);
// Fagansvar telles i sin gruppe i tillegg til nivået.
assert.equal(level('hr_ansvarlig').total, 1);
assert.deepEqual({ staff: level('innleie_ekstern').staff, external: level('innleie_ekstern').external }, { staff: 0, external: 2 });
assert.equal(level('regnskap_ekstern').external, 1);
assert.equal(level('ansatt_andre_avdelinger').external, 1);

// Oversikten står øverst i Tilgangsstyring, over Nivåer og Personer.
const page = readFileSync(new URL('../../components/project/CompanyAccessSettings.jsx', import.meta.url), 'utf8');
const top = page.indexOf('<AccessHeadcount employees={employees}');
assert.ok(top > 0);
assert.ok(top < page.indexOf("[['levels', 'Nivåer'], ['people', 'Personer']]"));

console.log('accessHeadcount.test.mjs: ok');
