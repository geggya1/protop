import assert from 'node:assert/strict';
import {
  addSubUnit,
  createDepartment,
  createUnderenhet,
  departmentsOf,
  findOwnedOrganization,
  linkedCompanyFields,
  normalizeSubUnits,
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

console.log('companyUnits.test.mjs ok');
