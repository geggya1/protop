import assert from 'node:assert/strict';
import {
  ACCESS_LEVELS,
  ACCESS_RESOURCES,
  accessLevelSections,
  accessSectionTitle,
  accountDeactivated,
  personDropChange,
  alignCompanyEmployment,
  allows,
  applyOverrides,
  companyTabAllowed,
  effectiveViewAsScope,
  grantsForViewAs,
  resolveViewAsAccess,
  viewAsAllows,
  viewAsCapability,
  viewAsLocks,
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
import { companyModuleVisibility, hiddenCompanyModules } from './viewAsNav.js';

const ids = ACCESS_LEVELS.map((level) => level.id);
assert.deepEqual(ids, [
  'regnskap_ekstern',
  'innleie_ekstern',
  'ansatt',
  'tilbud',
  'ansatt_andre_avdelinger',
  'avdelingsleder',
  'leder',
  'administrator',
]);
const sections = accessLevelSections();
assert.deepEqual(sections.map((section) => section.id), ['company', 'external']);
assert.deepEqual(sections[0].levels.map((level) => level.order), [3, 4, 6, 7, 8]);
assert.deepEqual(sections[1].levels.map((level) => level.order), [1, 2, 5]);
assert.equal(accessSectionTitle('company', 'CONSULT1 AS'), 'Ansatt i CONSULT1 AS');
assert.equal(accessSectionTitle('company', '  '), 'Ansatt i bedriften');
assert.equal(accessSectionTitle('external', 'CONSULT1 AS'), 'Eksternt');

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
  assert.equal(ansatt.offers, 'none');
  assert.equal(ansatt.units, 'see');
  assert.equal(ansatt.viewAs, 'none');
  assert.equal(viewAsCapability(ansatt), 'none');
}

{
  const tilbud = standardGrants('tilbud');
  assert.equal(tilbud.offers, 'write');
  assert.equal(tilbud.tenders, 'read');
  assert.equal(tilbud.customers, 'read');
  assert.equal(tilbud.contracts, 'read');
  assert.equal(tilbud.economy, 'none');
  assert.equal(tilbud.companyProfile, 'none');
  assert.equal(allows(tilbud, 'offers', 'write'), true);
  assert.equal(allows(tilbud, 'tenders', 'write'), false);
  assert.equal(companyTabAllowed('anbud', 'tilbud', tilbud), true);
  assert.equal(companyTabAllowed('anbud', 'varsling', tilbud), true);
  assert.equal(companyTabAllowed('okonomi', null, tilbud), false);
}

