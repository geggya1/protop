import assert from 'node:assert/strict';
import {
  addMonths,
  agendaStats,
  collectActions,
  groupByMonth,
  inListTab,
  itemSchedule,
  listCounts,
  meetingPhase,
  moveItem,
  nextMeetingFrom,
  nextRecurrenceDate,
  nextSeriesNumber,
  normalizeMeeting,
  canManageMeeting,
  canSeeMeeting,
  previousInSeries,
  setActionDone,
  timeRange,
  addItem,
  addChapter,
} from './model.js';
import {
  cancelMeeting,
  canDeleteMeeting,
  endMeeting,
  finalizeChecks,
  finalizeMeeting,
  invitationChecks,
  primaryAction,
  recordInvitation,
  recordMinutesSent,
  reopenMeeting,
  startMeeting,
  updateMeeting,
} from './flow.js';
import {
  agendaFromForm,
  allTemplates,
  bestTemplateFor,
  builtinTemplates,
  guessType,
  templateFromMeeting,
  templateStats,
} from './templates.js';
import { minutesDocument, minutesFileName, minutesPlainText } from './minutesDoc.js';
import { buildMinutesPdf, pdfSafe, wrapText } from './minutesPdf.js';
import { localAgenda, localSummary, normalizeAgendaReply } from './ai.js';
import { meetingIcs } from './ics.js';
import { demoMeetings } from './demoData.js';
import { libraryForm } from '../forms/ksLibrary.js';

const TODAY = '2026-10-27';
const all = demoMeetings(TODAY);
const byId = (id) => all.find((m) => m.id === id);

/* ───────── Dato og tid ───────── */
assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
assert.equal(nextRecurrenceDate({ freq: 'biweekly' }, '2026-10-27'), '2026-11-10');
assert.equal(nextRecurrenceDate({ freq: 'quarterly' }, '2026-11-30'), '2027-02-28');
assert.equal(nextRecurrenceDate({ freq: 'none' }, '2026-10-27'), '');
assert.equal(timeRange('9:00', '10.30'), 'kl. 09.00–10.30');

/* ───────── Faser og lister ───────── */
assert.equal(meetingPhase(byId('mote_kino_4'), TODAY), 'idag');
assert.equal(meetingPhase(byId('mote_kino_3'), TODAY), 'ferdigstilt');
assert.equal(meetingPhase(byId('mote_amu_q3'), TODAY), 'referat', 'Avsluttet møte uten ferdigstilt referat er «Til referat»');
assert.equal(meetingPhase(byId('mote_oppstart_jasund'), TODAY), 'utkast');
assert.equal(meetingPhase({ status: 'innkalt', date: '2026-10-01' }, TODAY), 'referat', 'Passert innkalt møte venter på referat');
const counts = listCounts(all, TODAY);
assert.equal(counts.alle, all.length);
assert.equal(counts.referat, 1);
assert.equal(counts.utenDato, 1);
assert.ok(inListTab(byId('mote_styre_q4'), 'kommende', TODAY));
assert.ok(!inListTab(byId('mote_kunde_sola'), 'kommende', TODAY));
assert.equal(groupByMonth([byId('mote_oppstart_jasund')])[0].label, 'Uten dato');

/* ───────── Dagsorden ───────── */
const kino4 = byId('mote_kino_4');
const schedule = itemSchedule(kino4);
const firstItem = kino4.chapters[0].items[0];
const secondItem = kino4.chapters[0].items[1];
assert.equal(schedule[firstItem.id], '09:00');
assert.equal(schedule[secondItem.id], '09:02');
const moved = moveItem(kino4, firstItem.id, 1);
assert.equal(moved.chapters[0].items[1].id, firstItem.id);
const lastOfFirst = kino4.chapters[0].items[kino4.chapters[0].items.length - 1];
const crossed = moveItem(kino4, lastOfFirst.id, 1);
assert.equal(crossed.chapters[1].items[0].id, lastOfFirst.id, 'Punktet flyttes over i neste kapittel');
const withItem = addItem(normalizeMeeting({}), 'finnes-ikke', { title: 'Første sak' });
assert.equal(withItem.meeting.chapters.length, 1, 'Tomt møte får et kapittel når første punkt legges til');
assert.equal(addChapter(withItem.meeting).meeting.chapters.length, 2);

