import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  companyProjectRow,
  linkImportPlanCustomer,
  linkProjectsToCustomers,
  matchCustomer,
  momentHourlyRate,
  planProjectImport,
  readCompanyProjectTable,
} from './projectImport.js';
import { createProject, emptyProjectState, importProjects, projectMissingAgreement, updateProject } from './engine.js';
import { pricingFill } from './projectFields.js';
import { namesLikelyMatch } from '../anbud/customers.js';

{
  const customer = matchCustomer(
    [{ id: 'c1', name: 'Sandnes Kommune', customerNumber: '10025', orgnr: '964965137' }],
    { customerNumber: '10025' },
  );
  assert.equal(customer.id, 'c1');
}

{
  // Kundenummer i registeret kan mangle/være annet; org.nr og mykt navn skal fortsatt treffe.
  const byOrgnr = matchCustomer(
    [{ id: 'c-org', name: 'Sandnes kommune', customerNumber: '12', orgnr: '964965137' }],
    { customerNumber: '10025', client: 'Sandnes Kommune', orgnr: '964 965 137' },
  );
  assert.equal(byOrgnr.id, 'c-org');

  const bySoftName = matchCustomer(
    [{ id: 'c-name', name: 'Stavanger kommune', customerNumber: '9', orgnr: '' }],
    { customerNumber: '10062', client: 'Stavanger Kommune Bymiljø Og Utbygging', orgnr: '' },
  );
  assert.equal(bySoftName.id, 'c-name');

  const byNormalizedNumber = matchCustomer(
    [{ id: 'c-num', name: 'Lyse Neo AS', customerNumber: '10115', orgnr: '982929733' }],
    { customerNumber: '10115.0', client: 'Annet navn' },
  );
  assert.equal(byNormalizedNumber.id, 'c-num');

  const byNotesNumber = matchCustomer(
    [{ id: 'c-notes', name: 'Sandnes kommune', customerNumber: '7', notes: 'Kundenr 10025', orgnr: '964965137' }],
    { customerNumber: '10025', client: 'Sandnes Kommune' },
  );
  assert.equal(byNotesNumber.id, 'c-notes');

  const byShortestSoft = matchCustomer(
    [
      { id: 'c-dept', name: 'Sandnes kommune Bymiljø', customerNumber: '8', orgnr: '' },
      { id: 'c-legal', name: 'Sandnes kommune', customerNumber: '9', orgnr: '' },
    ],
    { customerNumber: '999', client: 'Sandnes Kommune Bymiljø Og Utbygging', orgnr: '' },
  );
  assert.equal(byShortestSoft.id, 'c-legal');

  const tiedNumbers = matchCustomer(
    [
      { id: 'c-a', name: 'Alpha AS', customerNumber: '55', orgnr: '' },
      { id: 'c-b', name: 'Beta AS', customerNumber: '55', orgnr: '' },
    ],
    { customerNumber: '55', client: 'Beta AS' },
  );
  assert.equal(tiedNumbers.id, 'c-b');

  assert.equal(namesLikelyMatch('Sameiet Nytorget 6', 'Nytorget 6 Sameie'), true);
  assert.equal(namesLikelyMatch('Lyse Neo AS', 'Lyse Neo'), true);
}

{
  const row = companyProjectRow({
    number: '10951',
    name: 'Nykirkebakken Fasade Rehab. KU',
    customerNumber: '10102',
    client: 'Sameiet Nytorget 6',
    orgnr: '981671155',
    manager: 'Torbjørn Øgreid Coll',
    status: 'Under arbeid',
  }, [{ id: 'c2', name: 'Sameiet Nytorget 6', customerNumber: '10102', orgnr: '981671155' }]);
  assert.equal(row.severity, 'review');
  assert.equal(row.project.customerId, 'c2');
  assert.equal(row.project.phase, 'produksjon');
  assert.match(row.issues.join(' '), /Ingen avtale/);
  assert.equal(row.issues.some((issue) => /kunde/i.test(issue)), false);
}