{
  const andre = standardGrants('ansatt_andre_avdelinger');
  assert.equal(andre.units, 'read');
  assert.equal(allows(andre, 'units', 'write'), false);
  assert.equal(andre.employees, 'read');
  assert.equal(andre.projects, 'read');
  assert.equal(andre.hours, 'write');
  assert.equal(andre.hoursOthers, 'see');
  assert.equal(allows(andre, 'hoursOthers', 'write'), false);
  assert.equal(andre.customers, 'none');
  assert.equal(andre.offers, 'none');
  assert.equal(andre.economy, 'none');
  assert.equal(companyTabAllowed('underenheter', null, andre), true);
  assert.equal(companyTabAllowed('anbud', null, andre), false);
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
  assert.equal(leder.viewAs, 'write');
  assert.equal(viewAsCapability(leder), 'all');
  assert.equal(viewAsCapability(standardGrants('avdelingsleder')), 'none');
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
  assert.equal(placedLevelId({ company: { accessRole: 'Tilbud' } }), 'tilbud');
  assert.equal(placedLevelId({ company: { accessRole: 'Ansatt andre avdelinger' } }), 'ansatt_andre_avdelinger');
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
  assert.equal(accountDeactivated(ada), false);
  assert.equal(accountDeactivated({ company: { status: 'leave' } }), false);
  const paused = {
    id: 'eva',
    company: { accessLevel: 'ansatt', status: 'inactive', personnelKind: 'staff' },
  };
  const trashed = {
    id: 'ola',
    company: { accessLevel: 'ansatt', status: 'deleted', personnelKind: 'staff' },
  };
  const withPaused = groupEmployeesByLevel([ada, paused, trashed]);
  assert.equal(withPaused.buckets.ansatt.length, 3);
  assert.equal(accountDeactivated(paused), true);
  assert.equal(accountDeactivated(trashed), true);
  const staff = { company: { accessLevel: 'ansatt', status: 'active', personnelKind: 'staff' } };
  assert.deepEqual(personDropChange(staff, 'level:tilbud'), {
    levelId: 'tilbud', clearLevel: false, activate: false, deactivate: false,
  });
  assert.equal(personDropChange(staff, 'level:ansatt'), null);
  assert.deepEqual(personDropChange(staff, 'status:ansatt:inactive'), {
    levelId: '', clearLevel: false, activate: false, deactivate: true,
  });
  assert.deepEqual(personDropChange(paused, 'status:tilbud:active'), {
    levelId: 'tilbud', clearLevel: false, activate: true, deactivate: false,
  });
  assert.equal(personDropChange(paused, 'status:ansatt:inactive'), null);
  assert.deepEqual(personDropChange(staff, 'status:unplaced:active'), {
    levelId: '', clearLevel: true, activate: false, deactivate: false,
  });
  assert.equal(personDropChange(staff, 'level:ukjent'), null);
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
  const tilbudNav = filterCompanyNav(companyNavItems(), standardGrants('tilbud'))
    .find((item) => item.id === 'anbud');
  assert.deepEqual(tilbudNav.children.map((child) => child.id), ['anbud-varsling', 'anbud-foresporsel', 'anbud-tilbud']);
  const offersOnly = { ...standardGrants('tilbud'), tenders: 'none' };
  const offersNav = filterCompanyNav(companyNavItems(), offersOnly)
    .find((item) => item.id === 'anbud');
  assert.deepEqual(offersNav.children.map((child) => child.id), ['anbud-tilbud']);
  assert.equal(offersNav.action.subView, 'tilbud');
  const andreNav = filterCompanyNav(companyNavItems(), standardGrants('ansatt_andre_avdelinger')).map((item) => item.id);
  assert.ok(andreNav.includes('underenheter') === false);
  assert.ok(andreNav.includes('projects'));
  assert.equal(andreNav.includes('anbud'), false);
  assert.equal(andreNav.includes('okonomi'), false);
  const andreSelskap = filterCompanyNav(companyNavItems(), standardGrants('ansatt_andre_avdelinger'))
    .find((item) => item.id === 'selskap');
  assert.deepEqual(andreSelskap.children.map((child) => child.id), ['underenheter']);
}

{
  const actor = resolveActorAccess({ bypass: true });
  const ansatt = {
    id: 'kari',
    company: { accessLevel: 'ansatt', status: 'active' },
  };
  const narrowed = resolveViewAsAccess({
    actor, targetEmployee: ansatt, policy: null, lens: 'companySettings',
  });
  assert.equal(narrowed.active, true);
  assert.equal(narrowed.scope, 'companySettings');
  assert.equal(narrowed.grants.companyProfile, 'none');
  assert.equal(narrowed.grants.economy, 'delete');
  assert.equal(narrowed.grants.viewAs, 'delete');
  assert.equal(viewAsLocks(narrowed, 'units'), true);
  assert.equal(viewAsLocks(narrowed, 'economy'), false);
  assert.equal(viewAsAllows({
    preview: narrowed, actor, bypass: true, resource: 'companyProfile', action: 'write',
  }), false);
  assert.equal(viewAsAllows({
    preview: narrowed, actor, bypass: true, resource: 'companyProfile', action: 'read',
  }), false);
  assert.equal(viewAsAllows({
    preview: narrowed, actor, bypass: true, resource: 'economy', action: 'delete',
  }), true);
  const selskap = filterCompanyNav(companyNavItems(), narrowed.grants)
    .find((item) => item.id === 'selskap');
  assert.deepEqual(selskap.children.map((child) => child.id), ['underenheter']);
  assert.ok(filterCompanyNav(companyNavItems(), narrowed.grants).some((item) => item.id === 'okonomi'));

  const full = resolveViewAsAccess({
    actor, targetEmployee: ansatt, policy: null, lens: 'all',
  });
  assert.equal(full.scope, 'all');
  assert.equal(full.grants.economy, 'none');
  assert.equal(full.grants.projects, 'read');
  assert.equal(viewAsAllows({
    preview: full, actor, bypass: true, resource: 'economy', action: 'write',
  }), false);
  assert.equal(viewAsAllows({
    preview: full, actor, bypass: true, resource: 'projects', action: 'read',
  }), true);
  const fullIds = filterCompanyNav(companyNavItems(), full.grants).map((item) => item.id);
  assert.equal(fullIds.includes('okonomi'), false);
  assert.equal(fullIds.includes('projects'), true);
  const hidden = hiddenCompanyModules(full.grants).map((row) => row.id);
  assert.ok(hidden.includes('okonomi'));
  assert.ok(hidden.includes('tilgang'));
  assert.equal(hidden.includes('anbud-varsling'), false);
}

