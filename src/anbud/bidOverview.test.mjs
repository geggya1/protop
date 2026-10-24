import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bidTeam,
  competitionTimeline,
  countdownParts,
  deadlineCountdown,
  fileTypeLabel,
  formatDeadline,
  groundFileTree,
  initials,
  longDate,
  qaOverview,
  shortDate,
  workProgress,
} from './bidOverview.js';

const now = new Date(2026, 9, 24, 10, 0);

test('nedtelling viser dager igjen og dato med klokkeslett', () => {
  const info = deadlineCountdown('2026-11-09T11:00:00Z', now);
  assert.equal(info.big, '16');
  assert.equal(info.unit, 'dager igjen');
  assert.equal(info.dateLabel, '09.11.2026 kl. 11:00');
  assert.equal(info.tone, 'ink');
});

test('nedtelling skiller i dag, én dag og utløpt', () => {
  assert.equal(deadlineCountdown('2026-10-24 12:00', now).big, 'I dag');
  assert.equal(deadlineCountdown('25.10.2026', now).unit, 'dag igjen');
  assert.equal(deadlineCountdown('2026-10-24 09:00', now).big, 'Utløpt');
  assert.equal(deadlineCountdown('2026-10-29', now).tone, 'warn');
  assert.equal(deadlineCountdown('', now).ok, false);
});

test('formatDeadline gjør ISO lesbar og lar ukjent tekst stå', () => {
  assert.equal(formatDeadline('2026-11-09T11:00:00Z'), '09.11.2026 kl. 11:00');
  assert.equal(formatDeadline('snart'), 'snart');
});

test('filene legges i fast mappestruktur med naturlig sortering', () => {
  const tree = groundFileTree([
    { name: 'Bilag 10 Priser.xlsx' },
    { name: 'Kunngjøring.txt', source: 'kunngjøring' },
    { name: 'Bilag 2 Kravspesifikasjon.pdf' },
    { name: 'Konkurransegrunnlag.pdf' },
    { name: 'SSA-O Avtale.docx' },
    { name: 'Tegning A1.dwg' },
  ]);
  assert.deepEqual(tree.map((row) => row.name), [
    'Kunngjøring', 'Konkurransegrunnlag', 'Bilag og vedlegg', 'Kontrakt', 'Andre dokumenter',
  ]);
  assert.deepEqual(tree[2].files.map((row) => row.name), ['Bilag 2 Kravspesifikasjon.pdf', 'Bilag 10 Priser.xlsx']);
});

test('kapittelinndelt grunnlag får én mappe per kapittel', () => {
  const tree = groundFileTree([
    { name: 'Kap D2.10 Etiske krav.pdf' },
    { name: 'Kapittel A1 Oversikt over kontrakten.pdf' },
    { name: 'Kap D2.02 Kontraktsgrenser.pdf' },
    { name: 'Kapittel D0 Innledning.pdf' },
    { name: 'Konkurransegrunnlag.pdf' },
  ]);
  assert.deepEqual(tree.map((row) => row.name), ['Konkurransegrunnlag', 'Kapittel A', 'Kapittel D']);
  assert.deepEqual(tree[2].files.map((row) => row.name), ['Kapittel D0 Innledning.pdf', 'Kap D2.02 Kontraktsgrenser.pdf', 'Kap D2.10 Etiske krav.pdf']);
});

test('filtype fra endelse eller mime', () => {
  assert.equal(fileTypeLabel({ name: 'a.pdf' }), 'PDF');
  assert.equal(fileTypeLabel({ name: 'uten', mimeType: 'application/pdf' }), 'PDF');
});

test('datoer skrives som i resten av appen', () => {
  assert.equal(shortDate('2026-10-14'), '14. okt. 2026');
  assert.equal(longDate('2026-11-09T11:00:00Z'), '9. november 2026 kl. 11:00');
  assert.equal(shortDate('snart'), 'snart');
});

