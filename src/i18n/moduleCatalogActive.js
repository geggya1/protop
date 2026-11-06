/**
 * Modulkatalogen for de aktive språkene (nb og en). Teksten er generert fra moduleCatalog.js
 * med `npm run gen:i18n`, så appen slipper å laste alle ni språkene.
 */
import { MODULE_CATALOG_ACTIVE } from './moduleCatalog.generated.js';
import { makeLocalizers } from './moduleCatalogLocalize.js';

export const { localizeModuleFields, localizeCatalogDefaults } = makeLocalizers(MODULE_CATALOG_ACTIVE);
