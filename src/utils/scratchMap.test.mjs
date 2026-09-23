import assert from 'node:assert/strict';
import { WORLD_COUNTRIES, searchCountries, COUNTRY_BY_CODE } from './worldCountries.js';
import {
  buildScratchStats, periodLabel, PERIODS, assertValidVisitInput, visitPlaceKey,
  visitYearLabel,
} from './scratchMapLogic.js';
import { mapPlacesForCountry } from './worldMapPaths.js';

assert.ok(WORLD_COUNTRIES.length >= 190, 'forventer minst 190 land');
assert.equal(COUNTRY_BY_CODE.NO?.name, 'Norge');
assert.ok(searchCountries('norge').some((c) => c.code === 'NO'));
assert.ok(PERIODS.some((p) => p.id === 'summer'));

const frPlaces = mapPlacesForCountry('FR');
assert.ok(frPlaces.length >= 2, 'Frankrike skal ha flere områder');
assert.ok(frPlaces.some((p) => /Guyana|Korsika|hovedland/i.test(p.label || '')));

assert.throws(
  () => assertValidVisitInput({ countryCode: 'FR', year: 2020, period: 'summer' }),
  /område/i,
);
const frOk = assertValidVisitInput({
  countryCode: 'FR', year: 2020, period: 'summer', placeKey: 'FR:1',
});
assert.equal(frOk.placeKey, 'FR:1');

const visits = [
  { countryCode: 'FR', partId: 0, placeKey: 'FR:0', year: 2022, period: 'summer', memberIds: ['a'] },
  { countryCode: 'FR', partId: 1, placeKey: 'FR:1', year: 2023, period: 'winter', memberIds: ['a'] },
  { countryCode: 'ES', year: 2023, period: 'spring', memberIds: ['b'] },
];
const all = buildScratchStats(visits);
assert.equal(all.visitedCount, 2);
assert.equal(all.visitedPlaceCount, 3);
assert.ok(all.visitedPlaceKeys.has('FR:0'));
assert.ok(all.visitedPlaceKeys.has('FR:1'));
assert.equal(visitPlaceKey({ countryCode: 'NO', partId: 1 }), 'NO:1');
assert.equal(periodLabel({ period: 'summer', periodNote: 'juli' }), 'Sommer · juli');
assert.equal(visitYearLabel({ year: 2020 }), '2020');
assert.equal(visitYearLabel({ year: null }), 'Ukjent år');

const noYear = assertValidVisitInput({
  countryCode: 'ES', skipYear: true, period: 'summer',
});
assert.equal(noYear.year, null);

assert.throws(
  () => assertValidVisitInput({ countryCode: 'ES', period: 'summer' }),
  /år/i,
);

console.log('scratchMap.test.mjs ok');
