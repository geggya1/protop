/**
 * Plass i nettleserens lagring. Safari gir rundt 5 MB localStorage, og e-postcachen
 * (hele e-poster) kan fylle den. Da feiler lagring av valg stille, for eksempel
 * bakgrunnsbildet i Tilpass hjem. Cacher som hentes på nytt fra serveren kan
 * ryddes for å gi plass til det personen selv har valgt.
 */

/** Cacher som trygt kan slettes, i rekkefølgen de ryddes. */
export const REGENERABLE_CACHE_PREFIXES = [
  'protop.mailCache.v1.body.',
  'protop.mailCache.v1.',
];

/** Nøklene som skal ryddes: e-posttekster først, så resten av e-postcachen. */
export function cacheKeysToFree(keys = []) {
  const list = Array.isArray(keys) ? keys.filter((k) => typeof k === 'string') : [];
  const picked = [];
  const seen = new Set();
  REGENERABLE_CACHE_PREFIXES.forEach((prefix) => {
    list.forEach((key) => {
      if (!seen.has(key) && key.startsWith(prefix)) {
        seen.add(key);
        picked.push(key);
      }
    });
  });
  return picked;
}

/**
 * setItem som rydder cacher og prøver én gang til når lagringen er full.
 * Returnerer true når verdien ble lagret.
 */
export async function setItemWithRoom(AsyncStorage, key, value) {
  try {
    await AsyncStorage.setItem(key, value);
    return true;
  } catch {
    /* full lagring: rydd og prøv igjen */
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const free = cacheKeysToFree(keys);
    if (!free.length) return false;
    await AsyncStorage.multiRemove(free);
    await AsyncStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
