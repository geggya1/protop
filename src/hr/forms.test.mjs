import assert from 'node:assert/strict';
import {
  answersToContractFields,
  answersToReviewFields,
  employmentContractFormTemplate,
  performanceReviewFormTemplate,
} from './forms.js';
import { amlContractCompleteness } from './compliance.js';

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
  // Malen har alle punktene i AML § 14-6 fra 1.7.2024: påkrevde felt utfylt gir en komplett avtale.
  const form = employmentContractFormTemplate();
  for (const field of form.fields) {
    if (field.required) field.value = field.type === 'date' ? '2026-01-05' : 'Fylt ut';
  }
  const contract = answersToContractFields(form);
  assert.deepEqual(amlContractCompleteness({ ...contract, employmentType: 'Fast' }).missing, []);
  for (const key of ['terminationProcedure', 'overtimeTerms', 'competenceDevelopment', 'pensionInsurance', 'collectiveAgreement']) {
    assert.equal(contract[key], 'Fylt ut', key);
  }
  const label = form.fields.find((f) => f.label === 'Innleievirksomhet (ved utleie)');
  label.value = 'Bygg AS';
  assert.equal(answersToContractFields(form).hirerIdentity, 'Bygg AS');
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
