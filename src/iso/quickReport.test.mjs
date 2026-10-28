/**
 * Hurtigmelding av RUH fra telefonen (ISO-03): saken bygges uten hele ISO-tilstanden,
 * prosjektet fylles inn fra siste timeføring, og køen uten nett gir aldri dobbelt opp.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QUICK_TYPES, buildQuickFinding, isOfflineError, lastProjectFromHours, queueAdd, queueFailed, queueItem, queueRemove, quickSheetTitle, quickTitle,
  reporterEmployee,
} from './quickReport.js';
import { newFindingEffects } from './integrations.js';
import { isImageAttachment } from './findings.js';

const PER = { uid: 'u2', name: 'Per Montør' };
const now = new Date('2026-10-28T09:30:00Z');
const SYSTEM = {
  standards: ['ISO9001', 'ISO45001'],
  roleMap: { hse_manager: { name: 'Hilde HMS', uid: 'h1' }, quality_manager: { name: 'Anne Kvalitet', uid: 'q1' }, top_management: { name: 'Siri Leder', uid: 't1' } },
};

test('ISO-03: fem typer med store knapper, RUH først', () => {
  assert.equal(QUICK_TYPES[0].id, 'nestenulykke');
  assert.deepEqual(QUICK_TYPES.map((t) => t.id), ['nestenulykke', 'hms', 'miljo', 'prosess', 'forbedring']);
});

test('ISO-03: type og tekst holder; tittel, behandler, krav og prosjekt fylles inn', () => {
  const res = buildQuickFinding({
    type: 'nestenulykke', text: 'Løs planke på stillaset i 3. etasje. Holdt på å tråkke gjennom.', projectId: 'p1', projectName: '1042 Kontorbygg',
  }, { actor: PER, system: SYSTEM, id: 'avv_fast', now });
  assert.equal(res.ok, true, res.error);
  const f = res.finding;
  assert.equal(f.id, 'avv_fast', 'fast id fra køen');
  assert.equal(f.title, 'Løs planke på stillaset i 3. etasje.');
  assert.equal(f.assigneeUid, 'h1', 'RUH går til HMS-leder');
  assert.equal(f.projectId, 'p1');
  assert.equal(f.quick, true);
  assert.equal(f.reportedByUid, 'u2');
  assert.equal(f.state, 'registrert');
  assert.match(f.number, /^AVV-2026-\d{3}$/);
  assert.ok(f.links.requirementIds.length > 0, 'koblet til avvikskravet uten å laste kravmatrisen');
  assert.ok(res.events.every((e) => e.entityId === 'avv_fast'));
  const effects = newFindingEffects(f, SYSTEM);
  assert.ok(effects.some((e) => e.type === 'createTask' && e.assigneeUid === 'h1'), 'behandler får oppgave');
});

test('ISO-03: foto uten tekst er nok; uten tekst og foto avvises', () => {
  assert.equal(buildQuickFinding({ type: 'miljo', text: '' }, { actor: PER, system: SYSTEM, now }).ok, false);
  assert.equal(buildQuickFinding({ type: '', text: 'x' }, { actor: PER, system: SYSTEM, now }).ok, false);
  const photo = buildQuickFinding({ type: 'miljo', attachments: [{ url: 'https://x/y.jpg', path: 'families/c/iso/findings/a/1.jpg' }] }, { actor: PER, system: SYSTEM, now });
  assert.equal(photo.ok, true, photo.error);
  assert.equal(photo.finding.attachments.length, 1);
  assert.equal(photo.finding.attachments[0].kind, 'foto');
  assert.equal(isImageAttachment(photo.finding.attachments[0]), true, 'vises som bilde i saken');
  assert.equal(photo.finding.occurredTime, `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  assert.match(photo.finding.title, /foto/i);
});

test('ISO-03: personskade er skjermet, og «alvorlig» gir triage samme dag og varsel til ledelsen', () => {
  const res = buildQuickFinding({ type: 'hms', text: 'Kutt i hånden', serious: true }, { actor: PER, system: SYSTEM, now });
  assert.equal(res.finding.restricted, true);
  assert.equal(res.finding.injuryClass, 'alvorlig');
  assert.equal(res.finding.triageDue, '2026-10-28');
  const effects = newFindingEffects(res.finding, SYSTEM);
  assert.ok(effects.some((e) => e.type === 'push' && e.uids.includes('t1')));
});

test('ISO-03: uten ISO-oppsett (melder uten lesetilgang) lagres saken likevel, uten behandler', () => {
  const res = buildQuickFinding({ type: 'prosess', text: 'Feil mål på vindu' }, { actor: PER, system: null, now });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.finding.assigneeUid, '');
});

test('ISO-03: tittelen er første setning, høyst 80 tegn', () => {
  assert.equal(quickTitle('Søl av olje ved aggregat! Tørket opp.'), 'Søl av olje ved aggregat!');
  assert.ok(quickTitle('a'.repeat(200)).length <= 80);
});

test('ISO-03: prosjektet kommer fra siste timeføring (egen, aktiv, siste 45 dager)', () => {
  const projects = [
    { id: 'p1', number: '1041', name: 'Skole' },
    { id: 'p2', number: '1042', name: 'Kontorbygg' },
    { id: 'p3', number: '1043', name: 'Arkivert', status: 'arkivert' },
  ];
  const hours = [
    { employeeId: 'e1', projectId: 'p1', date: '2026-10-20' },
    { employeeId: 'e1', projectId: 'p2', date: '2026-10-27' },
    { employeeId: 'e1', projectId: 'p3', date: '2026-10-28' },
    { employeeId: 'e9', projectId: 'p1', date: '2026-10-28' },
    { employeeId: 'e1', projectId: 'p1', date: '2026-07-01' },
  ];
  assert.deepEqual(lastProjectFromHours(hours, 'e1', projects, now), { id: 'p2', label: '1042 Kontorbygg' });
  assert.equal(lastProjectFromHours(hours.filter((h) => h.date < '2026-08-01'), 'e1', projects, now), null, 'for gammelt');
  assert.equal(lastProjectFromHours(hours, '', projects, now), null);
});

test('ISO-03: køen uten nett: fast id, ingen dobbeltlagring, eldste beholdes til de er sendt', () => {
  const a = queueItem({ type: 'nestenulykke', text: 'A', photos: [{ uri: 'file:///a.jpg' }] }, { actor: PER, now });
  const b = queueItem({ type: 'miljo', text: 'B' }, { actor: PER, now });
  let q = queueAdd([], a);
  q = queueAdd(q, a);
  q = queueAdd(q, b);
  assert.deepEqual(q.map((x) => x.id), [a.id, b.id]);
  assert.equal(q[0].input.photos.length, 1);
  q = queueFailed(q, b.id, 'Mangler tilgang');
  assert.equal(q[1].tries, 1);
  assert.deepEqual(queueRemove(q, a.id).map((x) => x.id), [b.id]);
  // Samme melding bygget to ganger fra køen gir samme sak (samme id).
  const one = buildQuickFinding(a.input, { actor: PER, system: SYSTEM, id: a.id, now }).finding;
  const two = buildQuickFinding(a.input, { actor: PER, system: SYSTEM, id: a.id, now }).finding;
  assert.equal(one.id, two.id);
});

test('ISO-03: nettfeil legger meldingen i kø, tilgangsfeil vises til brukeren', () => {
  assert.equal(isOfflineError({ code: 'unavailable' }), true);
  assert.equal(isOfflineError({ code: 'iso/offline' }), true);
  assert.equal(isOfflineError(new Error('Failed to get document because the client is offline.')), true);
  assert.equal(isOfflineError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }), false);
  assert.equal(isOfflineError(new Error('Velg hva du melder.')), false);
});

test('ISO-04: anonym melding lagrer verken navn eller bruker-id, heller ikke i historikken', () => {
  const res = buildQuickFinding({ type: 'nestenulykke', text: 'Stillaset mangler rekkverk', anonymous: true }, { actor: { uid: '', name: 'Anonym melder' }, system: SYSTEM, now });
  assert.equal(res.ok, true, res.error);
  const f = res.finding;
  assert.equal(f.anonymous, true);
  assert.equal(f.reportedByUid, '');
  assert.equal(f.reportedBy, 'Anonym melder');
  assert.equal(f.updatedByUid, '');
  assert.ok(f.history.every((h) => !h.uid));
  assert.ok(res.events.every((e) => !e.actorUid));
  // Med innlogget melder er saken ikke anonym, selv om valget er satt (reglene krever tom bruker-id).
  assert.equal(buildQuickFinding({ type: 'miljo', text: 'Søl', anonymous: true }, { actor: PER, system: SYSTEM, now }).finding.anonymous, false);
});

test('ISO-03: overskriften i arket beholder RUH med store bokstaver', () => {
  assert.equal(quickSheetTitle('nestenulykke'), 'Meld RUH');
  assert.equal(quickSheetTitle('prosess'), 'Meld kvalitetsavvik');
  assert.equal(quickSheetTitle('ukjent'), 'Meld RUH');
});

test('ISO-03: eier uten ansattpost fra tilgangen finner egen post via personUid, så prosjektet foreslås', () => {
  const employees = [{ id: 'e1', personUid: 'u9' }, { id: 'e2', personUid: 'u2' }];
  assert.equal(reporterEmployee(null, employees, 'u2').id, 'e2');
  assert.equal(reporterEmployee({ id: 'e1' }, employees, 'u2').id, 'e1');
  assert.equal(reporterEmployee(null, employees, ''), null);
  assert.equal(reporterEmployee(null, employees, 'ukjent'), null);
  const hours = [{ employeeId: 'e2', projectId: 'p1', date: '2026-10-27' }];
  assert.equal(lastProjectFromHours(hours, reporterEmployee(null, employees, 'u2').id, [{ id: 'p1', number: '1042', name: 'Fjordgata' }], now).id, 'p1');
});
