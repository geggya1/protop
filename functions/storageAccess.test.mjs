import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { standardGrants } from '../src/access/companyAccess.js';
import {
  groupImageOwner, ownerOnlyAllowed, storageAllowed, storageArea,
} from './storageAccess.js';

const actor = (levelId, over = {}) => ({
  uid: `u_${levelId}`, admin: false, organization: true, grants: standardGrants(levelId), employeeIds: ['emp_me'], ...over,
});

test('mappene i en bedrift', () => {
  assert.deepEqual(storageArea('families/c1/hr/emp_1/123_avtale.pdf'), { companyId: 'c1', area: 'hr', employeeId: 'emp_1' });
  assert.equal(storageArea('families/c1/hr/applications/123_cv.pdf').area, 'hrApplications');
  assert.deepEqual(storageArea('families/c1/employeeFiles/emp_2/x.pdf'), { companyId: 'c1', area: 'employeeFiles', employeeId: 'emp_2' });
  assert.equal(storageArea('families/c1/invoices/inv_1/Faktura-100.pdf').area, 'invoices');
  assert.equal(storageArea('families/c1/mileage/1-kvittering.jpg').area, 'receipts');
  assert.equal(storageArea('families/c1/chats/a/attachments/1.jpg').area, 'member');
});

test('HR-filer og CV-er: bare HR, eier og administrator; den ansatte leser sin egen mappe', () => {
  const ansatt = actor('ansatt');
  assert.equal(storageAllowed({ area: 'hr', employeeId: 'emp_other', op: 'read', actor: ansatt }), false);
  assert.equal(storageAllowed({ area: 'hr', employeeId: 'emp_me', op: 'read', actor: ansatt }), true);
  assert.equal(storageAllowed({ area: 'hr', employeeId: 'emp_me', op: 'write', actor: ansatt }), false);
  assert.equal(storageAllowed({ area: 'hrApplications', op: 'read', actor: ansatt }), false);
  const hr = actor('hr_ansvarlig');
  assert.equal(storageAllowed({ area: 'hr', employeeId: 'emp_other', op: 'write', actor: hr }), true);
  assert.equal(storageAllowed({ area: 'hrApplications', op: 'read', actor: hr }), true);
  const avd = actor('avdelingsleder');
  assert.equal(storageAllowed({ area: 'hr', employeeId: 'emp_other', op: 'read', actor: avd }), true);
  assert.equal(storageAllowed({ area: 'hr', employeeId: 'emp_other', op: 'write', actor: avd }), false);
  assert.equal(storageAllowed({ area: 'hr', employeeId: 'x', op: 'write', actor: actor('ansatt', { admin: true }) }), true);
});

test('ansattfiler: egen mappe, HR og Begrenset redigering på Ansatte', () => {
  assert.equal(storageAllowed({ area: 'employeeFiles', employeeId: 'emp_me', op: 'write', actor: actor('ansatt') }), true);
  assert.equal(storageAllowed({ area: 'employeeFiles', employeeId: 'emp_other', op: 'read', actor: actor('ansatt') }), false);
  assert.equal(storageAllowed({ area: 'employeeFiles', employeeId: 'emp_other', op: 'read', actor: actor('avdelingsleder') }), true);
});

test('fakturaarkivet: økonomi leser og skriver, og ingen overskriver en fil som finnes', () => {
  assert.equal(storageAllowed({ area: 'invoices', op: 'read', actor: actor('ansatt') }), false);
  assert.equal(storageAllowed({ area: 'invoices', op: 'read', actor: actor('regnskap_ekstern') }), true);
  assert.equal(storageAllowed({ area: 'invoices', op: 'write', actor: actor('regnskap_ekstern') }), false);
  assert.equal(storageAllowed({ area: 'invoices', op: 'write', actor: actor('leder') }), true);
  const existing = { uploadedBy: 'u_leder' };
  assert.equal(storageAllowed({ area: 'invoices', op: 'write', actor: actor('leder'), existing }), false);
  assert.equal(storageAllowed({ area: 'invoices', op: 'write', actor: actor('leder', { admin: true }), existing }), false);
});

test('kvitteringer: den som lastet opp og økonomi leser; bare den som lastet opp overskriver', () => {
  const kari = actor('ansatt', { uid: 'kari' });
  assert.equal(storageAllowed({ area: 'receipts', op: 'read', actor: kari, existing: { uploadedBy: 'kari' } }), true);
  assert.equal(storageAllowed({ area: 'receipts', op: 'read', actor: kari, existing: { uploadedBy: 'ola' } }), false);
  assert.equal(storageAllowed({ area: 'receipts', op: 'write', actor: kari, existing: { uploadedBy: 'ola' } }), false);
  assert.equal(storageAllowed({ area: 'receipts', op: 'write', actor: kari, existing: null }), true);
  assert.equal(storageAllowed({ area: 'receipts', op: 'read', actor: actor('leder'), existing: { uploadedBy: 'ola' } }), true);
});

test('andre grupper og egne filer', () => {
  assert.equal(storageAllowed({ area: 'hr', op: 'read', actor: { uid: 'mor', organization: false } }), true);
  assert.equal(storageAllowed({ area: 'member', op: 'write', actor: actor('ansatt') }), true);
  assert.equal(ownerOnlyAllowed({ uid: 'a', existing: { uploadedBy: 'b' } }), false);
  assert.equal(ownerOnlyAllowed({ uid: 'a', existing: { uploadedBy: 'a' } }), true);
  assert.equal(ownerOnlyAllowed({ uid: 'a', existing: null }), true);
  assert.equal(groupImageOwner('groups/fam123-1730000000000.jpg'), 'fam123');
  assert.equal(groupImageOwner('groups/../x.jpg'), '');
  assert.equal(groupImageOwner('groups/fam123/x.jpg'), '');
});

test('uploadStorage bruker samme vurdering, og storage.rules finnes', () => {
  const src = readFileSync(new URL('./uploadStorage.js', import.meta.url), 'utf8');
  assert.match(src, /storageAllowed\(\{ area, employeeId, op, actor, existing \}\)/);
  assert.match(src, /uploadedBy: uid/);
  assert.doesNotMatch(src, /assertCanReadObjectPath = assertCanWriteObjectPath/);
  const rules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
  for (const folder of ['/hr/', 'employeeFiles', 'invoices', 'mileage', 'personal', 'groups']) {
    assert.ok(rules.includes(folder), folder);
  }
});