/* ───────── Serie og videreføring ───────── */
const kino3 = byId('mote_kino_3');
assert.equal(nextSeriesNumber(all, 'serie_kino'), 5);
assert.equal(previousInSeries(all, kino4).id, 'mote_kino_3');
const next = nextMeetingFrom(kino3, { at: '2026-10-27T10:00:00Z', by: 'u1' });
assert.equal(next.number, 4);
assert.equal(next.status, 'utkast');
assert.equal(next.date, kino3.nextDate);
const carried = next.chapters.flatMap((c) => c.items).flatMap((i) => i.actions);
assert.deepEqual(carried.map((a) => a.id).sort(), ['akt_em04', 'akt_farge', 'akt_varsel'], 'Åpne punkter følger med, utførte blir igjen');
assert.ok(carried.every((a) => a.originNumber >= 2));
assert.ok(next.chapters.flatMap((c) => c.items).every((i) => !i.notes && !i.decisions.length), 'Notater og beslutninger nullstilles');
assert.ok(next.participants.every((p) => p.attendance === 'ukjent'));
assert.equal(next.participants.length, kino3.participants.length);

/* ───────── Oppfølging på tvers ───────── */
const actions = collectActions(all, TODAY);
const em04 = actions.filter((a) => a.id === 'akt_em04');
assert.equal(em04.length, 1, 'Samme punkt i flere møter telles én gang');
assert.equal(em04[0].meetingId, 'mote_kino_4', 'Nyeste møte bestemmer status');
assert.ok(em04[0].overdue);
assert.ok(actions.find((a) => a.id === 'akt_rekkverk').done);
const doneOnce = setActionDone(kino4, 'akt_em04', true, '2026-10-27T09:30:00Z');
assert.ok(agendaStats(doneOnce).openActions < agendaStats(kino4).openActions);

/* ───────── Tilgang ───────── */
const styre = byId('mote_styre_q4');
assert.equal(canSeeMeeting(styre, { uid: 'someone' }), false, 'Styremøte er bare for deltakerne');
assert.equal(canSeeMeeting(styre, { email: 'thomas@consult1.no' }), true);
assert.equal(canSeeMeeting(styre, { admin: true }), true);
assert.equal(canManageMeeting(kino4, { email: 'linda@consult1.no' }), true, 'Referent kan styre møtet');
assert.equal(canManageMeeting(kino4, { email: 'kari@rorvarme.no' }), false);

