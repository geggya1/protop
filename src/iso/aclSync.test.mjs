/**
 * Administratorlisten følger nivået Administrator (FL-08). Ren logikk, ingen Firebase.
 */
import assert from 'node:assert/strict';
import { planAdminUids } from './aclSync.js';

const emp = (personUid, levels, status = 'active') => ({ id: `emp_${personUid}`, personUid, company: { accessLevels: levels, status } });

const family = {
  ownerUid: 'own',
  adminUids: ['own', 'adm', 'ned', 'borte', 'ukoblet'],
  members: ['own', 'adm', 'ned', 'ny', 'ukoblet', 'ans'],
};
const employees = [
  emp('adm', ['administrator']),
  emp('ned', ['leder']),
  emp('ny', ['ansatt', 'administrator']),
  emp('ans', ['ansatt']),
  emp('own', ['ansatt']),
];

{
  const plan = planAdminUids({ family, employees });
  // Eieren beholder admin selv med nivået Ansatt. Nedgradert og ikke-medlem tas bort,
  // ny administrator legges til, og den uten ansattpost står som før.
  assert.deepEqual(plan.adminUids, ['own', 'adm', 'ukoblet', 'ny']);
  assert.deepEqual(plan.add, ['ny']);
  assert.deepEqual(plan.remove, ['ned', 'borte']);
}

{
  // Deaktivert eller slettet administrator mister admin.
  const plan = planAdminUids({
    family: { ownerUid: 'own', adminUids: ['own', 'a', 'b'], members: ['own', 'a', 'b'] },
    employees: [emp('a', ['administrator'], 'inactive'), emp('b', ['administrator'], 'deleted')],
  });
  assert.deepEqual(plan.adminUids, ['own']);
  assert.deepEqual(plan.remove, ['a', 'b']);
}

{
  // Eieren legges inn hvis den mangler, og ingen endring gir tomme lister.
  assert.deepEqual(planAdminUids({ family: { ownerUid: 'own', members: ['own'] }, employees: [] }).add, ['own']);
  const same = planAdminUids({ family: { ownerUid: 'own', adminUids: ['own'], members: ['own'] }, employees: [] });
  assert.deepEqual([same.add, same.remove], [[], []]);
}

console.log('aclSync.test.mjs: ok');
