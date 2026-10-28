import assert from 'node:assert/strict';
import {
  canImportList,
  ACCESS_ACTIONS,
  ACCESS_GROUPS,
  ACCESS_LEVELS,
  ACCESS_RESOURCES,
  RESOURCE_IDS,
  accessLevelSections,
  accessSectionTitle,
  accountDeactivated,
  personDropChange,
  alignCompanyEmployment,
  allows,
  allowsEffective,
  allowsEconomy,
  applyOverrides,
  canAdminResource,
  canEditResource,
  canViewResource,
  companyTabAllowed,
  resolveViewAsAccess,
  viewAsAllows,
  viewAsCapability,
  viewAsLocks,
  compactOverrides,
  effectiveLevelId,
  filterCompanyNav,
  grantsEqual,
  employeeLevelIds,
  grantsForEmployee,
  grantsForLevelIds,
  groupEmployeesByLevel,
  hoursOnAssignedOnly,
  levelGrants,
  levelIsCustom,
  normalizeAccessPolicy,
  placedLevelId,
  withToggledLevel,
  resetLevel,
  resolveActorAccess,
  setLevelGrant,
  standardGrants,
  suggestedLevelId,
  toggleGrant,
} from './companyAccess.js';
import { companyNavItems } from '../navigation/shellModules.js';
import { hiddenCompanyModules } from './viewAsNav.js';

{
  assert.deepEqual(ACCESS_ACTIONS.map((row) => row.label), [
    'Lese',
    'Begrenset redigering',
    'Admin',
  ]);
  const ids = ACCESS_RESOURCES.map((row) => row.id);
  assert.ok(!ids.includes('economy'), 'economy er skjult i matrisen');
  assert.ok(RESOURCE_IDS.includes('economy'));
  for (const key of [
    'accessControl', 'absence', 'absenceSettings', 'hoursReport', 'productivity',
    'equipment', 'mileage', 'productSales', 'economyOverview', 'economySettings',
    'tenderRequest', 'tenderSettings', 'hrPeople', 'iso', 'forms',
  ]) {
    assert.ok(ids.includes(key), key);
  }
  assert.ok(ACCESS_GROUPS.some((group) => group.id === 'resources'));
  assert.ok(ACCESS_GROUPS.some((group) => group.id === 'quality'));
}

{
  // Eldre policy (actionsVersion < 2): write → begrenset redigering, delete → Admin.
  const legacy = {
    version: 1,
    actionsVersion: 1,
    levels: {
      ansatt: {
        hours: 'write',
        economy: 'delete',
        companyProfile: 'write',
        tenders: 'write',
      },
    },
  };
  const migrated = levelGrants(legacy, 'ansatt');
  assert.equal(migrated.hours, 'read');
  assert.equal(migrated.economy, 'write');
  assert.equal(migrated.economyOverview, 'write');
  assert.equal(migrated.companyProfile, 'read');
  assert.equal(migrated.accessControl, 'read');
  assert.equal(migrated.tenders, 'read');
  assert.equal(migrated.tenderRequest, 'read');
  assert.equal(allowsEconomy(migrated, 'write'), true);
}