{
  const policy = setLevelGrant(null, 'ansatt', 'viewAs', 'see');
  const viewer = {
    id: 'ida',
    personUid: 'ida',
    company: { accessLevel: 'ansatt', status: 'active' },
  };
  const actor = resolveActorAccess({ policy, employees: [viewer], uid: 'ida' });
  assert.equal(viewAsCapability(actor.grants), 'companySettings');
  assert.equal(effectiveViewAsScope('companySettings', 'all'), 'companySettings');
  const boss = {
    id: 'bo',
    company: { accessLevel: 'administrator', status: 'active' },
  };
  const preview = resolveViewAsAccess({
    actor, targetEmployee: boss, policy, lens: 'all',
  });
  assert.equal(preview.scope, 'companySettings');
  assert.equal(preview.grants.companyProfile, 'delete');
  assert.equal(preview.grants.economy, 'none');
  assert.equal(preview.grants.viewAs, 'see');
  assert.equal(companyTabAllowed('selskap', 'tilgang', preview.grants), true);
  assert.equal(companyTabAllowed('selskap', 'tilgang', actor.grants), false);
  assert.equal(viewAsAllows({
    preview, actor, bypass: false, resource: 'companyProfile', action: 'read',
  }), false);
  assert.equal(viewAsAllows({
    preview, actor, bypass: false, resource: 'companyProfile', action: 'write',
  }), false);
  const blocked = resolveViewAsAccess({
    actor: resolveActorAccess({ employees: [viewer], uid: 'ida' }),
    targetEmployee: boss,
    policy: null,
    lens: 'all',
  });
  assert.equal(blocked.active, false);
  assert.equal(viewAsCapability(blocked.grants), 'none');
  const viaPerson = resolveActorAccess({
    employees: [{
      id: 'ida',
      personUid: 'ida',
      company: { accessLevel: 'ansatt', status: 'active', accessOverrides: { viewAs: 'see' } },
    }],
    uid: 'ida',
  });
  assert.equal(viewAsCapability(viaPerson.grants), 'companySettings');
  assert.equal(viaPerson.grants.economy, 'none');
}

{
  const deleted = { id: 'x', company: { accessLevel: 'ansatt', status: 'deleted' } };
  const skipped = resolveViewAsAccess({
    actor: resolveActorAccess({ bypass: true }),
    targetEmployee: deleted,
    policy: null,
    lens: 'all',
  });
  assert.equal(skipped.active, false);
  assert.equal(skipped.grants, null);
}

{
  const rows = companyModuleVisibility(standardGrants('ansatt'));
  assert.equal(rows.find((row) => row.id === 'tilgang').visible, false);
  assert.equal(rows.find((row) => row.id === 'selskap').visible, true);
  assert.equal(rows.find((row) => row.id === 'okonomi').visible, false);
  const readOnly = grantsForViewAs(
    standardGrants('leder'),
    standardGrants('ansatt'),
    'all',
  );
  assert.equal(readOnly.viewAs, 'write');
  assert.equal(readOnly.economy, 'none');
}

console.log('companyAccess.test.mjs: ok');
