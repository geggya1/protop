/**
 * DS-22: barnehagens fravær og ProTop-fravær blandes ikke.
 *   node --test src/platform/childAbsences.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHILD_ABSENCES, CHILD_ABSENCE_LIMIT, isChildAbsenceRow, mergeChildAbsences,
} from './childAbsences.js';
import { normalizeAbsenceRow } from '../project/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const child = (id, dateKey, over = {}) => ({
  id, childId: 'k1', childName: 'Kari', dateKey, reason: 'Syk', status: 'pending', authorUid: 'mor', ...over,
});
const staff = (id, date, over = {}) => ({
  id, employeeId: 'emp_bob', employeeName: 'Bob', date, hours: 7.5, type: 'egenmelding', status: 'registrert', ...over,
});

test('barnehagens skjema kjennes igjen, ansattfravær gjør ikke', () => {
  assert.equal(isChildAbsenceRow(child('b1', '2026-10-20')), true);
  assert.equal(isChildAbsenceRow({ id: 'b2', childId: 'k2', dateKey: '2026-10-21', authorUid: 'far' }), true);
  assert.equal(isChildAbsenceRow(staff('a1', '2026-10-20')), false);
  assert.equal(isChildAbsenceRow(null), false);
  assert.equal(isChildAbsenceRow({}), false);
});

test('ProTop leser ikke barnehagens meldinger som ansattfravær', () => {
  assert.equal(normalizeAbsenceRow(child('b1', '2026-10-20')), null);
  const rows = [child('b1', '2026-10-20'), staff('a1', '2026-10-20')]
    .map((row) => normalizeAbsenceRow(row))
    .filter(Boolean);
  assert.deepEqual(rows.map((row) => row.id), ['a1']);
});

test('plattformen leser nye og eldre meldinger, uten ansattfravær', () => {
  const fresh = [child('n1', '2026-10-25'), child('same', '2026-10-22', { reason: 'Ny' })];
  const legacy = [
    child('o1', '2026-10-24'),
    child('same', '2026-10-22', { reason: 'Gammel' }),
    staff('a1', '2026-10-26'),
  ];
  const list = mergeChildAbsences(fresh, legacy);
  assert.deepEqual(list.map((row) => row.id), ['n1', 'o1', 'same']);
  assert.equal(list.find((row) => row.id === 'same').reason, 'Ny');
  const many = Array.from({ length: 40 }, (_, i) => child(`x${i}`, `2026-09-${String(i % 28 + 1).padStart(2, '0')}`));
  assert.equal(mergeChildAbsences(many, []).length, CHILD_ABSENCE_LIMIT);
});

test('plattformen skriver nye meldinger til childAbsences', () => {
  const core = read('src/platform/platformCore.js');
  assert.equal(CHILD_ABSENCES, 'childAbsences');
  assert.match(core, /addDoc\(collection\(db, 'families', groupId, CHILD_ABSENCES\)/);
  assert.doesNotMatch(core, /addDoc\(collection\(db, 'families', groupId, 'absences'\)/);
});

test('reglene har egen samling for barnas fravær, unntatt fra den generelle regelen', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /coll == 'childAbsences'/);
  const at = rules.indexOf('match /childAbsences/{absenceId} {');
  assert.ok(at > 0, 'childAbsences mangler i reglene');
  const block = rules.slice(at, rules.indexOf('\n      }\n', at));
  assert.match(block, /!isCompanyGroup\(familyId\)/);
  assert.match(block, /request\.resource\.data\.get\('authorUid', ''\) == request\.auth\.uid/);
});