const ids = ACCESS_LEVELS.map((level) => level.id);
assert.deepEqual(ids, [
  'hms_ansvarlig',
  'kvalitetsansvarlig',
  'hr_ansvarlig',
  'iso_rolle',
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
assert.deepEqual(sections.map((section) => section.id), ['company', 'specialist', 'external']);
assert.deepEqual(sections[0].levels.map((level) => level.order), [3, 4, 6, 7, 8]);
assert.deepEqual(sections[1].levels.map((level) => level.order), [9, 10, 11, 12]);
assert.deepEqual(sections[2].levels.map((level) => level.order), [1, 2, 5]);
assert.equal(accessSectionTitle('specialist', 'CONSULT1 AS'), 'Fagansvar (i tillegg til nivået)');
assert.equal(accessSectionTitle('company', 'CONSULT1 AS'), 'Ansatt i CONSULT1 AS');
assert.equal(accessSectionTitle('external', 'CONSULT1 AS'), 'Eksternt');

{
  const regnskap = standardGrants('regnskap_ekstern');
  assert.equal(regnskap.economy, 'see');
  assert.equal(regnskap.economyOverview, 'see');
  assert.equal(regnskap.projects, 'none');
  assert.equal(regnskap.hours, 'none');
  assert.equal(allows(regnskap, 'economy', 'see'), true);
  assert.equal(canEditResource(regnskap, 'economy'), false);
  assert.equal(canAdminResource(regnskap, 'economySettings'), false);
  assert.equal(allows(regnskap, 'companyPublic', 'see'), true);
}

{
  const innleie = standardGrants('innleie_ekstern');
  assert.equal(innleie.hours, 'read');
  assert.equal(innleie.assignedProjects, 'see');
  assert.equal(innleie.projects, 'none');
  assert.equal(innleie.economy, 'none');
  assert.equal(innleie.employees, 'none');
  assert.equal(hoursOnAssignedOnly(innleie), true);
  assert.equal(canEditResource(innleie, 'hours'), true);
  assert.equal(canAdminResource(innleie, 'hours'), false);
  assert.equal(companyTabAllowed('okonomi', null, innleie), false);
  assert.equal(companyTabAllowed('okonomi', 'oversikt', innleie), false);
  // Tildelte prosjekt gir Prosjekt-siden, med bare egne prosjekter.
  assert.equal(companyTabAllowed('projects', null, innleie), true);
  assert.equal(companyTabAllowed('arbeid', null, innleie), true);
  assert.equal(companyTabAllowed('arbeid', 'utlegg', innleie), true);
  assert.equal(companyTabAllowed('selskap', null, innleie), true);
  assert.equal(companyTabAllowed('selskap', 'tilgang', innleie), false);
  assert.equal(companyTabAllowed('selskap', 'innstillinger', innleie), false);
  assert.equal(innleie.economyProjectExpenses, 'read');
  assert.equal(innleie.productivity, 'read');
  assert.equal(innleie.equipment, 'see');
}

{
  const ansatt = standardGrants('ansatt');
  assert.equal(ansatt.projects, 'see');
  assert.equal(ansatt.hours, 'read');
  assert.equal(ansatt.forms, 'read');
  assert.equal(ansatt.ownProfile, 'read');
  assert.equal(ansatt.employees, 'see');
  assert.equal(ansatt.economy, 'none');
  assert.equal(ansatt.customers, 'none');
  assert.equal(hoursOnAssignedOnly(ansatt), false);
  assert.equal(ansatt.offers, 'none');
  assert.equal(ansatt.units, 'see');
  assert.equal(ansatt.viewAs, 'none');
  assert.equal(canEditResource(ansatt, 'hours'), true);
  assert.equal(canAdminResource(ansatt, 'hours'), false);
  assert.equal(canAdminResource(ansatt, 'absenceSettings'), false);
  assert.equal(viewAsCapability(ansatt), 'none');
}

{
  const tilbud = standardGrants('tilbud');
  assert.equal(tilbud.offers, 'read');
  assert.equal(tilbud.tenders, 'see');
  assert.equal(tilbud.customers, 'see');
  assert.equal(tilbud.contracts, 'see');
  assert.equal(tilbud.economy, 'none');
  assert.equal(tilbud.companyProfile, 'none');
  assert.equal(canEditResource(tilbud, 'offers'), true);
  assert.equal(canAdminResource(tilbud, 'offers'), false);
  assert.equal(canAdminResource(tilbud, 'tenderSettings'), false);
  assert.equal(companyTabAllowed('anbud', 'tilbud', tilbud), true);
  assert.equal(companyTabAllowed('anbud', 'varsling', tilbud), true);
  assert.equal(companyTabAllowed('anbud', 'innstillinger', tilbud), false);
  assert.equal(companyTabAllowed('anbud', 'vurdering', {
    ...tilbud,
    tenders: 'none',
    tenderRequest: 'none',
    tenderReview: 'none',
  }), false);
  assert.equal(companyTabAllowed('okonomi', 'oversikt', tilbud), false);
}

{
  const andre = standardGrants('ansatt_andre_avdelinger');
  assert.equal(andre.units, 'see');
  assert.equal(canEditResource(andre, 'units'), false);
  assert.equal(andre.hours, 'read');
  assert.equal(andre.hoursOthers, 'see');
  assert.equal(canEditResource(andre, 'hoursOthers'), false);
  assert.equal(companyTabAllowed('underenheter', null, andre), true);
  assert.equal(companyTabAllowed('anbud', null, andre), false);
}

{
  const avd = standardGrants('avdelingsleder');
  assert.equal(avd.customers, 'read');
  assert.equal(avd.projects, 'read');
  assert.equal(avd.employees, 'read');
  assert.equal(avd.economy, 'none');
  assert.equal(avd.companyProfile, 'see');
  assert.equal(canAdminResource(avd, 'companyProfile'), false);
  assert.equal(canEditResource(avd, 'projects'), true);
  assert.equal(canAdminResource(avd, 'projects'), false);
  assert.equal(canAdminResource(avd, 'absenceSettings'), false);
  assert.equal(canAdminResource(avd, 'economySettings'), false);
}

{
  const leder = standardGrants('leder');
  assert.equal(leder.economy, 'write');
  assert.equal(leder.projects, 'write');
  assert.equal(leder.companyProfile, 'see');
  assert.equal(canAdminResource(leder, 'companyProfile'), false);
  assert.equal(canAdminResource(leder, 'economySettings'), true);
  assert.equal(canAdminResource(leder, 'absenceSettings'), true);
  assert.equal(leder.units, 'write');
  assert.equal(leder.viewAs, 'write');
  assert.equal(viewAsCapability(leder), 'all');
  assert.equal(viewAsCapability(standardGrants('avdelingsleder')), 'none');
  assert.equal(allows(leder, 'projects', 'delete'), true);
}

{
  const admin = standardGrants('administrator');
  for (const resource of ACCESS_RESOURCES) {
    assert.equal(admin[resource.id], 'write', resource.id);
  }
  assert.equal(admin.economy, 'write');
  assert.equal(canAdminResource(admin, 'accessControl'), true);
  assert.equal(canAdminResource(admin, 'companyProfile'), true);
}

assert.equal(toggleGrant('none', 'read', true), 'read');
assert.equal(toggleGrant('write', 'see', false), 'none');
assert.equal(toggleGrant('write', 'write', false), 'read');
assert.equal(toggleGrant('read', 'write', true), 'write');

{
  const custom = setLevelGrant(null, 'ansatt', 'economyOverview', 'see');
  assert.equal(levelIsCustom(custom, 'ansatt'), true);
  assert.equal(levelGrants(custom, 'ansatt').economyOverview, 'see');
  assert.equal(levelGrants(custom, 'ansatt').economy, 'see');
  assert.equal(levelIsCustom(custom, 'leder'), false);
  const reset = resetLevel(custom, 'ansatt');
  assert.equal(levelIsCustom(reset, 'ansatt'), false);
  assert.deepEqual(normalizeAccessPolicy(reset).levels, {});
  assert.equal(normalizeAccessPolicy(reset).actionsVersion, 2);
}

{
  const base = standardGrants('ansatt');
  const effective = { ...base, economyOverview: 'see', projects: 'none' };
  const diff = compactOverrides(base, effective);
  assert.deepEqual(diff, { economyOverview: 'see', projects: 'none' });
  assert.equal(applyOverrides(base, diff).economyOverview, 'see');
  assert.equal(grantsEqual(applyOverrides(base, {}), base), true);
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
      accessOverrides: { economyOverview: 'see' },
    },
  };
  const grouped = groupEmployeesByLevel([ada, kari, nils]);
  assert.equal(grouped.buckets.ansatt.length, 1);
  assert.equal(grouped.buckets.administrator.length, 1);
  assert.equal(grouped.unplaced.length, 1);
  assert.equal(accountDeactivated(ada), false);
  const paused = {
    id: 'eva',
    company: { accessLevel: 'ansatt', status: 'inactive', personnelKind: 'staff' },
  };
  const actor = resolveActorAccess({ employees: [ada, nils], uid: 'nils' });
  assert.equal(actor.levelId, 'administrator');
  assert.equal(actor.grants.economyOverview, 'see');
  assert.equal(actor.customized, true);
  assert.equal(actor.grants.projects, 'write');
  assert.equal(grantsForEmployee(null, kari).economy, 'see');
  assert.equal(grantsForEmployee(null, paused).companyPublic, 'none');
  assert.deepEqual(employeeLevelIds(paused), ['ansatt']);
  assert.equal(placedLevelId({ company: { accessRole: 'Tilbud' } }), 'tilbud');
  assert.equal(effectiveLevelId({ company: { personnelKind: 'innleid' } }), 'innleie_ekstern');
  const aligned = alignCompanyEmployment({
    accessLevel: 'innleie_ekstern',
    personnelKind: 'staff',
    employmentType: 'Fast ansatt',
    external: false,
  });
  assert.equal(aligned.personnelKind, 'innleid');
  assert.deepEqual(personDropChange(
    { company: { accessLevel: 'ansatt', status: 'active' } },
    'level:tilbud',
  ), { levelId: 'tilbud', clearLevel: false, activate: false, deactivate: false });
  assert.deepEqual(withToggledLevel(ada, 'tilbud', true).company.accessLevels, ['ansatt', 'tilbud']);
  assert.deepEqual(grantsForLevelIds(null, ['ansatt', 'tilbud']).offers, 'read');
}