{
  let state = emptyProjectState();
  state = createProject(state, {
    name: 'Uten avtale',
    number: 'P-1',
    client: 'Kunde',
    customerId: 'c1',
  }).state;
  assert.equal(projectMissingAgreement(state.projects[0]), true);
  state = updateProject(state, state.projects[0].id, {
    contractId: 'ctr1',
    agreementKind: 'oppdrag',
  }).state;
  assert.equal(projectMissingAgreement(state.projects[0]), false);
  state = updateProject(state, state.projects[0].id, {
    agreementKind: 'avrop',
    contractId: 'avrop1',
    frameworkAgreementId: '',
  }).state;
  assert.equal(projectMissingAgreement(state.projects[0]), true);
}

{
  const plan = planProjectImport(
    emptyProjectState(),
    [{ id: 'c1', name: 'Lyse Neo AS', customerNumber: '10115', orgnr: '982929733' }],
    [],
    [{ number: '10948', name: 'Nabokontakt Oddahagen', customerNumber: '10115', client: 'Lyse Neo AS' }],
  );
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].project.customerId, 'c1');
  const imported = importProjects(emptyProjectState(), plan.rows.map((row) => row.project));
  assert.equal(imported.ok, true);
  assert.equal(imported.created.length, 1);
  assert.equal(projectMissingAgreement(imported.created[0]), true);
}

{
  const blocked = companyProjectRow({ number: 'Totalt', name: '6330912.48' });
  assert.equal(blocked.severity, 'block');
  assert.equal(blocked.project, null);
}

{
  const customer = { id: 'c1', name: 'Lyse Neo AS', customerNumber: '10115', orgnr: '982929733' };
  let state = emptyProjectState();
  state = createProject(state, { name: 'Nykirkebakken', number: '10951', customerId: 'c1' }).state;
  const plan = planProjectImport(
    state,
    [customer],
    [],
    [
      { number: '10951.0', name: 'Nykirkebakken Fasade', customerNumber: '10115', client: 'Lyse Neo AS' },
      { number: '10952', name: 'Nytt prosjekt', customerNumber: '10115', client: 'Lyse Neo AS' },
      { number: '10952', name: 'Samme nummer i filen', customerNumber: '10115', client: 'Lyse Neo AS' },
    ],
  );
  // Finnes fra før og listen har ingen priser å fylle inn: raden står over.
  assert.equal(plan.rows[0].severity, 'existing');
  assert.equal(plan.rows[0].locked, true);
  assert.match(plan.rows[0].reason, /finnes allerede/);
  assert.equal(plan.rows[0].project, null);
  assert.equal(plan.rows[1].customerId, 'c1');
  assert.equal(plan.rows[2].severity, 'block');
  assert.match(plan.rows[2].issues.join(' '), /flere ganger/);

  const imported = importProjects(state, plan.rows.map((row) => row.project).filter(Boolean));
  assert.equal(imported.ok, true);
  assert.equal(imported.created.length, 1);
  assert.equal(imported.created[0].number, '10952');
  assert.equal(imported.created[0].customerId, 'c1');
  assert.equal(state.projects.filter((row) => row.number === '10951').length, 1);

  assert.equal(importProjects(imported.state, [
    { number: '10998', name: 'Uten kunde' },
  ]).ok, false);

  const mixed = importProjects(imported.state, [
    { number: '10951', name: 'Skal ikke oppdateres', manager: 'Ny', customerId: 'c1' },
    { number: '10999', name: 'Helt ny', customerId: 'c1', customerNumber: '10115', client: 'Lyse Neo AS' },
  ]);
  assert.equal(mixed.ok, true);
  assert.equal(mixed.created.length, 1);
  assert.equal(mixed.created[0].number, '10999');
  assert.equal(mixed.skipped.length, 1);
  assert.equal(mixed.state.projects.find((row) => row.number === '10951').name, 'Nykirkebakken');

  const replay = importProjects(mixed.state, [
    { number: '10951', name: 'Skal ikke oppdateres', customerId: 'c1' },
    { number: '10952', name: 'Skal heller ikke oppdateres', customerId: 'c1' },
  ]);
  assert.equal(replay.ok, false);
  assert.match(replay.error, /finnes allerede/);

  let archived = emptyProjectState();
  archived = createProject(archived, { name: 'Gammel', number: '200', customerId: 'c1' }).state;
  archived = updateProject(archived, archived.projects[0].id, { status: 'arkivert' }).state;
  const archivedPlan = planProjectImport(archived, [customer], [], [{ number: '200', name: 'Ny med samme nummer', customerNumber: '10115' }]);
  assert.equal(archivedPlan.rows[0].severity, 'existing');
  assert.equal(archivedPlan.rows[0].project, null);
  const fromArchive = importProjects(archived, [{ number: '200', name: 'Ny med samme nummer', customerId: 'c1' }]);
  assert.equal(fromArchive.ok, false);
  assert.match(fromArchive.error, /finnes allerede/);
}

