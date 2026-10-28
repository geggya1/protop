/**
 * MENY-01: en vanlig ansatt kunne slå av Kalender og andre moduler for hele bedriften fra
 * Konto → Aktiverte moduler (families/{id}.moduleAccess). Nå endrer den ansatte bare sin egen
 * visning (users/{uid}/modulePrefs/{bedrift}), og endringer for hele bedriften krever samme
 * tilgang som Modulinnstillinger (eier, administrator eller Admin på Modulinnstillinger).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  companyTurnedOff,
  effectiveModuleOn,
  modulePrefsWrite,
  moduleWriteScope,
  personalModuleBlocked,
  readModulePrefs,
} from './modulePrefs.js';
import { activateModuleAccess, deactivateModuleAccess } from './moduleAccess.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const NOW = { nowIso: '2026-10-28T08:00:00.000Z', nowMs: Date.parse('2026-10-28T08:00:00.000Z') };

const on = activateModuleAccess({}, 'plan', { ...NOW, source: 'settings' });
const off = deactivateModuleAccess(on, 'plan', NOW);

test('bedriften styrer, den ansatte kan skjule for seg selv', () => {
  assert.equal(effectiveModuleOn(on, {}, 'plan'), true);
  assert.equal(effectiveModuleOn(on, { plan: 'off' }, 'plan'), false, 'skjult bare for meg');
  assert.equal(effectiveModuleOn({}, {}, 'plan'), false, 'aldri slått på: velkomsten vises');
  assert.equal(effectiveModuleOn({}, { plan: 'on' }, 'plan'), true, 'slått på for meg når bedriften ikke har valgt');
  assert.equal(effectiveModuleOn(off, { plan: 'on' }, 'plan'), false, 'av for hele bedriften går foran mitt valg');
  assert.equal(companyTurnedOff(off.plan), true);
  assert.equal(companyTurnedOff(on.plan), false);
  assert.equal(companyTurnedOff(undefined), false);
  assert.equal(personalModuleBlocked(off, 'plan'), true);
  assert.equal(personalModuleBlocked({}, 'plan'), false);
});

test('eget valg lagres under brukeren, ikke på bedriften', () => {
  assert.deepEqual(readModulePrefs({ modules: { plan: 'off', mail: 'on', x: 'tull' } }), { plan: 'off', mail: 'on' });
  assert.deepEqual(readModulePrefs(null), {});
  const write = modulePrefsWrite({ plan: 'off' }, 'mail', true);
  assert.deepEqual(write.modules, { plan: 'off', mail: 'on' });
  assert.deepEqual(modulePrefsWrite({ plan: 'off' }, 'plan', true).modules, { plan: 'on' });
});

test('hvem endrer for hele bedriften', () => {
  assert.equal(moduleWriteScope({ company: false }), 'company', 'familie og lag: som før');
  assert.equal(moduleWriteScope({ company: true, isAdmin: true }), 'company', 'eier og administrator');
  assert.equal(moduleWriteScope({ company: true, canAdminModules: true }), 'company', 'Admin på Modulinnstillinger');
  assert.equal(moduleWriteScope({ company: true }), 'personal', 'vanlig ansatt: bare egen visning');
  assert.equal(moduleWriteScope({ company: true, canAdminModules: false, isAdmin: false }), 'personal');
});

test('appen: Konto gjelder den ansatte selv, Modulinnstillinger gjelder bedriften', () => {
  const ctx = read('src/context/ModuleAccessContext.jsx');
  assert.match(ctx, /modulePrefsRef\(/, 'eget valg lagres under brukeren');
  assert.match(ctx, /\(scope \|\| defaultScope\) === 'personal'/, 'uten tilgang: bare egen visning');
  const settings = read('components/ModuleActivationSettings.jsx');
  assert.match(settings, /useModuleWriteScope\(/);
  assert.match(settings, /deactivateModule\(mod\.id, \{ scope \}\)/);
  const platform = read('screens/project/ProjectPlatformScreen.jsx');
  assert.match(platform, /<ModuleActivationSettings showCategories=\{false\} scope="company" canEdit=\{companyModules\.canManage\} \/>/);
  const gate = read('components/ModuleActivationGate.jsx');
  assert.match(gate, /useModuleWriteScope\(\)/);
  const rules = read('firestore.rules');
  assert.match(rules, /function moduleAccessOk\(familyId, keys\)/);
  assert.match(rules, /aclRank\(familyId, 'moduleSettings'\) >= 3/);
});
