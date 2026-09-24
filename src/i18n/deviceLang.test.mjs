import assert from 'node:assert/strict';
import { mapLanguageCode } from './deviceLang.js';
import { LANG_IDS } from './langs.js';

assert.equal(mapLanguageCode(''), 'nb');
assert.equal(mapLanguageCode('nb-NO'), 'nb');
assert.equal(mapLanguageCode('no'), 'nb');
assert.equal(mapLanguageCode('nn-NO'), 'nb');
assert.equal(mapLanguageCode('en-US'), 'en');
assert.equal(mapLanguageCode('en_GB'), 'en');
assert.equal(mapLanguageCode('da-DK'), 'da');
assert.equal(mapLanguageCode('sv-SE'), 'sv');
assert.equal(mapLanguageCode('fi'), 'fi');
assert.equal(mapLanguageCode('pl-PL'), 'pl');
assert.equal(mapLanguageCode('es-MX'), 'es');
assert.equal(mapLanguageCode('fr-FR'), 'fr');
assert.equal(mapLanguageCode('de-DE'), 'de');
assert.equal(mapLanguageCode('zh-Hans'), 'en');
assert.equal(mapLanguageCode('ja-JP'), 'en');

for (const id of LANG_IDS) {
  assert.equal(mapLanguageCode(id), id);
}
