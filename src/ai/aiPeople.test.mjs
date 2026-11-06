import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { aiCandidates, aiPersonFor } from './aiPeople.js';

const NOW = new Date('2026-11-06T10:00:00Z');
const row = (id, personUid, company, firstName = id) => ({ id, personUid, person: { firstName }, company });

const staff = [
  row('e1', 'ola', { status: 'active' }, 'Ola'),
  row('e2', 'kari', { status: 'active', personnelKind: 'innleid' }, 'Kari'),
  row('e3', 'per', { status: 'inactive' }, 'Per'),
  row('e4', 'liv', { status: 'leave' }, 'Liv'),
  row('e5', 'tor', { status: 'active', periodTo: '2026-10-31' }, 'Tor'),
  row('e6', '', { status: 'active' }, 'Uten bruker'),
  row('e7', 'ada', { status: 'deleted' }, 'Ada'),
];

describe('aiCandidates', () => {
  test('alle aktive personer, egne og innleide hver for seg; de uten bruker merket', () => {
    const { own, external } = aiCandidates(staff, { now: NOW });
    assert.deepEqual(own.map((p) => [p.name, p.hasUser]), [['Ola', true], ['Uten bruker', false]]);
    assert.deepEqual(external.map((p) => p.uid), ['kari']);
    // Hver rad har en egen nøkkel, også de uten bruker.
    assert.equal(new Set(own.map((p) => p.key)).size, own.length);
  });

  test('administrator uten ansattpost kommer med, merket så den kan skilles fra en ansattpost', () => {
    const { own } = aiCandidates(staff, {
      now: NOW,
      admins: [{ uid: 'eier', name: 'Ola', email: 'eier@firma.no' }, { uid: 'per', name: 'Per' }],
    });
    // Per har en ansattpost (deaktivert), så den gjelder.
    assert.deepEqual(own.map((p) => p.uid), ['ola', 'eier', '']);
    const eier = own.find((p) => p.uid === 'eier');
    assert.match(eier.detail, /eier@firma\.no · Eier eller administrator, uten ansattpost/);
  });
});

describe('aiPersonFor', () => {
  test('status og type fra ansattposten', () => {
    assert.deepEqual(
      { ...aiPersonFor('kari', staff, { now: NOW }), name: undefined },
      { active: true, external: true, name: undefined, employeeId: 'e2' },
    );
    assert.equal(aiPersonFor('per', staff, { now: NOW }).active, false);
    assert.equal(aiPersonFor('liv', staff, { now: NOW }).active, false, 'permisjon gir ikke AI-tilgang');
    assert.equal(aiPersonFor('tor', staff, { now: NOW }).active, false, 'sluttdato passert');
    assert.equal(aiPersonFor('ada', staff, { now: NOW }).active, false, 'slettet');
  });

  test('eier uten ansattpost er aktiv, men en deaktivert ansattpost gjelder også for administrator', () => {
    assert.equal(aiPersonFor('eier', staff, { now: NOW, isAdmin: true }).active, true);
    assert.equal(aiPersonFor('per', staff, { now: NOW, isAdmin: true }).active, false);
    assert.equal(aiPersonFor('fremmed', staff, { now: NOW }).active, false);
  });
});
