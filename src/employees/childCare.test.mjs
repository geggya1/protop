import assert from 'node:assert/strict';
import {
  childCareSummary, formatBirthDate, kidAge, kidGenderLabel, normalizeChildCare, parseBirthDate, resizeKids, validateChildCare,
} from './childCare.js';
import { childCareQuota } from '../arbeid/sickLeave.js';

assert.equal(parseBirthDate('15.03.2018'), '2018-03-15');
assert.equal(parseBirthDate('5.3.2018'), '2018-03-05');
assert.equal(parseBirthDate('2018-03-15'), '2018-03-15');
assert.equal(parseBirthDate('31.02.2018'), '');
assert.equal(parseBirthDate('mars 2018'), '');
assert.equal(formatBirthDate('2018-03-15'), '15.03.2018');

const care = normalizeChildCare({
  kids: [
    { id: 'a', name: ' Ida ', birthDate: '15.03.2018' },
    { id: 'b', birthDate: '02.09.2010', chronic: true },
    { id: 'c', birthDate: '' },
  ],
  alone: true,
});
assert.equal(care.kids.length, 2, 'barn uten dato lagres ikke');
assert.equal(care.kids[0].birthDate, '2010-09-02', 'eldste først');
assert.equal(care.kids[1].name, 'Ida');

assert.deepEqual(validateChildCare({ kids: [{ birthDate: '15.03.2018' }] }, { today: '2026-11-05' }), []);
assert.ok(validateChildCare({ kids: [{ birthDate: '15.13.2018' }] }, { today: '2026-11-05' })[0].includes('dd.mm.åååå'));
assert.ok(validateChildCare({ kids: [{ birthDate: '01.01.2027' }] }, { today: '2026-11-05' })[0].includes('fram i tid'));

// På ansattposten: bare fødselsår, ikke dato eller navn.
const summary = childCareSummary(care);
assert.deepEqual(summary.birthYears, [2010, 2018]);
assert.deepEqual(summary.chronicBirthYears, [2010]);
assert.equal(summary.alone, true);
assert.ok(!JSON.stringify(summary).includes('Ida') && !JSON.stringify(summary).includes('2018-03-15'));

// Omsorgsdager (ftrl § 9-6): barn til og med året det fyller 12, utvidet rett til og med 18.
{
  const q = childCareQuota(summary, { year: 2026 });
  // Ett barn under 12 (2018) og ett kronisk sykt (2010, 16 år): 10 + 10, doblet alene = 40.
  assert.equal(q.children, 1);
  assert.equal(q.chronic, 1);
  assert.equal(q.total, 40);
  assert.equal(q.registered, true);
  // 2030: 2018-barnet fyller 12 (teller), 2031 ikke.
  assert.equal(childCareQuota({ birthYears: [2018] }, { year: 2030 }).total, 10);
  assert.equal(childCareQuota({ birthYears: [2018] }, { year: 2031 }).unknown, true);
  assert.equal(childCareQuota({ birthYears: [2018] }, { year: 2031 }).registered, true);
  // Tre barn under 12: 15 dager.
  assert.equal(childCareQuota({ birthYears: [2016, 2019, 2022] }, { year: 2026 }).total, 15);
  // Eldre registrering med antall (HR) virker som før.
  assert.equal(childCareQuota({ children: 2, chronic: 0, alone: false }, { year: 2026 }).total, 10);
  assert.equal(childCareQuota({ children: 2 }, { year: 2026 }).registered, false);
}

// Familievinduet: antall barn styrer radene, kjønn er valgfritt og lagres med barnet.
{
  const two = resizeKids([], 2);
  assert.equal(two.length, 2);
  assert.notEqual(two[0].id, two[1].id);
  assert.deepEqual(resizeKids([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 1).map((k) => k.id), ['a']);
  assert.equal(resizeKids([], -3).length, 0);
  assert.equal(resizeKids([], 40).length, 12);
  const care = normalizeChildCare({ kids: [{ birthDate: '2019-12-24', gender: 'jente' }, { birthDate: '2020-01-01', gender: 'x' }] });
  assert.equal(care.kids[0].gender, 'jente');
  assert.equal(care.kids[1].gender, '');
  assert.equal(kidGenderLabel('gutt'), 'Gutt');
  assert.equal(kidGenderLabel(''), '');
  assert.equal(kidAge('2019-12-24', '2026-11-06'), 6);
  assert.equal(kidAge('2019-11-06', '2026-11-06'), 7);
  assert.equal(kidAge('', '2026-11-06'), null);
  // Kjønnet kommer ikke på ansattposten: bare fødselsår.
  assert.equal(JSON.stringify(childCareSummary(care)).includes('jente'), false);
}

console.log('childCare ok');
