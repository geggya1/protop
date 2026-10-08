import assert from 'node:assert/strict';
import { interpretationFromGemini } from './anbud/bidInterpretation.js';

const parsed = interpretationFromGemini({
  summary: 'Rammeavtale for rådgivning.',
  checklist: [
    { title: 'Sjekk frist', detail: '26.10.2026' },
    { title: '', detail: 'ignore' },
  ],
  qualification: [
    { title: 'Erfaring', summary: 'Relevant erfaring', detail: 'Minst tre referanseprosjekter.' },
  ],
  awardCriteria: [
    { title: 'Pris', weight: '40 %', summary: 'Lavest pris', detail: 'Evalueres etter gitt modell.' },
  ],
});

assert.match(parsed.summary, /Rammeavtale/);
assert.equal(parsed.checklist.length, 1);
assert.equal(parsed.checklist[0].title, 'Sjekk frist');
assert.equal(parsed.qualification[0].title, 'Erfaring');
assert.equal(parsed.awardCriteria[0].weight, '40 %');
assert.equal(parsed.engine, 'gemini');

console.log('anbud bid ai ok');
