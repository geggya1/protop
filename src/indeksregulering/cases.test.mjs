import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPriceVersion,
  approveCase,
  attachLetter,
  beginSend,
  buildIndexChain,
  caseFromCalculation,
  classifyContract,
  computeRegulation,
  finishSend,
  deskCounts,
  projectsWithoutAgreement,
  queueCounts,
  rateOnDate,
  readWorkspaceQuery,
  saveDraft,
  upsertCase,
  validateCase,
  canDeleteCase,
  withdrawCase,
  workspaceHref,
} from './cases.js';
import { indexLinkFromPath } from './indexLink.js';

function series(points, frequency = 'quarter') {
  const rows = points.map(([period, value]) => ({ period, value }));
  return {
    'ppi-byggeteknisk': {
      id: 'ppi-byggeteknisk',
      name: 'Byggeteknisk konsulentvirksomhet',
      table: '14335',
      frequency,
      source: 'SSB',
      points: rows,
      latest: rows[rows.length - 1],
    },
  };
}

function breitorget(extra = {}) {
  return {
    id: 'breitorget',
    title: 'Breitorget · Prosjektleder',
    buyer: 'Breitorget AS',
    projectId: 'p-brei',
    customerId: 'k-brei',
    kind: 'oppdrag',
    value: 1350,
    start: '2025-12-19',
    fields: {
      indexId: 'ppi-byggeteknisk',
      contractDate: '2025-12-19',
      standard: 'NS 8403',
      model: 'engang',
      regulationFrequency: 'quarter',
      ...(extra.fields || {}),
    },
    indexDraft: {
      indexId: 'ppi-byggeteknisk',
      model: 'engang',
      standard: 'NS 8403',
      contractDate: '2025-12-19',
      surchargePercent: extra.surchargePercent || '',
      lines: [{ text: 'Timepris', unit: 'time', rate: '1350', quantity: '1', included: true }],
      terms: { frequency: 'quarter', ...(extra.terms || {}) },
      ...(extra.draft || {}),
    },
    regulations: extra.regulations || [],
    indexCases: extra.indexCases || [],
  };
}

const published = series([['2025K4', 119.5], ['2026K2', 122.9]]);

test('breitorget første regulering gir 1 388,41 kr uten å lagre saken', () => {
  const contract = breitorget();
  const before = JSON.stringify(contract);
  const status = classifyContract({ contract, series: published, today: '2026-10-20' });
  assert.equal(status.band, 'ma_vurderes');
  assert.equal(status.chain.original.value, 119.5);
  assert.equal(status.chain.previous.value, 119.5);
  assert.equal(status.chain.next.value, 122.9);
  assert.notEqual(status.chain.original, status.chain.next);
  const math = computeRegulation({
    draft: status.draft,
    series: published,
    cases: [],
    regulations: [],
  });
  assert.equal(math.ok, true);
  assert.equal(math.provisional, false);
  assert.equal(math.baseSum, 1350);
  assert.equal(math.addition, 38.41);
  assert.equal(math.regulated, 1388.41);
  assert.ok(Math.abs(math.changePercent - 2.845188) < 0.0001);
  assert.equal(JSON.stringify(contract), before);
});

test('påslag holdes utenfor reguleringsgrunnlaget', () => {
  const contract = breitorget({ surchargePercent: '10' });
  const status = classifyContract({ contract, series: published, today: '2026-10-20' });
  const math = computeRegulation({ draft: status.draft, series: published });
  assert.equal(math.regulated, 1388.41);
  assert.match(math.warnings.join(' '), /Påslag på 10 %/);
});

test('kvartalsvis avtale som ikke er forfalt kan reguleres når indeksen finnes', () => {
  const contract = breitorget({ fields: { firstRegulationDate: '2026-10-20' }, draft: { firstRegulationDate: '2026-10-20' } });
  const status = classifyContract({ contract, series: published, today: '2026-10-20' });
  assert.equal(status.band, 'kan_reguleres');
});

test('årlig avtale med dato frem i tid er kommende, ikke et varsel', () => {
  const contract = breitorget({
    fields: { regulationFrequency: 'year', firstRegulationDate: '2027-01-01' },
    draft: { firstRegulationDate: '2027-01-01', terms: { frequency: 'year' } },
  });
  const status = classifyContract({ contract, series: published, today: '2026-10-20' });
  assert.equal(status.band, 'kommende');
  assert.equal(status.attention, false);
});

test('avtale uten indeksregulering varsles ikke', () => {
  const contract = { id: 'plain', title: 'Fast oppdrag', buyer: 'Oslo', value: 1000, kind: 'oppdrag' };
  const status = classifyContract({ contract, series: published, today: '2026-10-20' });
  assert.equal(status.band, 'ikke_aktuell');
  const counts = queueCounts([contract, breitorget()], published, '2026-10-20');
  assert.equal(counts.alle, 2);
  assert.equal(counts.ma_vurderes, 1);
});

