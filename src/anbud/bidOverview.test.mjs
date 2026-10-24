import test from 'node:test';
import assert from 'node:assert/strict';
import { deadlineCountdown, fileTypeLabel, formatDeadline, groundFileTree } from './bidOverview.js';

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
