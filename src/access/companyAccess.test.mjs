import assert from 'node:assert/strict';
import {
  ACCESS_LEVELS,
  ACCESS_RESOURCES,
  alignCompanyEmployment,
  allows,
  applyOverrides,
  companyTabAllowed,
  compactOverrides,
  effectiveLevelId,
  filterCompanyNav,
  grantsEqual,
  grantsForEmployee,
  groupEmployeesByLevel,
  hoursOnAssignedOnly,
  levelGrants,
  levelIsCustom,
  normalizeAccessPolicy,
  placedLevelId,
  resetLevel,
  resolveActorAccess,
  setLevelGrant,
  standardGrants,
  suggestedLevelId,
  toggleGrant,
} from './companyAccess.js';
import { companyNavItems } from '../navigation/shellModules.js';

const ids = ACCESS_LEVELS.map((level) => level.id);
assert.deepEqual(ids, [
  'regnskap_ekstern',
  'innleie_ekstern',
  'ansatt',
  'avdelingsleder',
  'leder',
  'administrator',
]);

{
  const regnskap = standardGrants('regnskap_ekstern');
  assert.equal(regnskap.economy, 'read');
  assert.equal(regnskap.projects, 'none');
  assert.equal(regnskap.hours, 'none');
  assert.equal(allows(regnskap, 'economy', 'read'), true);
  assert.equal(allows(regnskap, 'economy', 'write'), false);
  assert.equal(allows(regnskap, 'companyPublic', 'see'), true);
}

{
  const innleie = standardGrants('innleie_ekstern');
  assert.equal(innleie.hours, 'write');
  assert.equal(innleie.assignedProjects, 'read');
  assert.equal(innleie.projects, 'none');
  assert.equal(innleie.economy, 'none');
  assert.equal(innleie.employees, 'none');
  assert.equal(hoursOnAssignedOnly(innleie), true);
  assert.equal(companyTabAllowed('okonomi', null, innleie), false);
  assert.equal(companyTabAllowed('projects', null, innleie), false);
  assert.equal(companyTabAllowed('arbeid', null, innleie), true);
  assert.equal(companyTabAllowed('selskap', null, innleie), true);
  assert.equal(companyTabAllowed('selskap', 'tilgang', innleie), false);
}

{
  const ansatt = standardGrants('ansatt');
  assert.equal(ansatt.projects, 'read');
  assert.equal(ansatt.hours, 'write');
  assert.equal(ansatt.forms, 'write');
  assert.equal(ansatt.ownProfile, 'write');
  assert.equal(ansatt.employees, 'read');
  assert.equal(ansatt.economy, 'none');
  assert.equal(ansatt.customers, 'none');
  assert.equal(hoursOnAssignedOnly(ansatt), false);
}

{
  const lederAvdeling = standardGrants('avdelingsleder');
  assert.equal(lederAvdeling.customers, 'write');
  assert.equal(lederAvdeling.projects, 'write');
  assert.equal(lederAvdeling.employees, 'write');
  assert.equal(lederAvdeling.economy, 'none');
  assert.equal(lederAvdeling.companyProfile, 'read');
  assert.equal(allows(lederAvdeling, 'companyProfile', 'write'), false);
}

{
  const leder = standardGrants('leder');
  assert.equal(leder.economy, 'delete');
  assert.equal(leder.projects, 'delete');
  assert.equal(leder.companyProfile, 'read');
  assert.equal(allows(leder, 'companyProfile', 'write'), false);
  assert.equal(leder.units, 'read');
}

{
  const admin = standardGrants('administrator');
  for (const resource of ACCESS_RESOURCES) {
    assert.equal(admin[resource.id], 'delete', resource.id);
  }
}

assert.equal(toggleGrant('none', 'read', true), 'read');
assert.equal(toggleGrant('delete', 'see', false), 'none');
assert.equal(toggleGrant('delete', 'write', false), 'read');
assert.equal(toggleGrant('read', 'delete', true), 'delete');

{
  const custom = setLevelGrant(null, 'ansatt', 'economy', 'read');
  assert.equal(levelIsCustom(custom, 'ansatt'), true);
  assert.equal(levelGrants(custom, 'ansatt').economy, 'read');
  assert.equal(levelGrants(custom, 'ansatt').projects, 'read');
  assert.equal(levelIsCustom(custom, 'leder'), false);
  const reset = resetLevel(custom, 'ansatt');
  assert.equal(levelIsCustom(reset, 'ansatt'), false);
  assert.deepEqual(normalizeAccessPolicy(reset).levels, {});
}