test('nedtellingen deler fristen i dager, timer, minutter og sekunder', () => {
  const parts = countdownParts('2026-11-09T11:00:00Z', new Date(2026, 9, 24, 10, 45, 38));
  assert.deepEqual(
    [parts.days, parts.hours, parts.minutes, parts.seconds, parts.passed],
    [16, 0, 14, 22, false],
  );
  assert.equal(parts.dateLabel, '9. november 2026 kl. 11:00');
  assert.equal(countdownParts('2026-10-24 09:00', now).passed, true);
  assert.equal(countdownParts('', now).ok, false);
});

test('tidslinjen markerer passerte frister og neste steg', () => {
  const steps = competitionTimeline({
    bid: { noticeId: '2026-1', stage: 'planlegging' },
    dossier: { published: '2026-10-14', questionDeadline: '2026-10-20', submissionDeadline: '2026-11-09 11:00' },
  }, now);
  assert.deepEqual(steps.map((row) => row.state), ['done', 'done', 'current', 'todo']);
  assert.equal(steps[0].label, 'Kunngjøring');
  assert.equal(steps[2].when, '9. nov. 2026');
  assert.equal(steps[3].when, 'Venter');
});

test('tidslinjen viser levert og utfall', () => {
  const steps = competitionTimeline({
    bid: { stage: 'kontrakt', submittedAt: '2026-11-01', closedAt: '2026-12-03', createdAt: '2026-10-01' },
    dossier: { submissionDeadline: '2026-11-09' },
  }, now);
  assert.equal(steps[0].label, 'Forespørsel');
  assert.equal(steps[2].note, 'Levert');
  assert.equal(steps[3].note, 'Vunnet');
  assert.ok(steps.every((row) => row.state === 'done'));
  assert.equal(steps[1].when, 'Ikke oppgitt');
});

test('fremdriften teller klare og leverte sjekkpunkt som ferdige', () => {
  const info = workProgress({
    workItems: [{ status: 'klart' }, { status: 'levert' }, { status: 'under-arbeid' }],
    forms: [{ status: 'ferdig' }, { status: 'apent' }],
    pendingWorkItems: [{}],
  });
  assert.deepEqual(info, { items: 3, done: 2, forms: 2, formsDone: 1, pending: 1, started: true });
  assert.equal(workProgress({}).started, false);
});

test('spørsmål og svar samles, nummereres og viser de tre siste', () => {
  const info = qaOverview(
    { qa: [{ question: 'A', answer: 'Ja' }, { question: 'B', answer: '' }, { question: 'C', answer: 'Nei', published: '23.10.2026' }] },
    { questions: [{ id: 'spm1', question: 'D', answer: '', createdAt: '2026-10-24T08:00:00Z' }] },
  );
  assert.equal(info.total, 4);
  assert.equal(info.answered, 2);
  assert.deepEqual(info.latest.map((row) => [row.no, row.question, row.answered]), [[4, 'D', false], [3, 'C', true], [2, 'B', false]]);
  assert.equal(info.latest[1].when, '23. okt. 2026');
});

test('teamet viser ansvarlig først og slår sammen samme person', () => {
  const team = bidTeam({
    assignment: { personId: 'u1', personName: 'Geir Ove Andersen' },
    workItems: [{ ownerId: 'u2', ownerName: 'Eli-Sofie Nilsen' }, { ownerId: 'u1', ownerName: 'Geir Ove Andersen' }],
    tasks: [{ ownerId: 'u2', ownerName: 'Eli-Sofie Nilsen' }, { ownerId: 'u2', ownerName: 'Eli-Sofie Nilsen' }],
  });
  assert.deepEqual(team.map((row) => [row.initials, row.role]), [
    ['GA', 'Ansvarlig · 1 sjekkpunkt'],
    ['EN', '1 sjekkpunkt · 2 oppgaver'],
  ]);
  assert.equal(initials(''), '?');
});