/* ───────── Livsløp ───────── */
const draft = normalizeMeeting({
  title: 'Prøvemøte',
  chapters: [{ title: 'Saker', items: [{ title: 'Sak 1', minutes: 10 }] }],
  participants: [{ name: 'Ola', email: 'ola@x.no', role: 'leder' }, { name: 'Kari', role: 'deltaker' }],
});
let check = invitationChecks(draft);
assert.equal(check.ok, false);
assert.ok(check.blocking.some((b) => b.id === 'date'));
const dated = updateMeeting(draft, { date: '2026-11-02', start: '09:00', end: '10:00', location: 'Kontoret' }).meeting;
check = invitationChecks(dated);
assert.equal(check.ok, true);
assert.ok(check.warnings.some((w) => w.id === 'email'), 'Varsler om deltaker uten e-post');
assert.equal(primaryAction(dated).id, 'invite');
const invited = recordInvitation(dated, { to: ['ola@x.no'], by: 'u1', byName: 'Ola' });
assert.equal(invited.meeting.status, 'innkalt');
assert.match(invited.meeting.log.at(-1).text, /Innkalling sendt til 1 mottaker/);
assert.equal(canDeleteMeeting(invited.meeting), false, 'Innkalt møte avlyses, ikke slettes');
const started = startMeeting(invited.meeting);
assert.equal(started.meeting.status, 'pagar');
assert.ok(started.meeting.participants.every((p) => p.attendance === 'tilstede'), 'Oppmøte settes til stede ved start');
let blocked = finalizeMeeting(started.meeting);
assert.equal(blocked.ok, false, 'Uten referat kan møtet ikke ferdigstilles');
assert.match(blocked.error, /referat/);
const noted = updateMeeting(started.meeting, {
  chapters: started.meeting.chapters.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, notes: 'Gjennomgått.' })) })),
}).meeting;
const ended = endMeeting(noted);
assert.equal(primaryAction(ended.meeting).id, 'finalize');
const finalized = finalizeMeeting(ended.meeting, { by: 'u1', byName: 'Ola', at: '2026-11-02T10:05:00Z' });
assert.equal(finalized.ok, true);
assert.equal(finalized.meeting.status, 'ferdigstilt');
assert.equal(finalized.meeting.revision, 1);
assert.equal(updateMeeting(finalized.meeting, { title: 'Ny' }).ok, false, 'Ferdigstilt referat er låst');
const sent = recordMinutesSent(finalized.meeting, { to: ['ola@x.no'] });
assert.equal(sent.meeting.status, 'sendt');
assert.equal(reopenMeeting(sent.meeting, { reason: '' }).ok, false, 'Gjenåpning krever begrunnelse');
const reopened = reopenMeeting(sent.meeting, { reason: 'Feil frist på punkt 1.1' });
assert.equal(reopened.meeting.status, 'pagar');
const rev2 = finalizeMeeting(reopened.meeting, { at: '2026-11-03T08:00:00Z' });
assert.equal(rev2.meeting.revision, 2);
assert.match(rev2.meeting.log.at(-1).text, /revisjon 2/);
assert.equal(cancelMeeting(rev2.meeting).ok, false);
const cancelled = cancelMeeting(dated, { reason: 'Sykdom' });
assert.equal(cancelled.meeting.status, 'avlyst');
assert.equal(primaryAction(cancelled.meeting), null);
assert.ok(finalizeChecks(byId('mote_amu_q3')).ok);

/* ───────── Maler og skjema ───────── */
assert.ok(builtinTemplates().length >= 10);
for (const tpl of builtinTemplates()) {
  const stats = templateStats(tpl);
  assert.ok(stats.items > 0, `${tpl.name} har punkter`);
  assert.ok(stats.minutes > 0, `${tpl.name} har varighet`);
}
const own = templateFromMeeting(kino3, { name: 'Vår byggemøtemal' });
assert.equal(own.name, 'Vår byggemøtemal');
assert.equal(own.durationMin, 90);
assert.ok(own.chapters.every((c) => c.items.every((i) => !('notes' in i) || !i.notes)));
assert.equal(allTemplates([own])[0].name, 'Vår byggemøtemal');
assert.equal(guessType('Byggemøte nr 3 på plassen'), 'byggemote');
assert.equal(guessType('Kvartalsvis AMU'), 'hms');
assert.equal(bestTemplateFor('styremøte med budsjett').typeId, 'styre');