{
  const innleie = standardGrants('innleie_ekstern');
  const visible = filterCompanyNav(companyNavItems(), innleie).map((item) => item.id);
  assert.deepEqual(visible, ['selskap', 'fravaer', 'arbeid', 'produktivitet', 'projects', 'produkt', 'utstyr', 'okonomi']);
  assert.equal(visible.includes('kjorebok'), false);
  assert.equal(visible.includes('selskapsinnstillinger'), false);
  const innleieOkonomi = filterCompanyNav(companyNavItems(), innleie).find((item) => item.id === 'okonomi');
  assert.deepEqual(innleieOkonomi.children.map((child) => child.id), ['okonomi-prosjektutlegg']);
  const innleieFravaer = filterCompanyNav(companyNavItems(), innleie).find((item) => item.id === 'fravaer');
  assert.deepEqual(innleieFravaer.children.map((child) => child.id), ['fravaer-fravaer', 'fravaer-fravaersrapport', 'fravaer-planlagt']);

  const adminNav = filterCompanyNav(companyNavItems(), standardGrants('administrator'));
  assert.ok(adminNav.some((item) => item.id === 'okonomi'));
  assert.ok(adminNav.some((item) => item.id === 'kjorebok'));
  assert.ok(adminNav.some((item) => item.id === 'selskapsinnstillinger'));
  assert.ok(adminNav.some((item) => item.id === 'hr'));
  const adminSettings = adminNav.find((item) => item.id === 'selskapsinnstillinger');
  assert.deepEqual(adminSettings.children.map((child) => child.id), ['selskapsinnstillinger-moduler', 'selskapsinnstillinger-tilgang']);
  const adminOkonomi = adminNav.find((item) => item.id === 'okonomi');
  assert.ok(adminOkonomi.children.some((child) => child.id === 'okonomi-innstillinger'));
  assert.ok(adminOkonomi.children.some((child) => child.id === 'okonomi-oversikt'));

  const ansattNav = filterCompanyNav(companyNavItems(), standardGrants('ansatt')).map((item) => item.id);
  assert.ok(ansattNav.includes('selskap'));
  assert.ok(ansattNav.includes('ansatte'));
  assert.ok(ansattNav.includes('fravaer'));
  assert.equal(ansattNav.includes('selskapsinnstillinger'), false);

  const avd = standardGrants('avdelingsleder');
  assert.equal(avd.hr, 'see');
  const avdNav = filterCompanyNav(companyNavItems(), avd);
  assert.ok(avdNav.some((item) => item.id === 'hr'));
  assert.equal(avdNav.find((item) => item.id === 'fravaer').children.some((c) => c.id === 'fravaer-innstillinger'), false);
  assert.ok(avdNav.some((item) => item.id === 'selskapsinnstillinger'));

  const lederNav = filterCompanyNav(companyNavItems(), standardGrants('leder'));
  const lederFravaer = lederNav.find((item) => item.id === 'fravaer');
  assert.ok(lederFravaer.children.some((c) => c.id === 'fravaer-innstillinger'));
  const lederOkonomi = lederNav.find((item) => item.id === 'okonomi');
  assert.ok(lederOkonomi.children.some((c) => c.id === 'okonomi-innstillinger'));
  const lederAnbud = lederNav.find((item) => item.id === 'anbud');
  assert.ok(lederAnbud.children.some((c) => c.id === 'anbud-innstillinger'));

  const tilbudNav = filterCompanyNav(companyNavItems(), standardGrants('tilbud')).find((item) => item.id === 'anbud');
  assert.deepEqual(
    tilbudNav.children.map((child) => child.id),
    ['anbud-varsling', 'anbud-foresporsel', 'anbud-vurdering', 'anbud-tilbud'],
  );

  const offersOnly = {
    ...standardGrants('tilbud'),
    tenders: 'none',
    tenderRequest: 'none',
    tenderReview: 'none',
    tenderSettings: 'none',
  };
  const offersNav = filterCompanyNav(companyNavItems(), offersOnly).find((item) => item.id === 'anbud');
  assert.deepEqual(offersNav.children.map((child) => child.id), ['anbud-tilbud']);
}

