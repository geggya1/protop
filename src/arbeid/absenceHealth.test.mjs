import assert from 'node:assert/strict';
import { HEALTH_FREE_TEXT_NOTICE, isHealthAbsence } from './absenceCatalog.js';

// Sykdom og legebesøk er helseopplysninger: fritekst får en advarsel mot diagnose (L-16).
for (const id of ['egenmelding', 'syk_melding', 'syk_uten', 'sykt_barn', 'sykdom', 'lege_med', 'lege_uten']) {
  assert.equal(isHealthAbsence(id), true, id);
}
for (const id of ['ferie', 'avspasering', 'foreldre', 'permittert', 'seminar_med', '']) {
  assert.equal(isHealthAbsence(id), false, id);
}

// Typer bedriften har laget selv: kategorien Sykdom eller navn med «lege»/«syk».
const catalog = [
  { id: 'egen1', label: 'Fysioterapi', category: 'Sykdom' },
  { id: 'egen2', label: 'Tannlegetime', category: 'Annet fravær' },
  { id: 'egen3', label: 'Kurs', category: 'Permisjon' },
];
assert.equal(isHealthAbsence('egen1', catalog), true);
assert.equal(isHealthAbsence('egen2', catalog), true);
assert.equal(isHealthAbsence('egen3', catalog), false);

assert.match(HEALTH_FREE_TEXT_NOTICE, /diagnose/);

console.log('absenceHealth.test.mjs: ok');
