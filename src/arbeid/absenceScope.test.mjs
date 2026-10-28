import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { standardGrants } from '../access/companyAccess.js';
import { absenceGrantsSeeAll, absenceScopeFor, scopedAbsenceRange } from './absenceScope.js';

const future = new Date(Date.now() + 3600 * 1000).toISOString();
const past = new Date(Date.now() - 3600 * 1000).toISOString();
const company = { type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'] };

test('standardnivåene: ansatte ser bare eget fravær, HR og ledere ser alle', () => {
  for (const id of ['ansatt', 'tilbud', 'ansatt_andre_avdelinger', 'innleie_ekstern', 'regnskap_ekstern']) {
    assert.equal(absenceGrantsSeeAll(standardGrants(id)), false, id);
  }
  for (const id of ['hr_ansvarlig', 'avdelingsleder', 'leder', 'administrator']) {
    assert.equal(absenceGrantsSeeAll(standardGrants(id)), true, id);
  }
});

test('omfanget følger speilet, og eier og administratorer ser alltid alt', () => {
  const acl = (levelId, over = {}) => ({ grants: standardGrants(levelId), employeeId: 'emp_1', expiresAt: future, ...over });
  assert.deepEqual(absenceScopeFor({ family: company, uid: 'bob', acl: acl('ansatt') }), { all: false, employeeId: 'emp_1' });
  assert.deepEqual(absenceScopeFor({ family: company, uid: 'hr', acl: acl('hr_ansvarlig') }), { all: true, employeeId: '' });
  assert.equal(absenceScopeFor({ family: company, uid: 'adm', acl: null }).all, true);
  assert.equal(absenceScopeFor({ family: company, uid: 'own' }).all, true);
  // Uten speil, eller med utløpt speil: ingenting (reglene avviser også egne lister).
  assert.deepEqual(absenceScopeFor({ family: company, uid: 'bob', acl: null }), { all: false, employeeId: '' });
  assert.deepEqual(absenceScopeFor({ family: company, uid: 'hr', acl: acl('hr_ansvarlig', { expiresAt: past }) }), { all: false, employeeId: '' });
  // Andre grupper (barnehage): som før.
  assert.equal(absenceScopeFor({ family: { type: 'daycare' }, uid: 'mor' }).all, true);
});

test('datovinduet filtreres alltid på egen ansattpost uten full tilgang', () => {
  const own = { all: false, employeeId: 'emp_1' };
  assert.deepEqual(scopedAbsenceRange(own, { fromDate: '2026-01-01' }), { fromDate: '2026-01-01', employeeId: 'emp_1' });
  assert.deepEqual(scopedAbsenceRange(own, { employeeId: 'emp_1' }), { employeeId: 'emp_1' });
  assert.equal(scopedAbsenceRange(own, { employeeId: 'emp_2' }), null);
  assert.equal(scopedAbsenceRange({ all: false, employeeId: '' }, {}), null);
  assert.deepEqual(scopedAbsenceRange({ all: true }, { fromDate: 'x' }), { fromDate: 'x' });
});

test('reglene og appen bruker samme rettigheter', () => {
  const rules = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../firestore.rules'), 'utf8');
  const start = rules.indexOf('function absenceForAll');
  const body = rules.slice(start, rules.indexOf('\n    }\n', start));
  for (const res of ["'hoursOthers', 2", "'absence', 3", "'absenceReport', 3", 'hrGrantAtLeast(g, hrRank)']) {
    assert.ok(body.includes(res), res);
  }
  const storage = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'absenceStorage.js'), 'utf8');
  assert.match(storage, /scopedAbsenceRange\(scope, range\)/);
});