{
  let state = emptyProjectState();
  state = createProject(state, {
    name: 'Interntid',
    number: '10014',
    customerNumber: '10243',
    client: 'CONSULT1 AS',
    orgnr: '916538804',
  }).state;
  assert.equal(state.projects[0].customerId, null);
  const rematch = linkProjectsToCustomers(state, [
    { id: 'c-self', name: 'CONSULT1 AS', customerNumber: '10243', orgnr: '916 538 804' },
  ]);
  assert.equal(rematch.linked, 1);
  assert.equal(rematch.state.projects[0].customerId, 'c-self');
}

{
  const customers = [
    { id: 'c-sandnes', name: 'Sandnes kommune', customerNumber: '7', orgnr: '964965137' },
    { id: 'c-other', name: 'Annen AS', customerNumber: '8', orgnr: '999999999' },
  ];
  const plan = planProjectImport(
    emptyProjectState(),
    customers,
    [],
    [
      { number: '10947', name: 'Lura Skole', customerNumber: '10025', client: 'Sandnes Kommune', orgnr: '964965137' },
      { number: '10945', name: 'Kino Kino', customerNumber: '10025', client: 'Sandnes Kommune', orgnr: '964965137' },
      { number: '10948', name: 'Nabokontakt', customerNumber: '10115', client: 'Lyse Neo AS', orgnr: '982929733' },
    ],
  );
  assert.equal(plan.rows[0].customerId, 'c-sandnes');
  assert.equal(plan.rows[1].customerId, 'c-sandnes');
  assert.equal(plan.rows[2].customerId, '');
  assert.match(plan.rows[2].issues.join(' '), /Velg kunde under/);

  const linked = linkImportPlanCustomer(plan, 2, customers[1], { applyGroup: true });
  // Feil kunde i listen over — koble Lyse-raden til en ny kunde med riktig identitet
  const lyse = { id: 'c-lyse', name: 'Lyse Neo AS', customerNumber: '10115', orgnr: '982929733' };
  const linkedLyse = linkImportPlanCustomer(plan, 2, lyse, { applyGroup: true });
  assert.equal(linkedLyse.rows[2].customerId, 'c-lyse');
  assert.equal(linkedLyse.rows[2].project.customerId, 'c-lyse');
  assert.equal(linkedLyse.rows[2].issues.some((issue) => /kunde/i.test(issue)), false);
  assert.equal(linked.rows[2].customerId, 'c-other');
}

