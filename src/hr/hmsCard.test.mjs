/**
 * HMS-kort per ansatt i «Lovpålagt» og oversiktsliste for byggeplass (byggherreforskriften § 15).
 */
import assert from 'node:assert/strict';
import {
  HMS_CARD_WARN_DAYS,
  hmsCardAlerts,
  hmsCardFor,
  hmsCardRequirement,
  parseHmsQr,
  hmsCardStatus,
  hmsComplianceStatus,
  normalizeHmsCard,
  siteOverviewCsv,
  siteOverviewRows,
  upsertHmsCard,
} from './hmsCard.js';
import { syncComplianceFromEvidence } from './compliance.js';
import { emptyHrState, employeeVisibleSlice, hrStateHasData, normalizeHrState } from './model.js';

// Kortet normaliseres: norsk dato blir ISO, org.nr. bare sifre.
const card = normalizeHmsCard({ employeeId: 'e1', number: ' HMS 1234567 ', validTo: '31.12.2026', employerOrgnr: '916 538 804' });
assert.equal(card.number, 'HMS 1234567');
assert.equal(card.validTo, '2026-12-31');
assert.equal(card.employerOrgnr, '916538804');
assert.equal(card.id, 'hms_e1');

// Status og varsel før utløp.
assert.equal(HMS_CARD_WARN_DAYS, 30);
assert.equal(hmsCardStatus(null, '2026-10-27').id, 'missing');
assert.equal(hmsCardStatus({ number: 'X' }, '2026-10-27').label, 'Utløpsdato mangler');
assert.deepEqual(hmsCardStatus(card, '2026-10-27'), { id: 'valid', label: 'Gyldig til 31.12.2026', daysLeft: 65 });
assert.deepEqual(hmsCardStatus(card, '2026-12-01'), { id: 'expiring', label: 'Utløper 31.12.2026 (om 30 dager)', daysLeft: 30 });
assert.equal(hmsCardStatus(card, '2026-12-30').label, 'Utløper 31.12.2026 (om 1 dag)');
assert.deepEqual(hmsCardStatus(card, '2027-01-01'), { id: 'expired', label: 'Utløpt 31.12.2026', daysLeft: -1 });
assert.equal(hmsComplianceStatus(card, '2026-12-15'), 'ok', 'gyldig til utløpsdatoen');
assert.equal(hmsComplianceStatus(card, '2027-01-01'), 'overdue');
assert.equal(hmsComplianceStatus(null), 'missing');

// Ett kort per ansatt. Tomme felt fjerner kortet.
let cards = upsertHmsCard([], card);
cards = upsertHmsCard(cards, { employeeId: 'e2', number: 'B', validTo: '2026-11-10' });
cards = upsertHmsCard(cards, { employeeId: 'e1', number: 'HMS 7654321', validTo: '2028-01-31' });
assert.equal(cards.length, 2);
assert.equal(hmsCardFor('e1', cards).number, 'HMS 7654321');
assert.equal(upsertHmsCard(cards, { employeeId: 'e2', number: '', validTo: '' }).length, 1);
assert.equal(hmsCardFor('', cards), null);

// «Lovpålagt»: punktet følger kortet. «Ikke aktuelt» står.
{
  const ok = syncComplianceFromEvidence([], { employeeId: 'e1', hmsCards: cards, today: '2026-10-27' });
  const row = ok.find((item) => item.catalogId === 'hms_card');
  assert.equal(row.status, 'ok');
  assert.equal(row.dueDate, '2028-01-31');
  assert.equal(row.note, '', 'kortnummeret står i statuslinjen, ikke som notat');
  const expired = syncComplianceFromEvidence([], { employeeId: 'e2', hmsCards: cards, today: '2026-12-01' });
  assert.equal(expired.find((item) => item.catalogId === 'hms_card').status, 'overdue');
  const none = syncComplianceFromEvidence([{ catalogId: 'hms_card', employeeId: 'e3', status: 'ok' }], { employeeId: 'e3', hmsCards: cards });
  assert.equal(none.find((item) => item.catalogId === 'hms_card' && item.employeeId === 'e3').status, 'missing', 'avkrysning uten kort er ikke nok');
  const na = syncComplianceFromEvidence([{ catalogId: 'hms_card', employeeId: 'e3', status: 'na' }], { employeeId: 'e3', hmsCards: [] });
  assert.equal(na.find((item) => item.catalogId === 'hms_card').status, 'na');
}