/** Bot-matrise: hvert nivå × synlighet for nøkkelmoduler. */
{
  const expectations = {
    regnskap_ekstern: {
      show: ['selskap', 'okonomi', 'kjorebok'],
      hide: ['ansatte', 'hr', 'anbud', 'projects', 'selskapsinnstillinger', 'fravaer-innstillinger'],
      edit: [],
      admin: [],
    },
    innleie_ekstern: {
      show: ['selskap', 'arbeid', 'fravaer', 'produktivitet', 'utstyr'],
      hide: ['ansatte', 'hr', 'anbud', 'kjorebok', 'selskapsinnstillinger'],
      edit: ['hours', 'absence'],
      admin: [],
    },
    ansatt: {
      show: ['selskap', 'ansatte', 'arbeid', 'fravaer', 'projects', 'iso'],
      hide: ['hr', 'anbud', 'kjorebok', 'selskapsinnstillinger'],
      edit: ['hours', 'forms', 'ownProfile'],
      admin: [],
    },
    tilbud: {
      show: ['anbud', 'kunder', 'kontrakt', 'projects'],
      hide: ['hr', 'kjorebok', 'selskapsinnstillinger'],
      edit: ['offers', 'forms', 'hours'],
      admin: [],
    },
    ansatt_andre_avdelinger: {
      show: ['underenheter', 'ansatte', 'arbeid', 'projects'],
      hide: ['anbud', 'hr', 'kjorebok'],
      edit: ['hours', 'forms'],
      admin: [],
    },
    avdelingsleder: {
      show: ['hr', 'ansatte', 'projects', 'kunder', 'selskapsinnstillinger'],
      hide: ['kjorebok'],
      edit: ['employees', 'projects', 'customers', 'hoursOthers'],
      admin: [],
    },
    leder: {
      show: ['hr', 'okonomi', 'kjorebok', 'anbud', 'selskapsinnstillinger'],
      hide: [],
      edit: [],
      admin: ['economySettings', 'absenceSettings', 'tenderSettings', 'hr', 'employees', 'projects'],
    },
    administrator: {
      show: ['selskapsinnstillinger', 'hr', 'okonomi', 'kjorebok', 'anbud'],
      hide: [],
      edit: [],
      admin: ['companyProfile', 'accessControl', 'economySettings', 'absenceSettings', 'employees'],
    },
    // Fagansvar: bare området sitt. Resten kommer fra det vanlige nivået.
    // HR vises bare med Lovpålagt (HMS-opplæringen).
    hms_ansvarlig: {
      show: ['iso', 'hr'],
      hide: ['okonomi', 'anbud', 'selskapsinnstillinger', 'projects'],
      edit: ['iso', 'forms'],
      admin: [],
    },
    kvalitetsansvarlig: {
      show: ['iso', 'hr'],
      hide: ['okonomi', 'anbud', 'selskapsinnstillinger', 'projects'],
      edit: [],
      admin: ['iso', 'forms'],
    },
    iso_rolle: {
      show: ['iso'],
      hide: ['okonomi', 'anbud', 'selskapsinnstillinger', 'projects', 'hr'],
      edit: ['iso', 'forms'],
      admin: [],
    },
    hr_ansvarlig: {
      show: ['hr', 'ansatte', 'fravaer', 'iso'],
      hide: ['okonomi', 'anbud', 'selskapsinnstillinger', 'projects', 'kjorebok'],
      edit: ['absence'],
      admin: ['hr', 'hrPeople', 'hrPayroll', 'employees', 'absenceSettings'],
    },
  };

  for (const level of ACCESS_LEVELS) {
    const grants = standardGrants(level.id);
    const nav = filterCompanyNav(companyNavItems({ includeUnderenheter: true }), grants);
    const flat = [];
    for (const item of nav) {
      flat.push(item.id);
      for (const child of item.children || []) flat.push(child.id);
    }
    const expect = expectations[level.id];
    for (const id of expect.show) {
      assert.ok(flat.includes(id), `${level.id} skal se ${id}`);
    }
    for (const id of expect.hide) {
      assert.equal(flat.includes(id), false, `${level.id} skal ikke se ${id}`);
    }
    for (const resource of expect.edit) {
      assert.equal(canEditResource(grants, resource), true, `${level.id} edit ${resource}`);
      assert.equal(canAdminResource(grants, resource), false, `${level.id} ikke admin ${resource}`);
    }
    for (const resource of expect.admin) {
      assert.equal(canAdminResource(grants, resource), true, `${level.id} admin ${resource}`);
    }
  }
  // Fagansvar på HR-menyen: bare Lovpålagt.
  const hmsHr = filterCompanyNav(companyNavItems(), standardGrants('hms_ansvarlig')).find((item) => item.id === 'hr');
  assert.ok(hmsHr);
  assert.equal(standardGrants('hms_ansvarlig').hrPeople, 'none');
  assert.equal(standardGrants('hms_ansvarlig').hrPayroll, 'none');
}