const ksForm = libraryForm('motereferat');
const fromKs = agendaFromForm(ksForm);
assert.deepEqual(fromKs.map((c) => c.title), ['Overskrift', 'Overskrift', 'Overskrift', 'Overskrift'], 'Grupperadene i «Saker» blir kapitler');
assert.ok(fromKs.every((c) => c.items.length >= 1));
const custom = agendaFromForm({
  title: 'Vernerunde',
  fields: [
    { kind: 'title', label: 'Generelt' },
    { kind: 'text', label: 'Prosjektnavn' },
    { kind: 'long', label: 'Orden og ryddighet', help: 'Er det ryddig på plassen?' },
    { kind: 'choice', label: 'Verneutstyr i bruk', options: [{ label: 'Ja' }, { label: 'Nei' }] },
    { kind: 'title', label: 'Tiltak' },
    { kind: 'table', label: 'Deltakere', rows: [] },
    { kind: 'long', label: 'Tiltak og ansvar' },
    { kind: 'sign', label: 'Signatur' },
  ],
});
assert.deepEqual(custom.map((c) => c.title), ['Generelt', 'Tiltak']);
assert.deepEqual(custom[0].items.map((i) => i.title), ['Orden og ryddighet', 'Verneutstyr i bruk']);
assert.match(custom[0].items[1].description, /Valg: Ja, Nei/);

/* ───────── Referatet ───────── */
const doc = minutesDocument(kino3, { company: { name: 'Consult1 AS' } });
assert.equal(doc.draft, false);
assert.equal(doc.label, 'REFERAT');
assert.match(doc.subtitle, /Møte nr\. 3/);
assert.match(doc.keyline, /4 av 5 til stede/);
assert.equal(doc.participants.find((p) => p.name === 'Kari Nilsen').mark, 'F');
assert.equal(doc.participants.find((p) => p.name === 'Martin Solberg').mark, 'K');
assert.ok(doc.actions[0].done === false, 'Åpne oppfølgingspunkter først');
const invitation = minutesDocument(kino4, { kind: 'innkalling' });
assert.equal(invitation.sections[0].items[0].start, '09:00');
assert.equal(invitation.sections[0].items[0].notes, '', 'Innkallingen viser ikke notater');
assert.equal(minutesFileName(kino3), 'Referat Byggemøte Kino Kino nr 3 2026-10-13.pdf');
assert.match(minutesPlainText(kino3), /Oppfølging/);

assert.equal(pdfSafe('a b​c−d'), 'a bc-d');
assert.deepEqual(wrapText('kort', 100, 9), ['kort']);
assert.ok(wrapText('https://eksempel.no/'.padEnd(200, 'x'), 120, 9).length > 2, 'Lange lenker deles');
for (const meeting of all) {
  for (const kind of ['referat', 'innkalling']) {
    const bytes = buildMinutesPdf(meeting, { kind, company: { name: 'Consult1 AS' } });
    const head = new TextDecoder().decode(bytes.slice(0, 8));
    assert.equal(head, '%PDF-1.4');
    const body = new TextDecoder().decode(bytes);
    assert.ok(body.includes('%%EOF'));
    assert.ok(!/\(\?+\)/.test(body), `${meeting.title}: ingen tegn ble til «?»`);
  }
}
const pdfText = new TextDecoder().decode(buildMinutesPdf(kino3, { company: { name: 'Consult1 AS' } }));
assert.ok(pdfText.includes('Side 1 av'), 'Sidetall på hver side');
assert.ok(pdfText.includes('kl. 09.00\\22610.30'), 'Tankestrek beholdes som WinAnsi');
const draftPdf = new TextDecoder().decode(buildMinutesPdf(byId('mote_amu_q3')));
assert.ok(draftPdf.includes('(UTKAST)'), 'Utkast får vannmerke');

/* ───────── AI-reserve ───────── */
const agenda = localAgenda({ description: 'Byggemøte for Kino Kino med fokus på fremdrift og HMS', minutes: 60 });
assert.equal(agenda.typeId, 'byggemote');
assert.ok(agenda.chapters.length >= 3);
const total = agenda.chapters.flatMap((c) => c.items).reduce((s, i) => s + i.minutes, 0);
assert.ok(total <= 60 && total >= 45, `Lokal dagsorden passer i møtelengden (${total})`);
const reply = normalizeAgendaReply({
  title: 'Møte',
  chapters: [{ title: 'A', items: [{ title: 'x', minutes: 900, description: 'y' }, { title: '' }] }, { title: 'Tom', items: [] }],
});
assert.equal(reply.chapters.length, 1);
assert.equal(reply.chapters[0].items.length, 1);
assert.equal(reply.chapters[0].items[0].minutes, 120);
const summary = localSummary(kino3);
assert.match(summary, /fremdriftsplan rev\. C/i);
assert.match(summary, /oppfølgingspunkt/);