{
  // Moment eksporterer ikke timeprisen. Den regnes ut av inntekt på timer og fakturerbare timer.
  assert.deepEqual(
    momentHourlyRate({ hoursIncomeTotal: '10314.0', billableHoursTotal: '9.0' }),
    { rate: 1146, average: 1146, exact: true, income: 10314, hours: 9, span: 'total' },
  );
  const average = momentHourlyRate({ hoursIncomeTotal: '292790.0', billableHoursTotal: '233.5' });
  assert.equal(average.exact, false);
  assert.equal(average.rate, 1254);
  assert.equal(momentHourlyRate({ hoursIncomePeriod: '8021,0', billableHours: '6,5' }).rate, 1234);
  assert.equal(momentHourlyRate({ hoursIncomeTotal: '0.0', billableHoursTotal: '82.0' }), null);
  assert.equal(momentHourlyRate({}), null);
  // Indeksregulert underveis: snittet for hele prosjektet er ikke satsen. Perioden fram til i dag er siste sats.
  const regulated = {
    hoursIncomeTotal: '240600.0', billableHoursTotal: '220.0', // 100 t × 1050 + 120 t × 1130
    hoursIncomePeriod: '45200.0', billableHours: '40.0',
  };
  assert.equal(momentHourlyRate({ hoursIncomeTotal: '240600.0', billableHoursTotal: '220.0' }).exact, false);
  assert.deepEqual(
    { ...momentHourlyRate(regulated), average: undefined },
    { rate: 1130, average: undefined, exact: true, income: 45200, hours: 40, span: 'period' },
  );
  // Ingen timer i perioden: totalen brukes.
  assert.equal(momentHourlyRate({ ...regulated, hoursIncomePeriod: '0.0', billableHours: '0.0' }).span, 'total');
  // Flere satser også i perioden: ingen sats, selv om totalen skulle gå opp.
  assert.equal(momentHourlyRate({ hoursIncomeTotal: '22000', billableHoursTotal: '20', hoursIncomePeriod: '11770', billableHours: '10.5' }).exact, false);
}

{
  const customer = { id: 'c-pri', name: 'Prismen AS', customerNumber: '10300', orgnr: '' };
  // Honorarestimatet er et totalbeløp og skal aldri bli timepris.
  const hourly = companyProjectRow({
    number: '10125',
    name: 'Bøndenes Innkjøpslag - Hove',
    customerNumber: '10300',
    pricingModel: 'hourlyRate',
    feeEstimate: '800000.0',
    feeTotal: '800000.0',
    billableHoursTotal: '9.0',
    hoursIncomeTotal: '10314.0',
  }, [customer]);
  assert.deepEqual(hourly.project.pricingSettings, { hourlyRate: 1146, estimatedTotalFee: 800000 });
  assert.equal(hourly.issues.some((issue) => /Timeprisen/.test(issue)), false);
  const created = importProjects(emptyProjectState(), [hourly.project]).created[0];
  assert.equal(created.pricingModel, 'hourly');
  assert.equal(created.pricingSettings.hourlyRate, 1146);
  assert.equal(created.pricingSettings.estimatedTotalFee, 800000);
  assert.equal(created.feeEstimate, 1146);

  const mixed = companyProjectRow({
    number: '10772',
    name: 'Prismen (Ny)',
    customerNumber: '10300',
    pricingModel: 'hourlyRate',
    feeEstimate: '2287825.0',
    billableHoursTotal: '233.5',
    hoursIncomeTotal: '292790.0',
  }, [customer]);
  assert.equal(mixed.severity, 'review');
  assert.match(mixed.issues.join(' '), /snitt av flere satser/);
  assert.equal(mixed.project.pricingSettings.hourlyRate, undefined);
  const createdMixed = importProjects(emptyProjectState(), [mixed.project]).created[0];
  assert.equal(createdMixed.pricingSettings.hourlyRate, null);
  assert.equal(createdMixed.pricingSettings.estimatedTotalFee, 2287825);

  const fixed = companyProjectRow({
    number: '10903',
    name: 'Kannik Park Hotell',
    customerNumber: '10300',
    pricingModel: 'fixedPrice',
    feeEstimate: '',
    feeTotal: '20000.0',
  }, [customer]);
  assert.deepEqual(fixed.project.pricingSettings, { fixedFee: 20000 });
  assert.equal(fixed.issues.some((issue) => /Timeprisen/.test(issue)), false);
}