{
  const actor = resolveActorAccess({ bypass: true });
  const ansatt = { id: 'kari', company: { accessLevel: 'ansatt', status: 'active' } };
  const narrowed = resolveViewAsAccess({
    actor, targetEmployee: ansatt, policy: null, lens: 'companySettings',
  });
  assert.equal(narrowed.active, true);
  assert.equal(narrowed.grants.companyProfile, 'none');
  assert.equal(viewAsLocks(narrowed, 'units'), true);
  assert.equal(viewAsAllows({
    preview: narrowed, actor, bypass: true, resource: 'companyProfile', action: 'write',
  }), false);
  // Utenfor bedriftsinnstillinger beholder aktøren egne rettigheter.
  assert.equal(viewAsAllows({
    preview: narrowed, actor, bypass: true, resource: 'economyOverview', action: 'see',
  }), true);

  const full = resolveViewAsAccess({
    actor, targetEmployee: ansatt, policy: null, lens: 'all',
  });
  assert.equal(full.grants.economy, 'none');
  assert.equal(full.grants.projects, 'see');
  // «Vis som» følger valgt ansatts nivå: begrenset redigering på timer, ikke admin.
  assert.equal(viewAsAllows({
    preview: full, actor, bypass: true, resource: 'hours', action: 'read',
  }), true);
  assert.equal(viewAsAllows({
    preview: full, actor, bypass: true, resource: 'hours', action: 'write',
  }), false);
  assert.equal(viewAsAllows({
    preview: full, actor, bypass: true, resource: 'hours', action: 'see',
  }), true);
  assert.equal(viewAsAllows({
    preview: full, actor, bypass: true, resource: 'companyProfile', action: 'write',
  }), false);

  // Valgt ansatt med Admin på selskapsinnstillinger får Admin i «Vis som».
  const adminPolicy = { employeeGrants: {} };
  const adminView = resolveViewAsAccess({
    actor,
    targetEmployee: { id: 'ola', company: { accessLevel: 'administrator', status: 'active' } },
    policy: adminPolicy,
    lens: 'all',
  });
  assert.equal(viewAsAllows({
    preview: adminView, actor, bypass: true, resource: 'companyProfile', action: 'write',
  }), true);
  // Aldri mer enn innlogget bruker selv har.
  const limitedActor = { grants: standardGrants('ansatt') };
  assert.equal(viewAsAllows({
    preview: adminView, actor: limitedActor, resource: 'companyProfile', action: 'write',
  }), false);
  const fullIds = filterCompanyNav(companyNavItems(), full.grants).map((item) => item.id);
  assert.ok(fullIds.includes('okonomi'));
  assert.equal(fullIds.includes('kjorebok'), false);
  assert.deepEqual(
    filterCompanyNav(companyNavItems(), full.grants).find((item) => item.id === 'okonomi')
      .children.map((child) => child.id),
    ['okonomi-prosjektutlegg'],
  );
  const hidden = hiddenCompanyModules(full.grants).map((row) => row.id);
  assert.ok(hidden.includes('okonomi-oversikt'));
  // Tilgang ligger bare under Bedriftsinnstillinger (UX-17), som ansatt ikke ser.
  assert.ok(hidden.includes('selskapsinnstillinger'));
  assert.equal(hidden.includes('tilgang'), false);
}

