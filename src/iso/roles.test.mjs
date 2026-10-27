import assert from 'node:assert/strict';
import test from 'node:test';
import { isoRoleFor } from './planning.js';
import { isoRoleIdFor, isRoleName, ownerParts, roleOwner, roleOwnerFixes } from './roles.js';
import {
  employeeForRole, employeeIsoRank, recommendedRoleAccess, roleAccessCheck, ROLE_ACCESS,
} from './access.js';
import { ISO_ROLES } from './catalog.js';
import { levelById } from '../access/companyAccess.js';

const SYSTEM = {
  ownerName: 'Kari Kvalitet',
  ownerUid: 'q1',
  roleMap: {
    system_owner: { name: 'Kari Kvalitet', uid: 'q1' },
    quality_manager: { name: 'Kari Kvalitet', uid: 'q1' },
    top_management: { name: 'Siri Leder', uid: 'u3' },
    project_manager: { name: 'Per Prosjekt', uid: 'p1' },
    hse_manager: { name: 'Hege HMS', uid: 'h1' },
  },
};

test('rolletekster fra tidligere systemer finner ProTop-rollen', () => {
  assert.equal(isoRoleIdFor('Daglig leder'), 'top_management');
  assert.equal(isoRoleIdFor('Ledelsen'), 'top_management');
  assert.equal(isoRoleIdFor('HMSK-leder'), 'quality_manager');
  assert.equal(isoRoleIdFor('K-HMS-leder'), 'quality_manager');
  assert.equal(isoRoleIdFor('Kvalitetsansvarlig'), 'quality_manager');
  assert.equal(isoRoleIdFor('HMS-ansvarlig'), 'hse_manager');
  assert.equal(isoRoleIdFor('Miljøansvarlig'), 'hse_manager');
  assert.equal(isoRoleIdFor('Byggeleder'), 'project_manager');
  assert.equal(isoRoleIdFor('HR-ansvarlig'), 'hr_manager');
  assert.equal(isoRoleIdFor('Hovedverneombud'), 'safety_rep');
  assert.equal(isoRoleIdFor('Alle ansatte'), 'employee');
  assert.equal(isoRoleIdFor('Tilbudsansvarlig'), '', 'funksjon, ikke en ISO-rolle');
  assert.deepEqual(ownerParts('HR / Ledelse'), ['HR', 'Ledelse']);
  assert.ok(isRoleName('Innkjøpsansvarlig'));
  assert.ok(!isRoleName('Ola Nordmann'));
  // Årshjulet bruker samme oppslag.
  assert.equal(isoRoleFor(SYSTEM.roleMap, 'HMS-ansvarlig')?.uid, 'h1');
  assert.equal(isoRoleFor(SYSTEM.roleMap, 'Daglig leder')?.uid, 'u3');
});

test('roleOwner: rolle → person, ellers kvalitetsleder med merknad; personnavn røres ikke', () => {
  assert.deepEqual(
    (({ kind, name, uid }) => ({ kind, name, uid }))(roleOwner('Daglig leder', SYSTEM)),
    { kind: 'rolle', name: 'Siri Leder', uid: 'u3' },
  );
  assert.equal(roleOwner('HR / Prosjektleder', SYSTEM).uid, 'p1', 'første rolle som har en person');
  const blank = roleOwner('Ikke tildelt', SYSTEM);
  assert.equal(blank.kind, 'standard');
  assert.equal(blank.uid, 'q1');
  assert.match(blank.note, /Eier mangler i kilden/);
  assert.match(roleOwner('Innkjøpsansvarlig', SYSTEM).note, /ikke en rolle i ProTop/);
  assert.deepEqual((({ kind, name, uid }) => ({ kind, name, uid }))(roleOwner('Internrevisor', SYSTEM)), { kind: 'ledig_rolle', name: 'Internrevisor', uid: '' }, 'rollen står til noen har den');
  assert.equal(roleOwner('Ola Nordmann', SYSTEM), null);
  assert.equal(roleOwner('Ikke tildelt', SYSTEM, { fallback: false }), null);
  assert.equal(roleOwner('Ukjent / Per Prosjekt', SYSTEM, { people: [{ name: 'Per Prosjekt', uid: 'p1' }] }).kind, 'person');
});