{
  // Prosjekt som finnes fra før får fylt inn priser som mangler. Resten blir stående.
  const customer = { id: 'c1', name: 'Sandnes kommune', customerNumber: '10025', orgnr: '964965137' };
  let state = emptyProjectState();
  const add = (input) => {
    state = createProject(state, { customerId: 'c1', client: 'Sandnes kommune', ...input }).state;
  };
  add({ number: '10951', name: 'Uten timepris', manager: 'Satt i ProTop', pricingModel: 'hourly' });
  add({ number: '10952', name: 'Har timepris', pricingModel: 'hourly', pricingSettings: { hourlyRate: 1300 } });
  add({ number: '10953', name: 'Uten prismodell' });
  add({ number: '10954', name: 'Feil fra gammel import', pricingModel: 'hourly', feeEstimate: '800000' });
  add({ number: '10955', name: 'Feil og bare snitt', pricingModel: 'hourly', pricingSettings: { hourlyRate: 2287825 } });
  add({ number: '10956', name: 'Fastpris uten beløp', pricingModel: 'fixed' });
  add({ number: '10957', name: 'Fastpris i ProTop', pricingModel: 'fixed' });
  add({ number: '10958', name: 'Uten timer i Moment', pricingModel: 'hourly' });
  assert.equal(state.projects.find((row) => row.number === '10954').pricingSettings.hourlyRate, 800000);

  const moment = (number, extra) => ({
    number, name: `Moment ${number}`, customerNumber: '10025', client: 'Sandnes Kommune', ...extra,
  });
  const exact = { pricingModel: 'hourlyRate', billableHoursTotal: '12.0', hoursIncomeTotal: '13056.0' };
  const plan = planProjectImport(state, [customer], [], [
    moment('10951', exact),
    moment('10952', exact),
    moment('10953', exact),
    moment('10954', { ...exact, feeEstimate: '800000.0' }),
    moment('10955', { pricingModel: 'hourlyRate', feeEstimate: '2287825.0', billableHoursTotal: '233.5', hoursIncomeTotal: '292790.0' }),
    moment('10956', { pricingModel: 'fixedPrice', feeTotal: '20000.0' }),
    moment('10957', exact),
    moment('10958', { pricingModel: 'hourlyRate', billableHoursTotal: '0.0', hoursIncomeTotal: '0.0' }),
    moment('10999', exact),
  ]);
  const byNumber = Object.fromEntries(plan.rows.map((row) => [row.number, row]));

  assert.equal(byNumber['10951'].severity, 'ok');
  assert.equal(byNumber['10951'].existing, true);
  assert.equal(byNumber['10951'].project.pricingUpdate, true);
  assert.equal(byNumber['10951'].pricing, 'Oppdateres: Timepris 1\u00a0088\u00a0kr');
  assert.equal(byNumber['10952'].severity, 'existing');
  assert.equal(byNumber['10952'].project, null);
  assert.match(byNumber['10953'].pricing, /Prismodell Timepris · Timepris 1\u00a0088/);
  assert.equal(byNumber['10954'].severity, 'review');
  assert.match(byNumber['10954'].issues.join(' '), /lik honorarestimatet/);
  assert.match(byNumber['10955'].issues.join(' '), /lik honorarestimatet.*snitt av flere satser/);
  assert.match(byNumber['10955'].pricing, /fjernes.*Snitt i Moment 1\u00a0254\u00a0kr\/t/);
  assert.equal(byNumber['10956'].project.fixedFee, 20000);
  // Prosjektet er fastpris i ProTop. En timepris fra Moment fylles ikke inn.
  assert.equal(byNumber['10957'].severity, 'existing');
  assert.equal(byNumber['10958'].severity, 'existing');
  assert.match(byNumber['10958'].issues.join(' '), /ingen fakturerbare timer/);
  assert.equal(byNumber['10999'].existing, undefined);

  const chosen = plan.rows.filter((row) => row.project).map((row) => row.project);
  const result = importProjects(state, chosen);
  assert.equal(result.ok, true);
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].number, '10999');
  assert.deepEqual(result.updated.map((row) => row.number).sort(), ['10951', '10953', '10954', '10955', '10956']);
  const after = Object.fromEntries(result.state.projects.map((row) => [row.number, row]));
  assert.equal(after['10951'].pricingSettings.hourlyRate, 1088);
  assert.equal(after['10951'].feeEstimate, 1088);
  assert.equal(after['10951'].manager, 'Satt i ProTop');
  assert.equal(after['10951'].name, 'Uten timepris');
  assert.equal(after['10952'].pricingSettings.hourlyRate, 1300);
  assert.equal(after['10953'].pricingModel, 'hourly');
  assert.equal(after['10953'].pricingSettings.hourlyRate, 1088);
  assert.equal(after['10954'].pricingSettings.hourlyRate, 1088);
  assert.equal(after['10954'].pricingSettings.estimatedTotalFee, 800000);
  assert.equal(after['10955'].pricingSettings.hourlyRate, null);
  assert.equal(after['10955'].feeEstimate, null);
  assert.equal(after['10955'].pricingSettings.estimatedTotalFee, 2287825);
  assert.equal(after['10956'].pricingSettings.fixedFee, 20000);
  assert.equal(after['10957'].pricingSettings.hourlyRate, null);

  // Bare prisfeltene endres. Ingen standardfelt skrives ut på prosjektet.
  const lean = { id: 'lean', number: '20000', name: 'Gammelt prosjekt', pricingModel: 'hourly', customerId: 'c1' };
  const leanFilled = importProjects({ ...emptyProjectState(), projects: [lean] }, [{
    pricingUpdate: true, projectId: 'lean', number: '20000', name: 'Gammelt prosjekt', pricingModel: 'hourly', hourlyRate: 1088,
  }]).updated[0];
  assert.deepEqual(Object.keys(leanFilled).sort(), [...Object.keys(lean), 'feeEstimate', 'pricingSettings'].sort());
  assert.equal(leanFilled.pricingSettings.hourlyRate, 1088);

  // Lagret senere: den tømte timeprisen kommer ikke tilbake fra honorarfeltet.
  const saved = updateProject(result.state, after['10955'].id, { manager: 'Ny leder' }).state;
  assert.equal(saved.projects.find((row) => row.number === '10955').pricingSettings.hourlyRate, null);

  // Andre gang er alt fylt inn, og ingen rader endrer noe.
  const replay = planProjectImport(result.state, [customer], [], [moment('10951', exact), moment('10954', { ...exact, feeEstimate: '800000.0' })]);
  assert.deepEqual(replay.rows.map((row) => row.severity), ['existing', 'existing']);

  // Satt i ProTop mens kontrollen sto åpen: importen overskriver ikke.
  const raced = updateProject(state, state.projects.find((row) => row.number === '10951').id, {
    pricingSettings: { hourlyRate: 1400 },
  }).state;
  const late = importProjects(raced, [byNumber['10951'].project]);
  assert.equal(late.ok, false);
  assert.equal(late.state.projects.find((row) => row.number === '10951').pricingSettings.hourlyRate, 1400);
}

