import assert from 'node:assert/strict';
import { mapLanguageCode } from './deviceLang.js';
import { ACTIVE_LANG_IDS, ACTIVE_LANGS, LANG_IDS, activeLanguage } from './langs.js';

assert.equal(mapLanguageCode(''), 'nb');
assert.equal(mapLanguageCode('nb-NO'), 'nb');
assert.equal(mapLanguageCode('no'), 'nb');
assert.equal(mapLanguageCode('nn-NO'), 'nb');
assert.equal(mapLanguageCode('en-US'), 'en');
assert.equal(mapLanguageCode('en_GB'), 'en');
// Skallet er låst til norsk og engelsk til bedriftsmodulene er oversatt (UX-08).
assert.deepEqual(ACTIVE_LANG_IDS, ['nb', 'en']);
assert.deepEqual(ACTIVE_LANGS.map((l) => l.id), ['nb', 'en']);
assert.equal(mapLanguageCode('da-DK'), 'nb', 'dansk leser norsk');
assert.equal(mapLanguageCode('sv-SE'), 'nb', 'svensk leser norsk');
assert.equal(mapLanguageCode('fi'), 'en');
assert.equal(mapLanguageCode('pl-PL'), 'en');
assert.equal(mapLanguageCode('es-MX'), 'en');
assert.equal(mapLanguageCode('fr-FR'), 'en');
assert.equal(mapLanguageCode('de-DE'), 'en');
assert.equal(mapLanguageCode('zh-Hans'), 'en');
assert.equal(mapLanguageCode('ja-JP'), 'en');

// Lagret valg fra før låsen (f.eks. polsk) gir et aktivt språk.
for (const id of LANG_IDS) {
  assert.ok(ACTIVE_LANG_IDS.includes(activeLanguage(id)), id);
  assert.ok(ACTIVE_LANG_IDS.includes(mapLanguageCode(id)), id);
}
assert.equal(activeLanguage('en'), 'en');
assert.equal(activeLanguage('nb'), 'nb');
