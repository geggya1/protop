import assert from 'node:assert/strict';
import {
  answersToContractFields,
  answersToReviewFields,
  employmentContractFormTemplate,
  performanceReviewFormTemplate,
} from './forms.js';

{
  const form = employmentContractFormTemplate();
  assert.equal(form.title, 'Arbeidsavtale');
  assert.equal(form.category, 'avtale');
  assert.ok(form.fields.length >= 12);
  form.fields.find((f) => f.label === 'Arbeidsgiver').value = 'AS';
  form.fields.find((f) => f.label === 'Stilling / tittel').value = 'Konsulent';
  form.fields.find((f) => f.label === 'Stillingsprosent').value = '100';
  form.fields.find((f) => f.label === 'Årslønn / lønn').value = '700000';
  const fields = answersToContractFields(form);
  assert.equal(fields.employerName, 'AS');
  assert.equal(fields.positionTitle, 'Konsulent');
  assert.equal(fields.workPercent, '100');
  assert.equal(fields.salaryAmount, '700000');
}

{
  const form = performanceReviewFormTemplate();
  assert.equal(form.title, 'Medarbeidersamtale');
  form.fields.find((f) => f.label === 'Sammendrag').value = 'Bra år';
  form.fields.find((f) => f.label === 'Mål frem til neste samtale').value = 'Lære X';
  const fields = answersToReviewFields(form);
  assert.equal(fields.summary, 'Bra år');
  assert.equal(fields.goals, 'Lære X');
}

console.log('hr/forms.test.mjs ok');
