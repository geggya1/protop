import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeOwnChanges, settingsKey } from './settingsSave.js';

const SAVED = {
  name: 'KS',
  standards: ['ISO9001'],
  ownerName: 'Kari Kvalitet',
  ownerUid: 'q1',
  roleMap: {
    system_owner: { name: 'Kari Kvalitet', uid: 'q1', label: 'Systemansvarlig K-HMS' },
    hse_manager: { name: 'Hege HMS', uid: '', label: 'HMS-leder' },
  },
  docStructure: [],
  profile: null,
  rev: 7,
};

test('settingsKey: feltrekkefølge og systemansvarlig i rollelisten gir ingen endring', () => {
  // Firestore gir feltene tilbake i en annen rekkefølge enn de ble lagret.
  const fromFirestore = {
    ...SAVED,
    roleMap: {
      hse_manager: { label: 'HMS-leder', uid: '', name: 'Hege HMS' },
      system_owner: { label: 'Systemansvarlig K-HMS', uid: 'q1', name: 'Kari Kvalitet' },
    },
  };
  assert.equal(settingsKey(fromFirestore), settingsKey(SAVED));
  // Systemansvarlig settes fra ownerName/ownerUid ved lagring; en annen uid i rollelisten skal ikke gi evig «Lagrer straks».
  const drift = { ...SAVED, roleMap: { ...SAVED.roleMap, system_owner: { name: 'Kari Kvalitet', uid: 'annen', employeeId: 'e1' } } };
  assert.equal(settingsKey(drift), settingsKey(SAVED));
  // En tømt rolle er det samme som en rolle som ikke finnes.
  assert.equal(settingsKey({ ...SAVED, roleMap: { ...SAVED.roleMap, manager: null } }), settingsKey(SAVED));
  // Ekte endringer synes.
  assert.notEqual(settingsKey({ ...SAVED, name: 'KS 2' }), settingsKey(SAVED));
  assert.notEqual(settingsKey({ ...SAVED, ownerUid: 'u3' }), settingsKey(SAVED));
  assert.notEqual(settingsKey({ ...SAVED, roleMap: { ...SAVED.roleMap, hse_manager: { name: 'Hege HMS', uid: 'h1', label: 'HMS-leder' } } }), settingsKey(SAVED));
});

test('mergeOwnChanges: egne endringer legges oppå det som er lagret et annet sted', () => {
  // Brukeren har endret navn og satt prosjektleder; importen har i mellomtiden lagret dokumentstruktur og en rolle.
  const cur = {
    ...SAVED,
    name: 'KS endret',
    roleMap: { ...SAVED.roleMap, project_manager: { name: 'Per Prosjekt', uid: 'p1', label: 'Prosjektleder' } },
  };
  const latest = {
    ...SAVED,
    rev: 8,
    docStructure: [{ code: 'A', title: 'HMSK-system', folders: [] }],
    profile: { about: 'Fra importen' },
    roleMap: { ...SAVED.roleMap, internal_auditor: { name: 'Ivar Revisor', uid: '', label: 'Internrevisor' } },
  };
  const merged = mergeOwnChanges(cur, SAVED, latest);
  assert.equal(merged.name, 'KS endret');
  assert.equal(merged.rev, 8, 'bygger videre på siste lagrede revisjon');
  assert.deepEqual(merged.docStructure, latest.docStructure, 'importens dokumentstruktur beholdes');
  assert.deepEqual(merged.profile, latest.profile);
  assert.equal(merged.roleMap.internal_auditor.name, 'Ivar Revisor', 'rolle satt et annet sted beholdes');
  assert.equal(merged.roleMap.project_manager.uid, 'p1', 'egen rolle legges til');
  assert.equal(merged.roleMap.hse_manager.name, 'Hege HMS');
  // En rolle brukeren tømte, blir tømt også i det flettede.
  const cleared = mergeOwnChanges({ ...SAVED, roleMap: { ...SAVED.roleMap, hse_manager: null } }, SAVED, latest);
  assert.equal(cleared.roleMap.hse_manager, null);
});
