/**
 * Lokale kopier med opplysninger om ansatte og bedriften (L-03): ansattregister, HR, fravær,
 * timer, ISO, faktura og egen profil. De fjernes når brukeren logger ut eller en annen bruker
 * logger inn, så neste person på en delt PC (byggebrakke) ikke ser dem.
 * Kopiene er bare cache; skyen er fasit og lastes inn på nytt.
 * Nøklene har ofte selskaps- eller bruker-id som suffiks (prefiks + «.»).
 */
export const PERSONAL_CACHE_PREFIXES = [
  'protop.employees.v1',
  'protop.professionalProfile.v1',
  'protop.hr.v1',
  'protop.absences.v1',
  'protop.absences.window.v1',
  'protop.timeEntries.v1',
  'protop.timeEntries.window.v1',
  'protop.iso.v1',
  'protop.invoices.v1',
  'protop.invoicedStatement.v1',
  'protop.earnings.v1',
  'protop.capacity.v1',
  'protop.mailCache.v1',
  'protop.outlook.graphToken',
];

/** Nøklene som skal bort (eksakt prefiks, eller prefiks fulgt av punktum). */
export function personalCacheKeys(keys = [], prefixes = PERSONAL_CACHE_PREFIXES) {
  return (keys || []).filter((key) => prefixes.some((prefix) => (
    key === prefix || String(key).startsWith(`${prefix}.`)
  )));
}

/** Fjern de lokale kopiene. Feil stopper ikke utloggingen. */
export async function clearPersonalCaches(storage) {
  if (!storage?.getAllKeys) return 0;
  let keys = [];
  try {
    keys = await storage.getAllKeys();
  } catch {
    return 0;
  }
  const stale = personalCacheKeys(keys);
  if (!stale.length) return 0;
  try {
    if (typeof storage.multiRemove === 'function') await storage.multiRemove(stale);
    else await Promise.all(stale.map((key) => storage.removeItem(key)));
  } catch {
    /* rydding er best-effort */
  }
  return stale.length;
}

/**
 * Utlogging eller brukerbytte: lokale kopier og minnet i modulene som holder HR og fravær.
 * Lastes dynamisk, så App.jsx ikke drar inn Firestore-modulene ved oppstart.
 */
export async function clearSessionData() {
  const [{ default: AsyncStorage }, hr, absences, mirror] = await Promise.all([
    import('@react-native-async-storage/async-storage'),
    import('../hr/storage.js').catch(() => null),
    import('../arbeid/absenceStorage.js').catch(() => null),
    import('../access/accessMirror.js').catch(() => null),
  ]);
  try { hr?.clearHrMemory?.(); } catch { /* ignore */ }
  try { absences?.clearAbsenceScopes?.(); } catch { /* ignore */ }
  try { mirror?.forgetAccessMirrors?.(); } catch { /* ignore */ }
  return clearPersonalCaches(AsyncStorage);
}
