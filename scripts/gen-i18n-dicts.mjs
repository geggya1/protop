/**
 * Lager src/i18n/dicts.generated.js fra oversettelsestabellen (src/i18n/strings.js) og
 * src/i18n/moduleCatalog.generated.js fra modulkatalogen (src/i18n/moduleCatalog.js).
 *
 * Appen trenger bare de aktive språkene (ACTIVE_LANG_IDS i langs.js). Før lastet og bygde
 * den ordbøkene for alle ni språkene ved hver oppstart. Kjør etter endringer i strings.js
 * eller moduleCatalog.js:
 *
 *   npm run gen:i18n
 *
 * src/i18n/dictsGenerated.test.mjs feiler hvis filene ikke stemmer med kildene.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildActiveDicts } from '../src/i18n/buildDicts.js';
import { TABLE } from '../src/i18n/strings.js';
import { MODULE_CATALOG_I18N } from '../src/i18n/moduleCatalog.js';
import { trimCatalogLangs } from '../src/i18n/moduleCatalogLocalize.js';
import { ACTIVE_LANG_IDS } from '../src/i18n/langs.js';

export function renderDictsModule(dicts) {
  return `/* Generert av scripts/gen-i18n-dicts.mjs fra src/i18n/strings.js. Ikke rediger for hånd. */\n`
    + `export const DICTS = ${JSON.stringify(dicts)};\n`;
}

export function renderCatalogModule(catalog) {
  return `/* Generert av scripts/gen-i18n-dicts.mjs fra src/i18n/moduleCatalog.js. Ikke rediger for hånd. */\n`
    + `export const MODULE_CATALOG_ACTIVE = ${JSON.stringify(catalog)};\n`;
}

export function activeCatalog() {
  return trimCatalogLangs(MODULE_CATALOG_I18N, ACTIVE_LANG_IDS);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dicts = new URL('../src/i18n/dicts.generated.js', import.meta.url);
  writeFileSync(dicts, renderDictsModule(buildActiveDicts(TABLE)));
  console.log('Skrev', fileURLToPath(dicts));
  const catalog = new URL('../src/i18n/moduleCatalog.generated.js', import.meta.url);
  writeFileSync(catalog, renderCatalogModule(activeCatalog()));
  console.log('Skrev', fileURLToPath(catalog));
}
