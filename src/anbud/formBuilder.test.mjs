import assert from 'node:assert/strict';
import {
  applyDrag,
  blankField,
  coerceAnswer,
  duplicateField,
  formFromPlainText,
  formFromScan,
  insertField,
  moveField,
  normalizeBuilderField,
} from './formBuilder.js';
import { emptyAnbudState, normalizeAnbudState } from './model.js';
import { saveFormTemplate } from './bidLibrary.js';

const start = [blankField('title'), blankField('text'), blankField('date')].map((row, index) => ({
  ...row,
  id: `felt_${index}`,
  label: `Felt ${index}`,
}));

const moved = moveField(start, 0, 2);
assert.equal(moved.map((row) => row.id).join(','), 'felt_1,felt_2,felt_0');
assert.equal(moveField(start, 0, 0)[0].id, 'felt_0');
assert.equal(moveField(start, -1, 1).length, 3);

const inserted = insertField(start, 1, 'image');
assert.equal(inserted.length, 4);
assert.equal(inserted[1].kind, 'image');
assert.equal(inserted[1].value, null);

const copy = duplicateField(inserted, 1);
assert.equal(copy.length, 5);
assert.equal(copy[2].kind, 'image');
assert.notEqual(copy[2].id, copy[1].id);

const dragged = applyDrag(start, 'kind:choice', 0);
assert.equal(dragged[0].kind, 'choice');
assert.equal(dragged[0].options.length, 2);
const reordered = applyDrag(start, 'move:2', start.length);
assert.equal(reordered[reordered.length - 1].id, 'felt_2');
assert.equal(applyDrag(start, 'annet', 0).length, 3);

assert.equal(normalizeBuilderField({ label: '' }), null);
assert.equal(normalizeBuilderField({ label: 'Dato', kind: 'ukjent' }).kind, 'text');
assert.equal(normalizeBuilderField({ label: 'Overskrift', kind: 'title', required: true }).required, false);

assert.equal(coerceAnswer('check', 'ja'), true);
assert.deepEqual(coerceAnswer('checks', ['a', 'a', '']), ['a']);
assert.equal(coerceAnswer('image', { name: '', dataUrl: 'https://eksempel.no/a.png' }), null);
const kept = coerceAnswer('file', { name: 'krav.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,QQ==' });
assert.equal(kept.name, 'krav.pdf');
assert.equal(kept.dataUrl.startsWith('data:'), true);
const stripped = coerceAnswer('image', { name: 'stor.png', dataUrl: `data:image/png;base64,${'A'.repeat(700001)}` });
assert.equal(stripped.name, 'stor.png');
assert.equal(stripped.dataUrl, '');

const scanned = formFromScan({
  title: 'Egenerklæring',
  intro: 'Bekreftelser',
  fields: [
    { label: 'Opplysninger', kind: 'title' },
    { label: 'Gyldig til', kind: 'date', required: true },
    { label: 'Entreprise', kind: 'choice', options: ['Total', 'Delt'] },
  ],
});
assert.equal(scanned.ok, true);
assert.equal(scanned.form.fields[1].kind, 'date');
assert.equal(scanned.form.fields[1].required, true);
assert.equal(scanned.form.fields[2].options[0].label, 'Total');
assert.equal(formFromScan({ title: '', fields: [] }).ok, false);
assert.equal(formFromScan({ title: 'Tom', fields: [{ label: '' }] }).ok, false);

const plain = formFromPlainText(`EGENERKLÆRING
Velg entrepriseform
- Totalentreprise
- Delt entreprise
Tilbudsfrist
Beløp ekskl. mva
Last opp dokumentasjon
Foto av rigg
Bekreft at skatt er i orden`, 'Fra fil');
assert.equal(plain.ok, true);
assert.equal(plain.form.fields[0].kind, 'title');
assert.equal(plain.form.fields[1].kind, 'choice');
assert.equal(plain.form.fields[1].options.length, 2);
assert.equal(plain.form.fields.some((row) => row.kind === 'date'), true);
assert.equal(plain.form.fields.some((row) => row.kind === 'number'), true);
assert.equal(plain.form.fields.some((row) => row.kind === 'file'), true);
assert.equal(plain.form.fields.some((row) => row.kind === 'image'), true);
assert.equal(plain.form.fields.some((row) => row.kind === 'check'), true);
assert.equal(formFromPlainText('   ').ok, false);

const saved = saveFormTemplate(normalizeAnbudState(emptyAnbudState()), {
  title: 'Befaring',
  intro: 'Eget skjema',
  fields: [
    { label: 'Befaring', kind: 'title' },
    { label: 'Dato', kind: 'date', required: true },
    { label: 'Type', kind: 'dropdown', options: [{ label: 'Innvendig' }, { label: 'Utvendig' }] },
    { label: 'Bilde', kind: 'image' },
  ],
});
assert.equal(saved.ok, true);
const template = saved.state.formTemplates.find((row) => row.title === 'Befaring');
assert.equal(template.fields.find((row) => row.label === 'Dato').kind, 'date');
assert.equal(template.fields.find((row) => row.label === 'Dato').required, true);
assert.equal(template.fields.find((row) => row.label === 'Type').options.length, 2);
assert.equal(template.fields.find((row) => row.label === 'Bilde').kind, 'image');
assert.equal(template.fields.find((row) => row.label === 'Befaring').value, '');

console.log('form builder ok');