// HR-tilstanden tar vare på kortene, uten å røre ansattposten.
{
  assert.deepEqual(emptyHrState().hmsCards, []);
  const state = normalizeHrState({ hmsCards: cards });
  assert.equal(state.hmsCards.length, 2);
  assert.equal(hrStateHasData({ hmsCards: cards }), true);
  assert.deepEqual(employeeVisibleSlice(state, 'e1').hmsCards.map((row) => row.employeeId), ['e1'], 'den ansatte ser bare sitt eget kort');
}

// Varsel for utløpte og snart utløpte kort, ikke for «Ikke aktuelt» eller slettede.
{
  const employees = [
    { id: 'e1', person: { firstName: 'Ada', lastName: 'Nordmann' } },
    { id: 'e2', person: { firstName: 'Bo', lastName: 'Berg' } },
    { id: 'e3', person: { firstName: 'Cid' }, company: { status: 'deleted' } },
  ];
  const all = [...cards, { employeeId: 'e3', number: 'C', validTo: '2020-01-01' }];
  const alerts = hmsCardAlerts(employees, all, { today: '2026-10-27' });
  assert.deepEqual(alerts.map((row) => [row.name, row.status]), [['Bo Berg', 'expiring']]);
  assert.deepEqual(hmsCardAlerts(employees, all, { today: '2026-11-11' }).map((row) => row.status), ['expired']);
  assert.deepEqual(hmsCardAlerts(employees, all, { today: '2026-11-11', notApplicable: ['e2'] }), []);
}

// Oversiktslisten: én rad per dag, prosjekt og person, med HMS-kort og arbeidsgiver.
{
  const employees = [
    { id: 'e1', person: { firstName: 'Ada', lastName: 'Nordmann', birthDate: '1990-05-04' } },
    { id: 'e2', person: { firstName: 'Bo', lastName: 'Berg' } },
  ];
  const entries = [
    { employeeId: 'e1', projectId: 'p1', projectNumber: '10791', projectName: 'Jåsund skole', date: '2026-10-26', hours: 4 },
    { employeeId: 'e1', projectId: 'p1', projectNumber: '10791', projectName: 'Jåsund skole', date: '2026-10-26', hours: 3.5 },
    { employeeId: 'e2', projectId: 'p1', projectNumber: '10791', projectName: 'Jåsund skole', date: '2026-10-26', hours: 8 },
    { employeeId: 'e1', projectId: 'p2', projectNumber: '10610', projectName: 'Kino; Kino', date: '2026-10-27', hours: 2 },
    { employeeId: 'e1', projectId: 'p1', projectNumber: '10791', projectName: 'Jåsund skole', date: '2026-10-20', hours: 8 },
    { employeeId: 'e2', projectId: 'p1', projectNumber: '10791', projectName: 'Jåsund skole', date: '2026-10-27', hours: 0 },
  ];
  const rows = siteOverviewRows({
    entries,
    employees,
    cards: [{ employeeId: 'e1', number: 'HMS 1', validTo: '2027-01-01' }],
    employer: { name: 'Consult1 AS', orgnr: '916 538 804' },
    from: '2026-10-26',
    to: '2026-10-27',
  });
  assert.deepEqual(rows.map((row) => [row.date, row.projectNumber, row.name, row.hours, row.hmsStatus]), [
    ['2026-10-26', '10791', 'Ada Nordmann', 7.5, 'valid'],
    ['2026-10-26', '10791', 'Bo Berg', 8, 'missing'],
    ['2026-10-27', '10610', 'Ada Nordmann', 2, 'valid'],
  ]);
  assert.equal(rows[0].birthDate, '1990-05-04');
  assert.equal(rows[0].employer, 'Consult1 AS');
  assert.equal(rows[0].employerOrgnr, '916538804');
  assert.equal(rows[0].hmsCardNumber, 'HMS 1');
  assert.equal(siteOverviewRows({ entries, employees, projectId: 'p2' }).length, 1);
  const csv = siteOverviewCsv(rows).split('\n');
  assert.equal(csv[0], 'Dato;Prosjektnr;Prosjekt;Navn;Fødselsdato;Arbeidsgiver;Org.nr.;HMS-kort;HMS-kort gyldig til;HMS-kort status;Timer');
  assert.equal(csv[1], '26.10.2026;10791;Jåsund skole;Ada Nordmann;04.05.1990;Consult1 AS;916538804;HMS 1;01.01.2027;Gyldig;7,5');
  assert.equal(csv[2], '26.10.2026;10791;Jåsund skole;Bo Berg;;Consult1 AS;916538804;;;Mangler;8');
  assert.match(csv[3], /^27\.10\.2026;10610;"Kino; Kino";Ada Nordmann/, 'semikolon i tekst står i anførselstegn');
}

