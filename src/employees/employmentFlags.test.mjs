import assert from 'node:assert/strict';
import { ACCESS_LEVELS, standardGrants, allows } from '../access/companyAccess.js';
import { employmentFlags, kindOf } from './employmentFlags.js';

const expectByLevel = {
  regnskap_ekstern: { bucket: 'external', capacity: false, consultant: true, rules: true },
  innleie_ekstern: { bucket: 'innleid', capacity: false, consultant: false, rules: false },
  ansatt: { bucket: 'staff', capacity: true, consultant: false, rules: false },
  tilbud: { bucket: 'staff', capacity: true, consultant: false, rules: false },
  ansatt_andre_avdelinger: { bucket: 'external', capacity: false, consultant: false, rules: true },
  avdelingsleder: { bucket: 'staff', capacity: true, consultant: false, rules: false },
  leder: { bucket: 'staff', capacity: true, consultant: false, rules: false },
  administrator: { bucket: 'staff', capacity: true, consultant: false, rules: false },
  // Fagansvar endrer ikke personellgruppen; den kommer fra det vanlige nivået.
  hms_ansvarlig: { bucket: 'staff', capacity: true, consultant: false, rules: false },
  kvalitetsansvarlig: { bucket: 'staff', capacity: true, consultant: false, rules: false },
  hr_ansvarlig: { bucket: 'staff', capacity: true, consultant: false, rules: false },
};

for (const level of ACCESS_LEVELS) {
  const employee = {
    company: { personnelKind: 'staff', accessLevel: level.id, status: 'active' },
  };
  const flags = employmentFlags(employee);
  const expect = expectByLevel[level.id];
  assert.equal(kindOf(employee), expect.bucket, level.id);
  assert.equal(flags.includeInCapacity, expect.capacity, `${level.id} capacity`);
  assert.equal(flags.externalConsultant, expect.consultant, `${level.id} consultant`);
  assert.equal(flags.externalRules, expect.rules, `${level.id} rules`);
  const grants = standardGrants(level.id);
  if (flags.includeInCapacity && level.section !== 'specialist') {
    // Begrenset redigering (read) eller Admin (write) på egne timer.
    assert.equal(allows(grants, 'hours', 'read'), true, `${level.id} edits own hours`);
  }
  if (level.id === 'regnskap_ekstern') assert.equal(allows(grants, 'economy', 'write'), false);
  if (level.id === 'administrator') {
    assert.equal(allows(grants, 'companyProfile', 'write'), true);
    assert.equal(allows(grants, 'companyProfile', 'delete'), true);
  }
  if (level.id === 'leder') {
    assert.equal(allows(grants, 'companyProfile', 'write'), false);
    assert.equal(allows(grants, 'economy', 'write'), true);
  }
}

assert.equal(kindOf({ company: { personnelKind: 'external', accessLevel: 'ansatt' } }), 'staff');
assert.equal(kindOf({ company: { personnelKind: 'staff', accessLevel: 'regnskap_ekstern' } }), 'external');

// Flernivå: bare eksterne nivå huket av gir ikke intern ansatt, selv om enkeltnivået er tomt.
assert.equal(kindOf({ company: { personnelKind: 'staff', accessLevels: ['regnskap_ekstern'], accessLevel: '' } }), 'external');
assert.equal(kindOf({ company: { accessLevels: ['ansatt'], accessLevel: '' } }), 'staff');

// Ansatt + fagansvar: fortsatt intern ansatt, og ekstern + fagansvar fortsatt ekstern.
assert.equal(kindOf({ company: { accessLevels: ['hr_ansvarlig', 'ansatt'], accessLevel: 'ansatt' } }), 'staff');
assert.equal(kindOf({ company: { accessLevels: ['hms_ansvarlig', 'regnskap_ekstern'], accessLevel: 'regnskap_ekstern' } }), 'external');

console.log('employmentFlags.test.mjs: ok');