/* ───────── Kalenderfil ───────── */
const ics = meetingIcs(kino4, { organizer: 'Consult1 AS' });
assert.match(ics, /BEGIN:VCALENDAR/);
assert.match(ics, /DTSTART;TZID=Europe\/Oslo:20261027T090000/);
assert.match(ics, /ATTENDEE;CN=Hanne Lund/);
assert.ok(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75), 'Linjene brettes på 75 oktetter');

console.log('meetings: ok');

/* ───────── Samtidige endringer ───────── */
{
  const { mergeMeetingEdits, seriesOverview, patchItem: patch, addItem: add } = await import('./model.js');
  const base = byId('mote_kino_4');
  const [a, b] = [base.chapters[1].items[0], base.chapters[2].items[0]];
  const mine = patch(base, a.id, { notes: 'Referent skrev dette.' });
  const theirs = { ...patch(base, b.id, { notes: 'Møteleder skrev dette.' }), title: 'Byggemøte Kino Kino (endret)' };
  const merged = mergeMeetingEdits(base, mine, theirs);
  const items = merged.chapters.flatMap((c) => c.items);
  assert.equal(items.find((i) => i.id === a.id).notes, 'Referent skrev dette.');
  assert.equal(items.find((i) => i.id === b.id).notes, 'Møteleder skrev dette.', 'Den andres punkt beholdes');
  assert.equal(merged.title, 'Byggemøte Kino Kino (endret)', 'Felt som ikke er endret her, tas fra lagret versjon');
  const grown = add(mine, base.chapters[0].id, { title: 'Ny sak fra referent' }).meeting;
  const merged2 = mergeMeetingEdits(base, grown, theirs);
  const items2 = merged2.chapters.flatMap((c) => c.items);
  assert.ok(items2.some((i) => i.title === 'Ny sak fra referent'), 'Nytt punkt her blir med');
  assert.equal(items2.find((i) => i.id === b.id).notes, 'Møteleder skrev dette.', 'Også når oppbyggingen er endret her');
  const people = { ...base, participants: base.participants.map((p, i) => (i === 0 ? { ...p, attendance: 'tilstede' } : p)) };
  const people2 = { ...base, participants: base.participants.map((p, i) => (i === 1 ? { ...p, attendance: 'forfall' } : p)) };
  const merged3 = mergeMeetingEdits(base, people, people2);
  assert.equal(merged3.participants[0].attendance, 'tilstede');
  assert.equal(merged3.participants[1].attendance, 'forfall');
  const series = seriesOverview(all, TODAY);
  const kino = series.find((s) => s.id === 'serie_kino');
  assert.equal(kino.count, 3);
  assert.equal(kino.last.number, 3);
  assert.equal(kino.next.number, 4);
}
console.log('meetings merge: ok');

/* ───────── Tilgang i Firestore ───────── */
{
  const m = normalizeMeeting({
    createdBy: 'u-creator',
    visibility: 'deltakere',
    participants: [{ name: 'A', uid: 'u-a' }, { name: 'B', email: 'b@x.no' }, { name: 'C', uid: 'u-a' }],
  });
  assert.deepEqual(m.memberUids, ['u-creator', 'u-a'], 'memberUids: den som opprettet og innloggede deltakere, uten duplikater');
  assert.equal(m.visibility, 'deltakere');
  assert.deepEqual(normalizeMeeting({}).memberUids, []);
  assert.equal(normalizeMeeting({ visibility: 'tull' }).visibility, 'alle');
}
console.log('meetings access: ok');