{
  // Satser fylt inn for hånd i en liste («Timepris», «Fastpris») går foran snittet fra Moment.
  const customer = { id: 'c1', name: 'Sandnes kommune', customerNumber: '10025', orgnr: '' };
  let state = emptyProjectState();
  state = createProject(state, { number: '10928', name: 'Snitt', customerId: 'c1', pricingModel: 'hourly' }).state;
  state = createProject(state, { number: '10900', name: 'Uten prismodell', customerId: 'c1' }).state;
  state = createProject(state, { number: '10901', name: 'Fastpris', customerId: 'c1', pricingModel: 'fixed' }).state;
  const plan = planProjectImport(state, [customer], [], [
    { number: '10928', name: 'Snitt', pricingModel: 'Timepris', billableHoursTotal: '233.5', hoursIncomeTotal: '292790.0', hourlyRate: '1 290' },
    { number: '10900', name: 'Uten prismodell', pricingModel: '', hourlyRate: '1150' },
    { number: '10901', name: 'Fastpris', pricingModel: 'Fastpris', fixedFee: '45000' },
  ]);
  assert.deepEqual(plan.rows.map((row) => row.severity), ['ok', 'ok', 'ok']);
  const result = importProjects(state, plan.rows.map((row) => row.project));
  const after = Object.fromEntries(result.state.projects.map((row) => [row.number, row]));
  assert.equal(after['10928'].pricingSettings.hourlyRate, 1290);
  assert.equal(after['10900'].pricingModel, 'hourly');
  assert.equal(after['10900'].pricingSettings.hourlyRate, 1150);
  assert.equal(after['10901'].pricingSettings.fixedFee, 45000);
}

