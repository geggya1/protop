/**
 * Language switching: shell labels + module catalog copy for all supported langs.
 */
import assert from 'node:assert/strict';
import { LANG_IDS } from '../i18n/langs.js';
import { TABLE } from '../i18n/strings.js';
import { localizeModuleFields, MODULE_CATALOG_I18N } from '../i18n/moduleCatalog.js';
import { buildShellModules } from '../navigation/shellModules.js';
import { moreSubviewTitle } from '../navigation/shellHeaderTitle.js';
import { resolveModuleHero } from './moduleHero.js';
import catalog from './moduler.catalog.js';

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  parts.forEach((p, i) => {
    if (i === parts.length - 1) cur[p] = value;
    else {
      cur[p] = cur[p] || {};
      cur = cur[p];
    }
  });
}

function getPath(obj, path) {
  return path.split('.').reduce((acc, p) => (acc == null ? acc : acc[p]), obj);
}

function isLeaf(v) {
  return v && typeof v === 'object' && LANG_IDS.some((id) => id in v);
}

function buildDicts(table) {
  const out = Object.fromEntries(LANG_IDS.map((id) => [id, {}]));
  const walk = (node, prefix) => {
    Object.entries(node).forEach(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (isLeaf(v)) {
        LANG_IDS.forEach((id) => setPath(out[id], key, v[id] || v.en || v.nb || key));
      } else if (v && typeof v === 'object') walk(v, key);
    });
  };
  walk(table, '');
  return out;
}

function format(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, a, b) => {
    const k = a || b;
    return vars[k] != null ? String(vars[k]) : match;
  });
}

const DICTS = buildDicts(TABLE);
const tFor = (lang) => (key, vars) => format(getPath(DICTS[lang], key) || getPath(DICTS.en, key) || key, vars);

assert.ok(TABLE.apps?.games?.en, 'apps table merged');
assert.ok(TABLE.shell?.food?.de, 'shell.food de');
assert.ok(TABLE.moreHub?.searchTools?.en, 'moreHub.searchTools');

for (const lang of LANG_IDS) {
  const t = tFor(lang);
  assert.notEqual(t('apps.games'), 'apps.games', `${lang} apps.games resolved`);
  assert.notEqual(t('shell.main'), 'shell.main', `${lang} shell.main resolved`);
  assert.equal(t('shellSub.nToday', { n: 3 }).includes('3'), true, `${lang} nToday interpolates`);

  const mods = buildShellModules({
    t,
    asChild: false,
    asParent: true,
    isSuperAdmin: true,
    familyId: 'fam',
    canImport: true,
    hasKids: true,
    childForSchedule: null,
    firstKid: { id: 'c1' },
  });
  assert.ok(mods.length >= 5, `${lang} shell sections`);
  const flat = mods.flatMap((s) => [s.title, ...s.items.map((i) => i.label)]);
  for (const label of flat) {
    assert.ok(label && !String(label).startsWith('apps.'), `no raw key: ${label}`);
    assert.ok(!String(label).startsWith('shell.'), `no raw key: ${label}`);
  }

  assert.equal(moreSubviewTitle('matcoach', t), t('apps.matcoach'));
  assert.equal(moreSubviewTitle('games', t), t('apps.games'));
}

const nbPlan = localizeModuleFields(catalog.modules.find((m) => m.id === 'plan'), 'nb');
const enPlan = localizeModuleFields(catalog.modules.find((m) => m.id === 'plan'), 'en');
const dePlan = localizeModuleFields(catalog.modules.find((m) => m.id === 'plan'), 'de');
assert.equal(nbPlan.name, 'Kalender');
assert.equal(enPlan.name, 'Calendar');
assert.ok(dePlan.name);
assert.notEqual(dePlan.activationLabel, 'Aktiver Kalender');

assert.equal(Object.keys(MODULE_CATALOG_I18N.modules).length, catalog.modules.length);

const heroNb = resolveModuleHero('shop', 'nb');
const heroEn = resolveModuleHero('shop', 'en');
assert.notEqual(heroEn.title, heroNb.title);

const heroDe = resolveModuleHero('plan', 'de');
assert.ok(heroDe.name);
assert.notEqual(heroDe.name, 'apps.plan');

console.log('i18n language switch coverage ok');
