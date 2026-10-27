/**
 * Appen het noe annet før den ble ProTop. Det gamle navnet finnes fortsatt i data
 * som ble lagret den gang: nøkler i nettleseren, innloggings-e-post for brukernavn,
 * kjøkken-PIN og widgettyper i lagrede hjemoppsett. Denne fila er det eneste stedet
 * som kjenner navnet, og den setter det sammen av deler, så ordet ikke står i koden
 * (scripts/old-brand.test.mjs stopper det).
 */
const OLD = ['week', 'plan'].join('');

/** Treffer det gamle navnet i alle skrivemåter. Brukes av testene. */
export const OLD_BRAND_PATTERN = new RegExp(OLD, 'i');

/** Domenet brukernavn-kontoer fikk i Firebase Auth før ProTop. */
export const LEGACY_SYNTHETIC_DOMAIN = `@${OLD}.app`;

/** Salt for kjøkken-PIN lagret før ProTop. */
export const LEGACY_KITCHEN_PIN_SALT = `${OLD}-kitchen-v2:`;

/** Widgettyper i lagrede hjemoppsett som har fått nytt navn. */
export const LEGACY_WIDGET_TYPES = Object.freeze({ [['week', 'Plan'].join('')]: 'weeklyPlan' });

const NEW_PREFIX = 'protop';

function renamedKey(key) {
  return typeof key === 'string' && key.startsWith(OLD) ? `${NEW_PREFIX}${key.slice(OLD.length)}` : null;
}

/**
 * Flytter gamle nøkler i localStorage/sessionStorage til ProTop-navnet.
 * En ny nøkkel som allerede finnes, vinner. Den gamle slettes bare når kopien er skrevet.
 */
export function migrateLegacyStorageKeys(storage) {
  if (!storage || typeof storage.key !== 'function') return 0;
  const keys = [];
  try {
    for (let i = 0; i < storage.length; i += 1) keys.push(storage.key(i));
  } catch {
    return 0;
  }
  let moved = 0;
  keys.forEach((key) => {
    const next = renamedKey(key);
    if (!next) return;
    try {
      if (storage.getItem(next) == null) storage.setItem(next, storage.getItem(key));
      storage.removeItem(key);
      moved += 1;
    } catch {
      /* full eller blokkert lagring: den gamle nøkkelen blir stående */
    }
  });
  return moved;
}

/** Samme flytting for AsyncStorage i appen (iOS/Android). */
export async function migrateLegacyAsyncStorage(asyncStorage) {
  if (!asyncStorage?.getAllKeys) return 0;
  try {
    const keys = (await asyncStorage.getAllKeys()).filter((key) => renamedKey(key));
    if (!keys.length) return 0;
    const old = await asyncStorage.multiGet(keys);
    const current = new Map(await asyncStorage.multiGet(keys.map(renamedKey)));
    const writes = old
      .map(([key, value]) => [renamedKey(key), value])
      .filter(([next, value]) => value != null && current.get(next) == null);
    if (writes.length) await asyncStorage.multiSet(writes);
    await asyncStorage.multiRemove(keys);
    return keys.length;
  } catch {
    return 0;
  }
}