test('roleOwnerFixes kobler eksisterende rolle-eiere og lar personer og låste poster være', () => {
  const state = {
    system: SYSTEM,
    records: {
      risiko: [
        { id: 'r1', register: 'risiko', title: 'A', ownerName: 'Daglig leder', ownerUid: '' },
        { id: 'r2', register: 'risiko', title: 'B', ownerName: 'Tildelt ressurs' },
        { id: 'r3', register: 'risiko', title: 'C', ownerName: 'Per Prosjekt', ownerUid: 'p1' },
        { id: 'r4', register: 'risiko', title: 'D', ownerName: 'Daglig leder', locked: true },
      ],
    },
    documents: [{ id: 'd1', code: 'F-01', title: 'Dok', ownerName: 'Kvalitetsleder', ownerUid: 'import', approverName: 'Daglig leder' }],
    processes: [{ id: 'p1', code: 'B-01', title: 'Salg', ownerName: 'Ledelsen' }],
  };
  const people = [{ name: 'Per Prosjekt', uid: 'p1' }, { name: 'Siri Leder', uid: 'u3' }, { name: 'Kari Kvalitet', uid: 'q1' }];
  const fixes = roleOwnerFixes(state, { people, actor: { uid: 'q1', name: 'Kari Kvalitet' } });
  assert.deepEqual(fixes.map((f) => f.entity.id).sort(), ['d1', 'p1', 'r1', 'r2']);
  const by = (id) => fixes.find((f) => f.entity.id === id).entity;
  assert.deepEqual([by('r1').ownerName, by('r1').ownerUid], ['Siri Leder', 'u3']);
  assert.equal(by('r1').history.at(-1).note, '«Daglig leder» → Siri Leder');
  assert.equal(by('r2').needsReview, true);
  assert.deepEqual([by('d1').ownerName, by('d1').ownerUid, by('d1').approverName], ['Kari Kvalitet', 'q1', 'Siri Leder']);
  assert.equal(by('p1').ownerUid, 'u3');
  assert.ok(fixes.every((f) => f.event.action.endsWith('.owner_linked')));
  assert.equal(roleOwnerFixes(state, { people, build: false }).length, 4, 'oversikten teller det samme');
  // En rolle ingen har ennå, kobles ikke (ingen å koble til) – men kobles når rollen er satt.
  const vacant = { ...state, records: { risiko: [{ id: 'r9', register: 'risiko', title: 'X', ownerName: 'Internrevisor' }] }, documents: [], processes: [] };
  assert.equal(roleOwnerFixes(vacant, { people }).length, 0);
  const filled = { ...vacant, system: { ...SYSTEM, roleMap: { ...SYSTEM.roleMap, internal_auditor: { name: 'Per Prosjekt', uid: 'p1' } } } };
  assert.equal(roleOwnerFixes(filled, { people }).at(0)?.entity.ownerUid, 'p1');
});

test('rollene har beskrivelse, fagansvar og nivå som finnes i tilgangsstyringen', () => {
  for (const r of ISO_ROLES) assert.ok(r.summary, `${r.id} har beskrivelse`);
  for (const [role, a] of Object.entries(ROLE_ACCESS)) {
    assert.ok(ISO_ROLES.some((r) => r.id === role), `${role} er en ISO-rolle`);
    assert.equal(levelById(a.level)?.section, 'specialist', `${role} anbefaler et fagansvar`);
    assert.ok(a.need >= 1 && a.need <= 2, `${role} krever ikke Admin`);
  }
});

