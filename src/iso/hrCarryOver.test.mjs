import assert from 'node:assert/strict';
import test from 'node:test';
import { HR_CARRY_OVER, hrCarryOver, hrCarryOverRecords } from './integrations.js';
import { competenceForPerson } from './registers.js';
import { COMPLIANCE_CATALOG, MOVED_TO_ISO } from '../hr/compliance.js';

const actor = { uid: 'u0', name: 'Kari Kvalitet' };
const people = [
  { id: 'e1', name: 'Ada Nordmann', uid: 'u1' },
  { id: 'e2', name: 'Bo Hansen', uid: '' },
];
const hrCompliance = [
  { catalogId: 'ik_hms_intro', employeeId: 'e1', status: 'ok', completedAt: '2025-03-01', note: 'Intro-kurs' },
  { catalogId: 'ik_deviation_known', employeeId: 'e1', status: 'missing' },
  { catalogId: 'iso45001_hms', employeeId: 'e2', status: 'ok', completedAt: '' },
  { catalogId: 'iso9001_competence', employeeId: 'e1', status: 'ok' },
  { catalogId: 'aml_written_contract', employeeId: 'e1', status: 'ok' },
  { catalogId: 'ik_hms_intro', employeeId: 'slettet', status: 'ok' },
];

test('HR_CARRY_OVER peker bare på punkter som er flyttet ut av HR-sjekklisten', () => {
  for (const def of HR_CARRY_OVER) {
    assert.ok(MOVED_TO_ISO.some((row) => row.id === def.hrId), def.hrId);
    assert.ok(!COMPLIANCE_CATALOG.some((row) => row.id === def.hrId), def.hrId);
  }
});

test('hrCarryOver: manglende krav og OK-avkrysninger fra HR', () => {
  const plan = hrCarryOver({ hrCompliance, people, requirements: [], records: [] });
  assert.deepEqual(plan.missing.map((d) => d.hrId), HR_CARRY_OVER.map((d) => d.hrId));
  // Bare OK på HMS-punktene, og bare for ansatte som finnes.
  assert.deepEqual(plan.evidence.map((e) => e.key), ['hr:ik_hms_intro:e1', 'hr:iso45001_hms:e2']);
  assert.equal(plan.evidence[0].completedAt, '2025-03-01');
});

test('hrCarryOverRecords: krav for alle ansatte og bevis koblet til kravene', () => {
  const plan = hrCarryOver({ hrCompliance, people, requirements: [], records: [] });
  const res = hrCarryOverRecords(plan, { actor, requirements: [], records: [] });
  assert.equal(res.ok, true);
  const reqs = res.records.filter((r) => r.register === 'kompetansekrav');
  const proofs = res.records.filter((r) => r.register === 'kompetanse');
  assert.equal(reqs.length, 3);
  assert.ok(reqs.every((r) => r.role === 'Alle ansatte'));
  assert.equal(new Set(reqs.map((r) => r.number)).size, 3);
  assert.equal(proofs.length, 2);
  const intro = reqs.find((r) => r.title === 'HMS-introduksjon');
  const ada = proofs.find((r) => r.personName === 'Ada Nordmann');
  assert.equal(ada.requirementId, intro.id);
  assert.equal(ada.personUid, 'u1');
  assert.equal(ada.validFrom, '2025-03-01');
  assert.equal(ada.importKey, 'hr:ik_hms_intro:e1');
  assert.match(ada.title, /Intro-kurs/);
  assert.equal(res.events.length, 5);

  // Etter flyttingen er det ingenting igjen, heller ikke om et bevis senere arkiveres.
  const records = proofs.map((r) => (r.personName === 'Bo Hansen' ? { ...r, state: 'arkivert' } : r));
  const after = hrCarryOver({ hrCompliance, people, requirements: reqs, records });
  assert.equal(after.missing.length, 0);
  assert.equal(after.evidence.length, 0);

  // HR viser personens status fra ISO.
  const status = competenceForPerson(people[0], { kompetansekrav: reqs, kompetanse: proofs, rolle: [] });
  assert.deepEqual(status.map((r) => [r.title, r.status]), [
    ['HMS-introduksjon', 'gyldig'],
    ['Kjenner rutinen for å melde avvik', 'mangler'],
    ['Arbeidsmiljøopplæring', 'mangler'],
  ]);
});

test('hrCarryOver: eksisterende krav og bevis i ISO gjenbrukes', () => {
  const req = { id: 'k1', register: 'kompetansekrav', title: 'hms-introduksjon', role: 'Alle ansatte', state: 'aktiv' };
  const proof = { id: 'p1', register: 'kompetanse', requirementId: 'k1', personUid: 'u1', personName: 'Ada Nordmann', state: 'gyldig' };
  const plan = hrCarryOver({ hrCompliance, people, requirements: [req], records: [proof] });
  assert.deepEqual(plan.missing.map((d) => d.hrId), ['ik_deviation_known', 'iso45001_hms']);
  assert.deepEqual(plan.evidence.map((e) => e.key), ['hr:iso45001_hms:e2']);
  assert.equal(competenceForPerson(null, {}).length, 0);
});
