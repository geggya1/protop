import assert from 'node:assert/strict';
import { reviewPrintHtml } from './reviewPdf.js';

{
  const html = reviewPrintHtml({
    date: '2026-03-01',
    interviewer: 'Geir',
    summary: 'Bra utvikling',
    goals: 'Lære React',
    wellbeing: '4',
    followUps: 'Oppfølgingsmøte Q2',
  }, { employeeName: 'Ada Lovelace', companyName: 'ProTop AS' });
  assert.match(html, /Medarbeidersamtale/);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /Bra utvikling/);
  assert.match(html, /Oppfølgingsmøte Q2/);
  assert.match(html, /01\.03\.2026/);
  assert.equal(html.includes('<script'), false);
}

console.log('hr/reviewPdf.test.mjs ok');