{
  // Eksporten dekker hele historikken (periode = total) og har snittsatser: importen ber om kortere periode.
  const mixed = { pricingModel: 'hourlyRate', hoursIncomeTotal: '240600.0', billableHoursTotal: '220.0' };
  const whole = planProjectImport(emptyProjectState(), [], [], [
    { number: '1', name: 'A', ...mixed, hoursIncomePeriod: '240600.0', billableHours: '220.0' },
    { number: '2', name: 'B', pricingModel: 'hourlyRate', hoursIncomeTotal: '10314', billableHoursTotal: '9', hoursIncomePeriod: '10314', billableHours: '9' },
  ]);
  assert.equal(whole.shorterPeriodHint, true);
  // Fastpris og summeringsraden har periodisering i perioden. De teller ikke.
  const withFixed = planProjectImport(emptyProjectState(), [], [], [
    { number: '1', name: 'A', ...mixed, hoursIncomePeriod: '240600.0', billableHours: '220.0' },
    { number: '4', name: 'Fast', pricingModel: 'fixedPrice', hoursIncomeTotal: '200000', billableHoursTotal: '114.5', hoursIncomePeriod: '238925', billableHours: '114.5' },
    { number: 'Totalt', name: '', hoursIncomeTotal: '196097357', billableHoursTotal: '173061', hoursIncomePeriod: '196641108', billableHours: '173061' },
  ]);
  assert.equal(withFixed.shorterPeriodHint, true);
  const recent = planProjectImport(emptyProjectState(), [], [], [
    { number: '1', name: 'A', ...mixed, hoursIncomePeriod: '45200.0', billableHours: '40.0' },
    { number: '3', name: 'C', ...mixed, hoursIncomePeriod: '0', billableHours: '0' },
  ]);
  assert.equal(recent.shorterPeriodHint, false);
  assert.equal(recent.rows[0].pricingOffer.hourlyRate, 1130);
  assert.equal(recent.rows[1].pricingOffer.hourlyRate, null);
}

{
  // En vanlig timepris som tilfeldigvis er lik et lite estimat er ingen importfeil.
  assert.equal(pricingFill(
    { pricingModel: 'hourly', pricingSettings: { hourlyRate: 1100 } },
    { pricingModel: 'hourly', hourlyRate: null, estimatedTotalFee: 1100 },
  )?.changes.includes('hourlyRateCleared') ?? false, false);
}

try {
  const bytes = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/overview__3__a29a.xlsx');
  const rows = await readCompanyProjectTable(bytes, 'overview.xlsx');
  assert.ok(rows.length > 20);
  assert.equal(rows[0].number, '10951');
  assert.match(rows[0].name, /Nykirkebakken/);
  assert.equal(rows[0].customerNumber, '10102');
  assert.ok(rows[0].orgnr || rows[0].manager || rows[0].pricingModel);
  const planned = planProjectImport(
    emptyProjectState(),
    [{ id: 'c2', name: 'Sameiet Nytorget 6', customerNumber: '10102', orgnr: '981671155' }],
    [],
    rows.slice(0, 1),
  );
  const imported = importProjects(emptyProjectState(), planned.rows.map((row) => row.project).filter(Boolean));
  assert.equal(imported.ok, true);
  const project = imported.created[0];
  assert.equal(project.number, '10951');
  assert.equal(project.customerId, 'c2');
  assert.equal(project.pricingModel, 'hourly');
  assert.ok(project.manager);
  assert.ok(project.projectStatus);
  assert.equal(project.inboxEmail, null);
  assert.equal(project.hoursPeriod, null);
  console.log('projectImport.test.mjs: ok (with sample xlsx)');
} catch (cause) {
  if (cause?.code === 'ENOENT') {
    console.log('projectImport.test.mjs: ok (sample xlsx skipped)');
  } else {
    throw cause;
  }
}