{
  // Ingen runtime-arv: tenders Admin gir ikke automatisk forespørsel.
  const grants = { ...standardGrants('ansatt'), tenders: 'write', tenderRequest: 'none' };
  assert.equal(allowsEffective(grants, 'tenders', 'write'), true);
  assert.equal(allowsEffective(grants, 'tenderRequest', 'see'), false);
  assert.equal(canViewResource(grants, 'tenderRequest'), false);
}

// Tildelte prosjekt alene gir Prosjekt i menyen og på siden.
{
  const assigned = { assignedProjects: 'see' };
  assert.equal(companyTabAllowed('projects', null, assigned), true);
  assert.ok(filterCompanyNav(companyNavItems(), assigned).some((item) => item.id === 'projects'
    || (item.children || []).some((child) => child.id === 'projects')));
  const none = {};
  assert.equal(companyTabAllowed('projects', null, none), false);
}

// Utstyr følger bare Utstyr: prosjekt- eller timetilgang alene åpner ikke modulen.
{
  const noGear = { ...standardGrants('ansatt'), equipment: 'none', projects: 'read', hours: 'read' };
  assert.equal(companyTabAllowed('utstyr', null, noGear), false);
  assert.equal(filterCompanyNav(companyNavItems(), noGear).some((item) => item.id === 'utstyr'), false);
  assert.equal(companyTabAllowed('utstyr', null, { ...noGear, equipment: 'see' }), true);
}

