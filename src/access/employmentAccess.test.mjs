/**
 * Avsluttet ansettelse gir ingen rettigheter – heller ikke standardnivået «Ansatt».
 * Gjelder appen (resolveActorAccess) og speilet reglene leser (aclFor).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accountDeactivated,
  grantsForEmployee,
  resolveActorAccess,
} from './companyAccess.js';
import { aclFor } from '../iso/aclSync.js';

const policy = null;

function employee(id, uid, company) {
  return {
    id,
    personUid: uid,
    person: { firstName: id },
    company: { accessLevel: 'leder', accessLevels: ['leder'], ...company },
  };
}

function blank(grants) {
  return Object.values(grants).every((rank) => rank === 'none');
}

test('medlem uten ansattpost får fortsatt «Ansatt» (som før)', () => {
  const actor = resolveActorAccess({ policy, employees: [], uid: 'ny' });
  assert.equal(actor.levelId, 'ansatt');
  assert.equal(blank(actor.grants), false);
});

test('papirkurv gir ingen rettigheter (ikke «Ansatt»)', () => {
  const rows = [employee('e1', 'kari', { status: 'deleted' })];
  const actor = resolveActorAccess({ policy, employees: rows, uid: 'kari' });
  assert.equal(actor.levelId, '');
  assert.equal(blank(actor.grants), true);
  assert.equal(actor.closed, 'deleted');
  assert.equal(actor.employee.id, 'e1');
  const acl = aclFor({ family: { members: ['kari'] }, employees: rows, uid: 'kari' });
  assert.equal(acl.iso, 0);
  assert.equal(acl.levelId, '');
  assert.equal(blank(acl.grants), true);
});

test('deaktivert og sluttdato passert gir ingen rettigheter', () => {
  for (const company of [{ status: 'inactive' }, { status: 'former' }, { status: 'active', periodTo: '2001-05-01' }]) {
    const rows = [employee('e1', 'kari', company)];
    const actor = resolveActorAccess({ policy, employees: rows, uid: 'kari' });
    assert.equal(blank(actor.grants), true, JSON.stringify(company));
    assert.equal(blank(grantsForEmployee(policy, rows[0])), true);
    assert.equal(accountDeactivated(rows[0]), true);
    assert.equal(aclFor({ family: { members: ['kari'] }, employees: rows, uid: 'kari' }).iso, 0);
  }
});

test('en aktiv ansettelse vinner over en gammel for samme person', () => {
  const rows = [
    employee('gammel', 'kari', { status: 'deleted', accessLevel: 'administrator', accessLevels: ['administrator'] }),
    employee('ny', 'kari', { status: 'active' }),
  ];
  const actor = resolveActorAccess({ policy, employees: rows, uid: 'kari' });
  assert.equal(actor.employee.id, 'ny');
  assert.equal(actor.levelId, 'leder');
  assert.equal(actor.closed, undefined);
});

test('permisjon og fremtidig sluttdato beholder tilgangen', () => {
  for (const company of [{ status: 'leave' }, { status: 'active', periodTo: '2999-01-01' }]) {
    const actor = resolveActorAccess({ policy, employees: [employee('e1', 'kari', company)], uid: 'kari' });
    assert.equal(actor.levelId, 'leder');
    assert.equal(blank(actor.grants), false);
  }
});

test('eieren beholder full tilgang selv med avsluttet ansattpost', () => {
  const rows = [employee('e1', 'own', { status: 'inactive' })];
  const acl = aclFor({ family: { ownerUid: 'own', members: ['own'] }, employees: rows, uid: 'own' });
  assert.equal(acl.owner, true);
  assert.equal(acl.iso, 3);
});
