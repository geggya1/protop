/**
 * Lovkravbiblioteket for bygg (ISO-19): sentrale byggregler er med, hver har kilde, og
 * byggherreforskriften tas med uansett om ISO 45001 er valgt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGAL_LIBRARY_CHECKED, NORWEGIAN_OBLIGATIONS } from './catalog.js';
import { starterPlan } from './integrations.js';

test('ISO-19: biblioteket har byggreglene, med kilde på Lovdata eller myndighet', () => {
  const keys = NORWEGIAN_OBLIGATIONS.map((o) => o.key);
  for (const k of ['sak10', 'tek17', 'utforelse', 'arbeidsplass', 'hmskort', 'allmenngjoring', 'apenhet', 'brann', 'bhf']) assert.ok(keys.includes(k), k);
  assert.equal(new Set(keys).size, keys.length, 'unike nøkler');
  for (const o of NORWEGIAN_OBLIGATIONS) {
    assert.match(o.source, /^https:\/\//, o.key);
    assert.ok(o.areaKeys.length, o.key);
  }
  assert.match(LEGAL_LIBRARY_CHECKED, /^\d{4}-\d{2}-\d{2}$/);
});

test('ISO-19: byggherreforskriften følger med i startpakken også uten ISO 45001', () => {
  const plan = starterPlan({ standards: ['ISO9001'] }, new Date('2026-10-28T10:00:00Z'));
  assert.ok(plan.obligations.includes('bhf'));
  assert.ok(plan.obligations.includes('hmskort'));
});
