/**
 * Administratorlisten følger nivået Administrator (FL-08). Ren logikk, ingen Firebase.
 */
import assert from 'node:assert/strict';
import { planAdminLevelMigration, planAdminUids } from './aclSync.js';

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

{
  // REV-06: før første synk etter deploy. Den som er gjort til administrator via adminUids
  // (Gruppeinnstillinger), og har en koblet post med et annet nivå, får nivået Administrator
  // lagt til, og mister dermed ikke admin.
  const before = { type: 'company', ownerUid: 'own', adminUids: ['own', 'regn', 'kari', 'ola'], members: ['own', 'regn', 'kari', 'ola', 'ans'] };
  const rows = [
    emp('regn', ['regnskap_ekstern']),
    emp('kari', ['leder']),
    emp('ola', ['administrator']),
    emp('ans', ['ansatt']),
  ];
  const promoted = planAdminLevelMigration({ family: before, employees: rows });
  assert.deepEqual(promoted.map((row) => row.id), ['emp_regn', 'emp_kari']);
  assert.ok(promoted[1].patch['company.accessLevels'].includes('administrator'));
  assert.ok(promoted[1].patch['company.accessLevels'].includes('leder'), 'nivået personen hadde, står');
  const after = rows.map((row) => promoted.find((p) => p.id === row.id)?.employee || row);
  const plan = planAdminUids({ family: before, employees: after });
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.adminUids, ['own', 'regn', 'kari', 'ola']);
  // Uten overføringen ville begge mistet admin (slik gjennomgangen viste).
  assert.deepEqual(planAdminUids({ family: before, employees: rows }).remove, ['regn', 'kari']);
}

{
  // Overføringen rører ikke eieren, ikke-medlemmer, avsluttede poster eller personer uten post.
  const promoted = planAdminLevelMigration({
    family: { ownerUid: 'own', adminUids: ['own', 'borte', 'slutt', 'ukoblet'], members: ['own', 'slutt', 'ukoblet'] },
    employees: [emp('own', ['ansatt']), emp('borte', ['leder']), emp('slutt', ['leder'], 'inactive')],
  });
  assert.deepEqual(promoted, []);
}

{
  // Bedriften står aldri uten administrator.
  const plan = planAdminUids({
    family: { adminUids: ['a'], members: ['a'] },
    employees: [emp('a', ['leder'])],
  });
  assert.deepEqual(plan, { adminUids: ['a'], add: [], remove: [] });
}

console.log('aclSync.test.mjs: ok');
