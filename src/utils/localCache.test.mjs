import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clearPersonalCaches, personalCacheKeys } from './localCache.js';

test('ansatt-, HR-, fravær- og timekopier fjernes; innstillinger blir stående', async () => {
  const keys = [
    'protop.employees.v1.companyA', 'protop.hr.v1.companyA', 'protop.absences.v1.companyA',
    'protop.absences.window.v1.companyA.2026-01-01_2026-12-31_', 'protop.timeEntries.v1.companyA',
    'protop.professionalProfile.v1.uid1', 'protop.iso.v1.companyA', 'protop.outlook.graphToken',
    'protop.lang', 'protop.appearance.v1', 'protop.absences.deleted.v1.companyA', 'protop.employeesX',
  ];
  const removed = personalCacheKeys(keys);
  assert.deepEqual(removed.sort(), [
    'protop.absences.v1.companyA', 'protop.absences.window.v1.companyA.2026-01-01_2026-12-31_',
    'protop.employees.v1.companyA', 'protop.hr.v1.companyA', 'protop.iso.v1.companyA', 'protop.outlook.graphToken',
    'protop.professionalProfile.v1.uid1', 'protop.timeEntries.v1.companyA',
  ].sort());

  const store = new Map(keys.map((key) => [key, 'x']));
  const storage = {
    async getAllKeys() { return [...store.keys()]; },
    async multiRemove(list) { list.forEach((key) => store.delete(key)); },
  };
  assert.equal(await clearPersonalCaches(storage), removed.length);
  assert.deepEqual([...store.keys()].sort(), [
    'protop.absences.deleted.v1.companyA', 'protop.appearance.v1', 'protop.employeesX', 'protop.lang',
  ]);
});

test('App fjerner kopiene når brukeren logger ut eller byttes', () => {
  const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /if \(leaving\) clearSessionData\(\)/);
  assert.match(app, /sessionUid !== u\.uid\) clearSessionData\(\)/);
});
