import assert from 'node:assert/strict';
import {
  HELP_CANDIDATE_RETENTION_DAYS, anonymizedCandidatePatch, helpKnowledgeCandidate, scrubFreeText,
} from './helpKnowledge.js';

// E-post, fødselsnummer og telefon maskeres. Datoer, klokkeslett og org.nr. står.
assert.equal(scrubFreeText('Ring meg på 912 34 567'), 'Ring meg på [telefon]');
assert.equal(scrubFreeText('+47 91234567 eller 0047 22334455'), '[telefon] eller [telefon]');
assert.equal(scrubFreeText('45 67 89 01'), '[telefon]');
assert.equal(
  scrubFreeText('kari.nordmann@firma.no har 01017012345 og 010170 12345'),
  '[e-post] har [fødselsnummer] og [fødselsnummer]',
);
assert.equal(scrubFreeText('Timer for 2026-10-28 kl. 07:30'), 'Timer for 2026-10-28 kl. 07:30');
assert.equal(scrubFreeText('Org.nr. 123 456 789'), 'Org.nr. 123 456 789');
assert.equal(scrubFreeText('x'.repeat(30), 10), 'x'.repeat(10));

// Raden har ingen uid eller bedrift, bare det som trengs for å forbedre hjelpen.
const row = helpKnowledgeCandidate({
  question: 'Hvordan fører jeg timer? Spør per@firma.no', answer: 'Åpne Timer.', audience: 'parent', device: 'desktop', lang: 'nb', engine: 'local', now: 5,
});
assert.deepEqual(Object.keys(row).sort(), ['answer', 'audience', 'createdAtMs', 'device', 'engine', 'lang', 'question', 'reviewed']);
assert.equal(row.question, 'Hvordan fører jeg timer? Spør [e-post]');
assert.equal(row.createdAtMs, 5);
assert.equal(row.reviewed, false);

const patch = anonymizedCandidatePatch({ uid: 'u1', question: 'Ring 91234567', answer: 'ok' });
assert.equal(patch.question, 'Ring [telefon]');
assert.ok(patch.uid, 'uid fjernes med FieldValue.delete()');
assert.equal(HELP_CANDIDATE_RETENTION_DAYS, 365);

console.log('functions/helpKnowledge.test.mjs: ok');