test('anbefalt tilgang: bare det som mangler, ett fagansvar per behov, aldri på deaktiverte', () => {
  const emp = (id, uid, levels, status = 'active') => ({
    id, personUid: uid, company: { status, accessLevels: levels, accessLevel: levels.at(-1) },
  });
  const employees = [
    emp('e1', 'h1', ['ansatt']),
    emp('e2', 'p1', ['ansatt']),
    emp('e3', 'u3', ['leder']),
    emp('e4', 'q1', ['administrator']),
    emp('e5', 'a1', ['ansatt'], 'inactive'),
  ];
  const roleMap = {
    ...SYSTEM.roleMap,
    safety_rep: { name: 'Hege HMS', uid: 'h1' },
    internal_auditor: { name: 'Per Prosjekt', uid: 'p1' },
    manager: { name: 'Arne Av', uid: 'a1' },
  };
  const recs = recommendedRoleAccess(roleMap, { employees });
  const by = (uid) => recs.find((r) => r.uid === uid);
  assert.deepEqual(by('h1').addLevels, ['hms_ansvarlig'], 'HMS-leder og verneombud: ett fagansvar');
  assert.deepEqual([by('h1').from, by('h1').to], [1, 2]);
  assert.deepEqual(by('p1').addLevels, ['iso_rolle'], 'prosjektleder og internrevisor: Rolle i ISO');
  assert.deepEqual(by('p1').next.company.accessLevels, ['iso_rolle', 'ansatt'], 'vanlig nivå beholdes og er fortsatt hovednivå');
  assert.equal(by('p1').next.company.accessLevel, 'ansatt');
  assert.equal(by('u3'), undefined, 'øverste leder har nok fra før');
  assert.equal(by('q1'), undefined, 'administrator har nok fra før');
  assert.equal(by('a1'), undefined, 'deaktiverte endres ikke');

  const check = roleAccessCheck(roleMap, (uid) => ({ h1: 1, p1: 1, u3: 3, q1: 3 })[uid] ?? 0);
  const hse = check.find((r) => r.role === 'hse_manager');
  assert.equal(hse.ok, false);
  assert.equal(hse.levelLabel, 'HMS-ansvarlig / verneombud');
  assert.equal(check.find((r) => r.role === 'safety_rep').ok, true, 'verneombud trenger bare Lese');
});

test('anbefalt tilgang virker også for ansatte uten innlogging (funnet via ansatt-id eller navn)', () => {
  const employees = [
    { id: 'e1', personUid: '', company: { status: 'active', accessLevels: ['ansatt'], accessLevel: 'ansatt' } },
    { id: 'e2', personUid: '', company: { status: 'active', accessLevels: ['ansatt'], accessLevel: 'ansatt' } },
    { id: 'e3', personUid: '', company: { status: 'active', accessLevels: ['ansatt'], accessLevel: 'ansatt' } },
  ];
  const people = [{ id: 'e1', name: 'Ellen Hidle', uid: '' }, { id: 'e2', name: 'Silje Håland', uid: '' }, { id: 'e3', name: 'Ola Navnesen', uid: '' }, { id: 'x', name: 'Ola Navnesen', uid: '' }];
  const roleMap = {
    hse_manager: { name: 'Ellen Hidle', uid: '' },
    project_manager: { name: 'Silje Håland', uid: '', employeeId: 'e2' },
    internal_auditor: { name: 'Ola Navnesen', uid: '' },
  };
  assert.equal(employeeForRole(roleMap.hse_manager, { employees, people })?.id, 'e1', 'navn');
  assert.equal(employeeForRole(roleMap.project_manager, { employees, people })?.id, 'e2', 'ansatt-id');
  assert.equal(employeeForRole(roleMap.internal_auditor, { employees, people }), null, 'tvetydig navn gir ingen');
  const recs = recommendedRoleAccess(roleMap, { employees, people });
  assert.deepEqual(recs.map((r) => [r.employeeId, r.addLevels, r.linked]), [['e1', ['hms_ansvarlig'], false], ['e2', ['iso_rolle'], false]]);
  const check = roleAccessCheck(roleMap, () => 0, (person) => {
    const e = employeeForRole(person, { employees, people });
    return e ? { rank: employeeIsoRank(null, e), linked: !!e.personUid } : null;
  });
  const hse = check.find((r) => r.role === 'hse_manager');
  assert.deepEqual([hse.has, hse.linked, hse.ok], [1, false, false]);
  assert.equal(check.find((r) => r.role === 'internal_auditor').has, null);
});