test('manglende og upublisert indeks blir ikke en endelig pris', () => {
  const contract = breitorget();
  const status = classifyContract({ contract, series: null, today: '2026-10-20' });
  assert.equal(status.band, 'venter_indeks');
  const onlyBase = series([['2025K4', 119.5]]);
  const waiting = classifyContract({ contract, series: onlyBase, today: '2026-10-20' });
  assert.equal(waiting.band, 'venter_indeks');
  const math = computeRegulation({
    draft: waiting.draft,
    series: onlyBase,
    period: '2026K2',
  });
  assert.equal(math.ok, false);
  assert.match(math.error, /ikke publisert/);
  assert.equal(math.regulated, undefined);
});

test('andre og tredje regulering bruker forrige indeks, ikke bare den opprinnelige', () => {
  const first = {
    id: 'ir1',
    number: 'IR-001',
    status: 'sendt',
    indexId: 'ppi-byggeteknisk',
    newPeriod: '2026K2',
    newIndex: 122.9,
    newPrice: 1388.41,
    effectiveFrom: '2026-04-01',
    basisIndex: 119.5,
    originalIndex: 119.5,
  };
  const grown = series([['2025K4', 119.5], ['2026K2', 122.9], ['2026K3', 124.1]]);
  const contract = breitorget({ indexCases: [first] });
  const status = classifyContract({ contract, series: grown, today: '2026-10-20' });
  assert.equal(status.chain.original.value, 119.5);
  assert.equal(status.chain.previous.value, 122.9);
  assert.equal(status.chain.previousPrice, 1388.41);
  assert.equal(status.chain.next.value, 124.1);
  const second = computeRegulation({ draft: status.draft, series: grown, cases: [first] });
  assert.equal(second.ok, true);
  assert.equal(second.baseSum, 1388.41);
  assert.equal(second.basisPoint.value, 122.9);
  assert.notEqual(second.basisPoint.value, second.original.value);
  const thirdCase = {
    ...first,
    id: 'ir2',
    number: 'IR-002',
    newPeriod: '2026K3',
    newIndex: 124.1,
    newPrice: second.regulated,
    effectiveFrom: '2026-07-01',
  };
  const later = series([['2025K4', 119.5], ['2026K2', 122.9], ['2026K3', 124.1], ['2026K4', 123]]);
  const third = computeRegulation({
    draft: status.draft,
    series: later,
    cases: [first, thirdCase],
  });
  assert.equal(third.basisPoint.value, 124.1);
  assert.ok(third.regulated < thirdCase.newPrice);
});

test('allerede regulert periode blir ikke et nytt varsel', () => {
  const done = {
    id: 'ir1',
    status: 'godkjent',
    indexId: 'ppi-byggeteknisk',
    newPeriod: '2026K2',
    newIndex: 122.9,
    newPrice: 1388.41,
    effectiveFrom: '2026-04-01',
  };
  const contract = breitorget({ indexCases: [done] });
  const status = classifyContract({ contract, series: published, today: '2026-10-20' });
  assert.equal(status.band, 'regulert');
  assert.equal(status.attention, false);
});

test('negativ og uendret indeks', () => {
  const base = {
    id: 'ir1',
    status: 'godkjent',
    indexId: 'ppi-byggeteknisk',
    newPeriod: '2026K2',
    newIndex: 122.9,
    newPrice: 1388.41,
    effectiveFrom: '2026-04-01',
  };
  const down = series([['2025K4', 119.5], ['2026K2', 122.9], ['2026K3', 120]]);
  const contract = breitorget({ indexCases: [base] });
  const status = classifyContract({ contract, series: down, today: '2026-10-20' });
  const math = computeRegulation({ draft: status.draft, series: down, cases: [base] });
  assert.equal(math.ok, true);
  assert.ok(math.addition < 0);
  assert.ok(math.regulated < 1388.41);
  const flat = series([['2025K4', 119.5], ['2026K2', 122.9], ['2026K3', 122.9]]);
  const same = computeRegulation({ draft: status.draft, series: flat, cases: [base] });
  assert.equal(same.addition, 0);
  assert.equal(same.regulated, 1388.41);
});

test('eldre avtale uten indeksgrunnlag peker på hva som mangler', () => {
  const contract = breitorget();
  delete contract.fields.contractDate;
  contract.indexDraft.contractDate = '';
  contract.start = '';
  const status = classifyContract({ contract, series: published, today: '2026-10-20' });
  assert.equal(status.band, 'ma_vurderes');
  assert.ok(status.missing.length > 0);
});