// Kjørebok alene gir ikke Økonomi i menyen (punktet sendte ellers til Selskap).
{
  const mileageOnly = { ...standardGrants('ansatt'), economyProjectExpenses: 'none', mileage: 'see', products: 'see' };
  const nav = filterCompanyNav(companyNavItems(), mileageOnly);
  assert.equal(nav.some((item) => item.id === 'okonomi'), false);
  assert.equal(nav.some((item) => item.id === 'kjorebok'), true);
  assert.equal(companyTabAllowed('okonomi', 'kjorebok', mileageOnly), true);
  // Prosjektutlegg alene peker til Arbeid → Utlegg, som er tillatt.
  const expenses = filterCompanyNav(companyNavItems(), standardGrants('ansatt')).find((item) => item.id === 'okonomi');
  assert.equal(companyTabAllowed(expenses.action.tab, expenses.action.subView, standardGrants('ansatt')), true);
  // Ingen menypunkter skal peke til en side personen ikke har tilgang til.
  for (const level of ['ansatt', 'innleie_ekstern', 'tilbud', 'regnskap_ekstern', 'avdelingsleder']) {
    const grants = { ...standardGrants(level), mileage: 'see' };
    const walk = (items) => items.forEach((item) => {
      if (item.action?.tab) {
        assert.equal(companyTabAllowed(item.action.tab, item.action.subView, grants), true, `${level}: ${item.id}`);
      }
      walk(item.children || []);
    });
    walk(filterCompanyNav(companyNavItems(), grants));
  }
}

