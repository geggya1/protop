import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE } from './strings.js';
import { buildActiveDicts, buildDicts } from './buildDicts.js';
import { DICTS } from './dicts.generated.js';
import { ACTIVE_LANG_IDS } from './langs.js';

test('dicts.generated.js er bygd fra dagens strings.js (kjør npm run gen:i18n)', () => {
  assert.deepEqual(DICTS, buildActiveDicts(TABLE));
});

test('bare de aktive språkene er med', () => {
  assert.deepEqual(Object.keys(DICTS).sort(), [...ACTIVE_LANG_IDS].sort());
});

test('samme tekster som den gamle oppbyggingen med alle språkene', () => {
  const all = buildDicts(TABLE);
  for (const id of ACTIVE_LANG_IDS) assert.deepEqual(DICTS[id], all[id], id);
});

test('moduleCatalog.generated.js er bygd fra dagens moduleCatalog.js (kjør npm run gen:i18n)', async () => {
  const { MODULE_CATALOG_ACTIVE } = await import('./moduleCatalog.generated.js');
  const { MODULE_CATALOG_I18N, localizeModuleFields, localizeCatalogDefaults } = await import('./moduleCatalog.js');
  const { trimCatalogLangs, makeLocalizers } = await import('./moduleCatalogLocalize.js');
  assert.deepEqual(MODULE_CATALOG_ACTIVE, trimCatalogLangs(MODULE_CATALOG_I18N, ACTIVE_LANG_IDS));
  // Samme tekst ut som med hele katalogen, for alle moduler og begge språk.
  const active = makeLocalizers(MODULE_CATALOG_ACTIVE);
  for (const id of Object.keys(MODULE_CATALOG_I18N.modules)) {
    for (const lang of ACTIVE_LANG_IDS) {
      assert.deepEqual(active.localizeModuleFields({ id }, lang), localizeModuleFields({ id }, lang), `${id}/${lang}`);
    }
  }
  for (const lang of ACTIVE_LANG_IDS) {
    assert.deepEqual(active.localizeCatalogDefaults({}, lang), localizeCatalogDefaults({}, lang));
  }
});