test('overlapp avvises og samtidig redigering oppdages', () => {
  const contract = breitorget();
  const status = classifyContract({ contract, series: published, today: '2026-10-20' });
  const math = computeRegulation({ draft: status.draft, series: published });
  const entry = caseFromCalculation({
    contract,
    draft: status.draft,
    result: math,
    dates: { effectiveFrom: '2026-04-01', allowedFrom: '2026-01-01', noticeDate: '2026-03-01', regulationDate: '2026-03-01' },
    now: new Date('2026-10-20T10:00:00Z'),
  });
  const other = { ...entry, id: 'other', number: 'IR-009', status: 'godkjent', effectiveTo: '' };
  const errors = validateCase({ ...entry, letterPlain: 'brev', provisional: false }, [other], { forApproval: true });
  assert.match(errors.join(' '), /overlapper/);
  const saved = saveDraft(entry, { freeText: 'Se vedlegg.' }, [], { name: 'Geir' }, new Date('2026-10-20T10:00:00Z'));
  assert.equal(saved.case.status, 'utkast');
  assert.equal(saved.case.mailStatus, 'ikke_sendt');
  const clash = upsertCase([saved.case], { ...saved.case, freeText: 'annen' }, 4);
  assert.equal(clash.ok, false);
});

test('utkast, godkjenning, sending og feil er adskilt', () => {
  const contract = breitorget();
  const status = classifyContract({ contract, series: published, today: '2026-10-20' });
  const math = computeRegulation({ draft: status.draft, series: published });
  let entry = caseFromCalculation({
    contract,
    draft: status.draft,
    result: math,
    dates: { effectiveFrom: '2026-04-01', allowedFrom: '2026-01-01', noticeDate: '2026-01-01' },
    actor: { name: 'Geir', uid: 'u1' },
    now: new Date('2026-10-20T08:00:00Z'),
  });
  entry = { ...entry, letterPlain: 'Varsel om indeksregulering av timepriser. Ny pris 1 388,41 kr.', documentVersion: 1 };
  const approved = approveCase(entry, [], { name: 'Geir', uid: 'u1' }, new Date('2026-10-20T09:00:00Z'));
  assert.equal(approved.ok, true);
  assert.equal(approved.case.status, 'godkjent');
  assert.equal(approved.case.mailStatus, 'ikke_sendt');
  const versions = applyPriceVersion([], {
    id: 'pv',
    caseId: approved.case.id,
    validFrom: approved.case.effectiveFrom,
    validTo: '',
    rateExVat: approved.case.newPrice,
  });
  assert.equal(rateOnDate(versions, '2026-04-01'), 1388.41);
  assert.equal(rateOnDate(versions, '2026-03-31'), null);
  const started = beginSend(approved.case, {
    to: 'victor@breitorget.no',
    cc: ['geir.ove@consult1.no'],
    subject: 'Varsel',
    text: approved.case.letterPlain,
  }, { name: 'Geir' }, new Date('2026-10-20T09:05:00Z'));
  assert.equal(started.ok, true);
  const again = beginSend(started.case, { to: 'victor@breitorget.no', text: 'x'.repeat(30) }, { name: 'Geir' });
  assert.equal(again.ok, false);
  const failed = finishSend(started.case, { ok: false, error: 'Avvist' }, { name: 'Geir' }, new Date('2026-10-20T09:06:00Z'));
  assert.equal(failed.case.status, 'sendefeil');
  assert.equal(failed.case.mail.sentAt, '');
  const retry = beginSend(failed.case, { to: 'victor@breitorget.no', text: approved.case.letterPlain }, { name: 'Geir' });
  const sent = finishSend(retry.case, { ok: true, providerId: 'mail_1' }, { name: 'Geir' }, new Date('2026-10-20T09:10:00Z'));
  assert.equal(sent.case.status, 'sendt');
  assert.equal(sent.case.mail.to, 'victor@breitorget.no');
  assert.equal(sent.case.mail.providerId, 'mail_1');
  assert.match(sent.case.mail.sentAt, /^2026-10-20T/);
  const mutated = upsertCase([sent.case], { ...sent.case, newPrice: 1 }, sent.case.revision);
  assert.equal(mutated.ok, false);
  const pulled = withdrawCase(sent.case, { name: 'Geir' });
  assert.equal(pulled.ok, false);
});

test('arbeidsvindu kan åpnes direkte via URL', () => {
  const href = workspaceHref('https://protop.no/okonomi', 'breitorget', 'ir1', 'historikk');
  const url = new URL(href);
  assert.equal(url.pathname, '/hjem');
  const query = readWorkspaceQuery(url.search);
  assert.equal(query.contractId, 'breitorget');
  assert.equal(query.caseId, 'ir1');
  assert.equal(query.view, 'historikk');
  const link = indexLinkFromPath(url.pathname + url.search);
  assert.equal(link.tab, 'okonomi');
  assert.equal(link.subView, 'indeks');
  assert.equal(link.intent.contractId, 'breitorget');
  assert.equal(link.intent.view, 'historikk');
  assert.equal(link.intent.workspaceCaseId, 'ir1');
  assert.equal(indexLinkFromPath('/hjem'), null);
});