{
  // HMS-kort er ikke påbudt i alle bransjer. Næringskoden avgjør, bedriften kan overstyre.
  assert.equal(hmsCardRequirement({ naeringskode: '43.210' }).required, true, 'elektriker: bygg og anlegg');
  assert.match(hmsCardRequirement({ naeringskode: '41.200' }).text, /bygg og anlegg \(næringskode 41\.200\)/);
  assert.equal(hmsCardRequirement({ naeringskode: '81.210' }).required, true, 'renhold');
  assert.equal(hmsCardRequirement({ naeringskode: '62.010' }).required, false, 'IT-konsulent');
  assert.match(hmsCardRequirement({ naeringskode: '62.010' }).text, /bygg og anlegg, renhold og bilpleie/);
  assert.equal(hmsCardRequirement({}).required, false, 'uten næringskode');
  assert.equal(hmsCardRequirement({ naeringskode: '62.010', setting: 'on' }).required, true, 'bedriften krever selv');
  assert.equal(hmsCardRequirement({ naeringskode: '43.210', setting: 'off' }).required, false, 'bedriften har valgt bort');
  assert.equal(hmsCardRequirement({ naeringskode: '43.210', setting: 'tull' }).required, true, 'ukjent valg følger næringskoden');

  // Innstillingen lagres i HR, og bare kjente verdier.
  assert.deepEqual(emptyHrState().settings, { hmsCard: '' });
  assert.equal(normalizeHrState({ settings: { hmsCard: 'on' } }).settings.hmsCard, 'on');
  assert.equal(normalizeHrState({ settings: { hmsCard: 'ja' } }).settings.hmsCard, '');
  assert.equal(normalizeHrState({ hmsRequired: false }).hmsRequired, undefined, 'utregnet krav lagres ikke');

  // QR-koden: lenken lagres, rent kortnummer fylles inn. Annet avvises.
  assert.deepEqual(parseHmsQr(' https://hmskort.no/v/abc123 '), { url: 'https://hmskort.no/v/abc123', number: '' });
  assert.deepEqual(parseHmsQr('1234 5678'), { url: '', number: '12345678' });
  assert.deepEqual(parseHmsQr('http://usikker.no/x'), { url: '', number: '' });
  assert.deepEqual(parseHmsQr('hei'), { url: '', number: '' });
  const scanned = normalizeHmsCard({ employeeId: 'e1', qrUrl: 'https://hmskort.no/v/abc123' });
  assert.equal(scanned.qrUrl, 'https://hmskort.no/v/abc123');
  assert.equal(normalizeHmsCard({ employeeId: 'e1', qrUrl: 'javascript:alert(1)' }).qrUrl, '');
  assert.equal(upsertHmsCard([], { employeeId: 'e1', qrUrl: 'https://hmskort.no/v/abc123' }).length, 1, 'skannet kort uten nummer lagres');
}

console.log('hmsCard.test.mjs: ok');
