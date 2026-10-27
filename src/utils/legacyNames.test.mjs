import assert from 'node:assert/strict';
import {
  LEGACY_SYNTHETIC_DOMAIN,
  OLD_BRAND_PATTERN,
  migrateLegacyAsyncStorage,
  migrateLegacyStorageKeys,
} from './legacyNames.js';
import {
  SYNTHETIC_DOMAIN,
  isSyntheticEmail,
  legacyLoginEmail,
  normalizeUsername,
  stripSyntheticDomain,
  usernameToEmail,
} from './usernamesLogic.js';

const old = OLD_BRAND_PATTERN.source;

function memoryStorage(entries) {
  const map = new Map(entries);
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

// Nettleser: gamle nøkler får ProTop-navnet, nye verdier vinner, andre nøkler røres ikke.
const web = memoryStorage([
  [`${old}.homeLayout.v1.parent.u1`, '{"widgets":[]}'],
  [`${old}_prefer_app`, '1'],
  [`${old}GamePreviewId`, 'g1'],
  [`${old}.lang`, 'en'],
  ['protop.lang', 'nb'],
  ['protop.anbud.v2', 'urørt'],
]);
assert.equal(migrateLegacyStorageKeys(web), 4);
assert.deepEqual(Object.fromEntries(web.map), {
  'protop.homeLayout.v1.parent.u1': '{"widgets":[]}',
  protop_prefer_app: '1',
  protopGamePreviewId: 'g1',
  'protop.lang': 'nb',
  'protop.anbud.v2': 'urørt',
});
assert.equal(migrateLegacyStorageKeys(web), 0);
assert.equal(migrateLegacyStorageKeys(null), 0);

// Full lagring: den gamle nøkkelen blir stående til kopien kan skrives.
const full = memoryStorage([[`${old}.mail.panes`, '[1,2]']]);
full.setItem = () => { throw new Error('QuotaExceededError'); };
assert.equal(migrateLegacyStorageKeys(full), 0);
assert.equal(full.map.get(`${old}.mail.panes`), '[1,2]');

// App (AsyncStorage).
const asyncMap = new Map([[`${old}.familyId`, 'fam1'], [`${old}.companyId`, 'old'], ['protop.companyId', 'ny']]);
const asyncStorage = {
  getAllKeys: async () => [...asyncMap.keys()],
  multiGet: async (keys) => keys.map((key) => [key, asyncMap.has(key) ? asyncMap.get(key) : null]),
  multiSet: async (pairs) => pairs.forEach(([key, value]) => asyncMap.set(key, value)),
  multiRemove: async (keys) => keys.forEach((key) => asyncMap.delete(key)),
};
assert.equal(await migrateLegacyAsyncStorage(asyncStorage), 2);
assert.deepEqual(Object.fromEntries(asyncMap), { 'protop.familyId': 'fam1', 'protop.companyId': 'ny' });

// Brukernavn-kontoer: nye får ProTop-domenet, gamle gjenkjennes og kan logge inn.
assert.equal(SYNTHETIC_DOMAIN, '@konto.protop.no');
assert.equal(usernameToEmail('Katt'), 'katt@konto.protop.no');
assert.equal(isSyntheticEmail('katt@konto.protop.no'), true);
assert.equal(isSyntheticEmail(`katt${LEGACY_SYNTHETIC_DOMAIN}`), true);
assert.equal(isSyntheticEmail('katt@protop.no'), false);
assert.equal(stripSyntheticDomain(`katt${LEGACY_SYNTHETIC_DOMAIN}`), 'katt');
assert.equal(stripSyntheticDomain('katt@konto.protop.no'), 'katt');
assert.equal(stripSyntheticDomain('ada@example.com'), 'ada@example.com');
assert.equal(normalizeUsername(`@Katt${LEGACY_SYNTHETIC_DOMAIN}`), 'katt');
assert.equal(legacyLoginEmail('katt@konto.protop.no'), `katt${LEGACY_SYNTHETIC_DOMAIN}`);
assert.equal(legacyLoginEmail('ada@example.com'), null);

console.log('legacyNames.test.mjs: ok');