test('prosjekter uten avtale deles i aktiv og deaktivert', () => {
  const projects = [
    { id: 'p1', name: 'Aktivt', number: '100', status: 'aktiv' },
    { id: 'p2', name: 'Parkert', number: '200', status: 'arkivert' },
    { id: 'p4', name: 'Stille', number: '400', status: 'aktiv' },
    { id: 'p3', name: 'Har avtale', number: '300', status: 'aktiv' },
  ];
  const contracts = [{ ...breitorget(), projectId: 'p3' }];
  const timeEntries = [
    { projectId: 'p1', date: '2026-09-15', hours: 4 },
    { projectId: 'p2', date: '2026-10-01', hours: 8 },
    { projectId: 'p4', date: '2026-05-01', hours: 6 },
    { projectNumber: '100', date: '2026-10-01', hours: 1 },
  ];
  const rows = projectsWithoutAgreement(projects, contracts, { timeEntries, today: '2026-10-20' });
  const group = Object.fromEntries(rows.map((row) => [row.project.id, row.group]));
  assert.equal(group.p1, 'aktiv');
  assert.equal(group.p2, 'deaktivert');
  assert.equal(group.p4, 'deaktivert');
  assert.equal(group.p3, undefined);
  const counts = deskCounts(contracts, published, '2026-10-20', projects, timeEntries);
  assert.equal(counts.oppmerksomhet, 3);
  assert.equal(counts.aktiv, 1);
  assert.equal(counts.deaktivert, 2);
  assert.equal(counts.kan_reguleres, 1);
});

test('kjeden blander ikke original indeks inn i neste grunnlag', () => {
  const chain = buildIndexChain({
    draft: {
      indexId: 'ppi-byggeteknisk',
      model: 'engang',
      contractDate: '2025-12-19',
      lines: [{ text: 'Timepris', unit: 'time', rate: '1350', included: true }],
      terms: { frequency: 'quarter' },
    },
    series: published,
    cases: [],
  });
  assert.equal(chain.original.period, '2025K4');
  assert.equal(chain.previous.period, '2025K4');
  assert.equal(chain.next.period, '2026K2');
  assert.equal(chain.mode, 'forrige');
});

test('alle brev som ikke er sendt kan slettes', () => {
  assert.equal(canDeleteCase({ id: 'a', status: 'utkast' }), true);
  assert.equal(canDeleteCase({ id: 'b', status: 'trukket' }), true);
  assert.equal(canDeleteCase({ id: 'c', status: 'godkjent' }), true);
  assert.equal(canDeleteCase({ id: 'c2', status: 'klar_til_kontroll' }), true);
  assert.equal(canDeleteCase({ id: 'e', status: 'sendefeil' }), true);
  assert.equal(canDeleteCase({ id: 'l', letterPlain: 'gammelt varsel', after: 1388.41 }), true);
  assert.equal(canDeleteCase({ id: 'd', status: 'sendt' }), false);
  assert.equal(canDeleteCase({ id: 's', status: 'sending' }), false);
  assert.equal(canDeleteCase({ id: 'f', status: 'utkast', mailStatus: 'sendt' }), false);
  assert.equal(canDeleteCase({ id: 'h', letterPlain: 'gammelt', sentAt: '2026-10-01' }), false);
  assert.equal(canDeleteCase({ status: 'utkast' }), false);
});

test('manuelle endringer i brevet lagres på saken sammen med teksten', () => {
  const contract = breitorget();
  const status = classifyContract({ contract, series: published, today: '2026-10-20' });
  const math = computeRegulation({ draft: status.draft, series: published });
  const entry = caseFromCalculation({ contract, draft: status.draft, result: math, dates: { effectiveFrom: '2026-01-01' } });
  const letter = { title: 'Varsel', plain: 'Varsel om ny timepris' };
  const attached = attachLetter({ ...entry, letterEdits: { Tittel: '  Varsel om   ny timepris ', Feil: 3 } }, letter, math, null);
  assert.equal(attached.ok, true);
  assert.deepEqual(attached.case.letterEdits, { Tittel: 'Varsel om ny timepris' });
  assert.equal(attached.case.letterPlain, 'Varsel om ny timepris');
  const approved = approveCase(attached.case, [], null);
  assert.equal(approved.ok, true);
  const locked = attachLetter({ ...approved.case, letterEdits: { Tittel: 'Annen' } }, letter, math, null);
  assert.equal(locked.ok, false, 'ferdigstilt brev kan ikke endres');
});