// Import av lister: bare Admin på området.
{
  const fake = (levelId, ready = true) => {
    const grants = standardGrants(levelId);
    return { ready, canAdmin: (res) => allows(grants, res, 'write') };
  };
  assert.equal(canImportList(fake('administrator'), 'customers'), true);
  assert.equal(canImportList(fake('leder'), 'customers'), true);
  assert.equal(canImportList(fake('avdelingsleder'), 'customers'), false, 'begrenset redigering kan ikke importere');
  assert.equal(canImportList(fake('ansatt'), 'economyInvoices'), false);
  assert.equal(canImportList(fake('administrator', false), 'customers'), false, 'stengt mens tilgangen lastes');
  assert.equal(canImportList(null, 'customers'), false);
}

// Fagansvar legges til i tillegg til nivået, og personen står både under nivået og fagansvaret.
{
  const ola = { id: 'ola', company: { accessLevel: 'ansatt', accessLevels: ['ansatt'], status: 'active' } };
  assert.deepEqual(personDropChange(ola, 'level:hr_ansvarlig'), {
    levelId: '', addLevel: 'hr_ansvarlig', clearLevel: false, activate: false, deactivate: false,
  });
  const both = withToggledLevel(ola, 'hr_ansvarlig', true);
  assert.deepEqual(employeeLevelIds(both), ['hr_ansvarlig', 'ansatt']);
  assert.equal(placedLevelId(both), 'ansatt');
  assert.equal(personDropChange(both, 'level:hr_ansvarlig'), null);
  const grouped = groupEmployeesByLevel([both]);
  assert.deepEqual(grouped.buckets.ansatt.map((row) => row.id), ['ola']);
  assert.deepEqual(grouped.buckets.hr_ansvarlig.map((row) => row.id), ['ola']);
  // Ansatt + HR-ansvarlig: HR og alle faner på ansatte, men ikke økonomi eller selskapsinnstillinger.
  const grants = grantsForEmployee(null, both);
  assert.equal(grants.hrPayroll, 'write');
  assert.equal(grants.employees, 'write');
  assert.equal(grants.hours, 'read');
  assert.equal(grants.economy, 'none');
  assert.equal(grants.companyProfile, 'none');
}

console.log('companyAccess.test.mjs: ok');
