import assert from 'node:assert/strict';
import {
  addSubUnit,
  createDepartment,
  createUnderenhet,
  departmentsOf,
  findOwnedOrganization,
  groupOverview,
  linkedCompanyFields,
  mergeUnitHits,
  normalizeSubUnits,
  publicUnitsNotRegistered,
  removeSubUnit,
  underenheterOf,
} from './companyUnits.js';

assert.equal(createDepartment({ name: '  ' }).ok, false);
const dept = createDepartment({ name: ' Elektro ', note: 'Øst', at: '2026-10-05T00:00:00.000Z' });
assert.equal(dept.ok, true);
assert.equal(dept.unit.kind, 'avdeling');
assert.equal(dept.unit.name, 'Elektro');
assert.equal(dept.unit.organisasjonsnummer, '');
assert.equal(dept.unit.note, 'Øst');

assert.equal(createUnderenhet({ name: 'Datter AS' }).ok, false);
const unit = createUnderenhet({
  name: 'Datter AS',
  organisasjonsnummer: '917 103 801',
  companyId: 'fam2',
  at: '2026-10-05T00:00:00.000Z',
});
assert.equal(unit.ok, true);
assert.equal(unit.unit.kind, 'underenhet');
assert.equal(unit.unit.organisasjonsnummer, '917103801');
assert.equal(unit.unit.companyId, 'fam2');

const added = addSubUnit([], unit.unit);
assert.equal(added.ok, true);
assert.equal(addSubUnit(added.list, unit.unit).ok, false);
assert.equal(addSubUnit(added.list, dept.unit).ok, true);

const both = addSubUnit(added.list, dept.unit).list;
assert.equal(underenheterOf(both).length, 1);
assert.equal(departmentsOf(both).length, 1);
assert.equal(removeSubUnit(both, unit.unit.id).length, 1);

assert.deepEqual(
  normalizeSubUnits([{ kind: 'avdeling', name: 'Drift' }, { kind: 'avdeling', name: 'drift' }]).map((row) => row.name),
  ['Drift'],
);

const patch = linkedCompanyFields({
  parentId: 'fam1',
  parentName: 'Morselskap AS',
  company: { navn: 'Datter AS', organisasjonsnummer: '917103801' },
});
assert.equal(patch.parentCompanyId, 'fam1');
assert.equal(patch.orgnr, '917103801');
assert.deepEqual(patch.projects, []);

assert.equal(
  findOwnedOrganization(
    [{ id: 'fam2', company: { organisasjonsnummer: '917103801' } }],
    '917 103 801',
  )?.id,
  'fam2',
);
assert.equal(findOwnedOrganization([], '917103801'), null);

const mergedHits = mergeUnitHits(
  [{ organisasjonsnummer: '111111111', navn: 'Under' }],
  [{ organisasjonsnummer: '111 111 111', navn: 'Dup' }, { organisasjonsnummer: '222222222', navn: 'Datter' }],
);
assert.deepEqual(mergedHits.map((row) => row.navn), ['Under', 'Datter']);

const leftover = publicUnitsNotRegistered(
  [{ organisasjonsnummer: '917103801', navn: 'Datter AS' }, { organisasjonsnummer: '222222222', navn: 'Annen' }],
  [unit.unit],
);
assert.deepEqual(leftover.map((row) => row.navn), ['Annen']);

const emptyGroup = groupOverview({});
assert.equal(emptyGroup.inKonsern, false);
assert.deepEqual(emptyGroup.summary, ['Ikke registrert i konsern i Enhetsregisteret.']);
assert.equal(emptyGroup.publicCount, 0);

const consultGroup = groupOverview({
  konsern: true,
  morselskap: true,
  parentCompanyName: 'Holdingselskap AS',
  publicUnits: [
    { organisasjonsnummer: '916570783', navn: 'CONSULT1 AS', adresse: 'Svanholmen 7, SANDNES' },
    { organisasjonsnummer: '111111111', navn: 'Annen' },
    { organisasjonsnummer: '222222222', navn: 'Tredje' },
    { organisasjonsnummer: '333333333', navn: 'Fjerde' },
  ],
  registered: [unit.unit, dept.unit],
});
assert.equal(consultGroup.inKonsern, true);
assert.equal(consultGroup.isMorselskap, true);
assert.ok(consultGroup.summary.includes('Selskapet inngår i konsern.'));
assert.ok(consultGroup.summary.includes('Morselskap i siste årsregnskap.'));
assert.equal(consultGroup.summary[2], 'Overordnet selskap: Holdingselskap AS.');
assert.equal(consultGroup.publicCount, 4);
assert.equal(consultGroup.registeredCount, 1);
assert.equal(consultGroup.departmentCount, 1);
assert.equal(consultGroup.preview.length, 3);
assert.equal(consultGroup.preview[0].name, 'CONSULT1 AS');
assert.equal(consultGroup.remaining, 1);

console.log('companyUnits.test.mjs ok');