{
  const base = standardGrants('ansatt');
  const effective = { ...base, economy: 'read', projects: 'none' };
  const diff = compactOverrides(base, effective);
  assert.deepEqual(diff, { economy: 'read', projects: 'none' });
  assert.equal(applyOverrides(base, diff).economy, 'read');
  assert.equal(applyOverrides(base, diff).projects, 'none');
  assert.equal(grantsEqual(applyOverrides(base, {}), base), true);
}

{
  const employee = {
    personUid: 'u1',
    company: { accessRole: 'Leder', personnelKind: 'staff', status: 'active', employmentType: 'Fast ansatt' },
  };
  assert.equal(placedLevelId(employee), 'leder');
  assert.equal(effectiveLevelId(employee), 'leder');
  const external = {
    company: { personnelKind: 'external', employmentType: 'Fast ansatt', status: 'active', accessRole: 'Lesetilgang' },
  };
  assert.equal(placedLevelId(external), '');
  assert.equal(suggestedLevelId(external), 'regnskap_ekstern');
  assert.equal(effectiveLevelId(external), 'regnskap_ekstern');
  const hired = {
    company: { personnelKind: 'innleid', employmentType: 'Fast ansatt', status: 'active' },
  };
  assert.equal(suggestedLevelId(hired), 'innleie_ekstern');
  const aligned = alignCompanyEmployment({
    accessLevel: 'innleie_ekstern',
    personnelKind: 'staff',
    employmentType: 'Fast ansatt',
    external: false,
  });
  assert.equal(aligned.personnelKind, 'innleid');
  assert.equal(aligned.employmentType, 'Innleid');
  assert.equal(aligned.external, false);
}

{
  const ada = {
    id: 'ada',
    personUid: 'ada',
    company: { accessRole: 'Medarbeider', status: 'active', personnelKind: 'staff' },
  };
  const kari = {
    id: 'kari',
    personUid: 'kari',
    company: { accessRole: 'Lesetilgang', status: 'active', personnelKind: 'external', employmentType: 'Ekstern' },
  };
  const nils = {
    id: 'nils',
    personUid: 'nils',
    company: {
      accessLevel: 'administrator',
      accessRole: 'Administrator',
      status: 'active',
      accessOverrides: { economy: 'read' },
    },
  };
  const grouped = groupEmployeesByLevel([ada, kari, nils]);
  assert.equal(grouped.buckets.ansatt.length, 1);
  assert.equal(grouped.buckets.administrator.length, 1);
  assert.equal(grouped.unplaced.length, 1);
  assert.equal(grouped.buckets.ansatt.includes(kari), false);
  const actor = resolveActorAccess({ employees: [ada, nils], uid: 'nils' });
  assert.equal(actor.levelId, 'administrator');
  assert.equal(actor.grants.economy, 'read');
  assert.equal(actor.customized, true);
  assert.equal(actor.grants.projects, 'delete');
  const guest = resolveActorAccess({ employees: [ada], uid: 'ukjent' });
  assert.equal(guest.levelId, 'ansatt');
  const stopped = resolveActorAccess({
    employees: [{ personUid: 'x', company: { status: 'inactive', accessLevel: 'administrator' } }],
    uid: 'x',
  });
  assert.equal(stopped.grants.economy, 'none');
  assert.equal(stopped.grants.companyPublic, 'read');
  assert.equal(grantsForEmployee(null, kari).economy, 'read');
}

{
  const innleie = standardGrants('innleie_ekstern');
  const visible = filterCompanyNav(companyNavItems(), innleie).map((item) => item.id);
  assert.deepEqual(visible, ['selskap', 'arbeid']);
  const admin = filterCompanyNav(companyNavItems(), standardGrants('administrator')).map((item) => item.id);
  assert.ok(admin.includes('okonomi'));
  assert.ok(admin.includes('ansatte'));
  const selskap = filterCompanyNav(companyNavItems(), standardGrants('administrator'))
    .find((item) => item.id === 'selskap');
  assert.deepEqual(selskap.children.map((child) => child.id), ['underenheter', 'tilgang']);
  const ansattNav = filterCompanyNav(companyNavItems(), standardGrants('ansatt'))
    .find((item) => item.id === 'selskap');
  assert.deepEqual(ansattNav.children.map((child) => child.id), ['underenheter']);
}

console.log('companyAccess.test.mjs: ok');
