/**
 * Fjerner gamle nettleserkopier som kan inneholde et annet selskaps data.
 * Kopiene er bare cache. Skyen er fasit og lastes inn på nytt.
 */
const done = new Set();

export async function dropRetiredLocalKeys(storage, prefixes = []) {
  const wanted = (prefixes || []).filter((prefix) => prefix && !done.has(prefix));
  if (!storage || !wanted.length) return 0;
  wanted.forEach((prefix) => done.add(prefix));
  let keys = [];
  try {
    keys = await storage.getAllKeys();
  } catch {
    return 0;
  }
  const stale = (keys || []).filter((key) => wanted.some((prefix) => (
    key === prefix || String(key).startsWith(`${prefix}.`)
  )));
  if (!stale.length) return 0;
  try {
    if (typeof storage.multiRemove === 'function') await storage.multiRemove(stale);
    else await Promise.all(stale.map((key) => storage.removeItem(key)));
  } catch {
    /* rydding er valgfri — nøklene leses ikke lenger */
  }
  return stale.length;
}
