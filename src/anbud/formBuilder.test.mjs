import assert from 'node:assert/strict';
import {
  applyDrag,
  blankField,
  coerceAnswer,
  dragTargetIndex,
  duplicateField,
  formFromPlainText,
  formFromScan,
  insertField,
  insertionIndex,
  moveField,
  normalizeBuilderField,
  normalizeSettings,
  responsesToCsv,
  summarizeQuestion,
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

assert.equal(blankField('text').label, 'Kort svar');
assert.equal(blankField('image').label, 'Bilde');
assert.equal(blankField('title').label, 'Ny seksjon');

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

const canvas = { top: 80, bottom: 400, left: 0, right: 320 };
const rects = [
  { top: 100, height: 40 },
  { top: 160, height: 40 },
  { top: 220, height: 40 },
];
assert.equal(insertionIndex(40, 90, rects, canvas), 0);
assert.equal(insertionIndex(40, 119, rects, canvas), 0);
assert.equal(insertionIndex(40, 120, rects, canvas), 1);
assert.equal(insertionIndex(40, 300, rects, canvas), 3);
assert.equal(insertionIndex(400, 200, rects, canvas), null);
assert.equal(insertionIndex(40, 10, rects, canvas), null);
assert.equal(insertionIndex(40, 200, [], canvas), 0);
assert.equal(insertionIndex(40, 200, [], null), null);

assert.equal(dragTargetIndex('kind:text', 0, 3), 0);
assert.equal(dragTargetIndex('kind:text', 3, 3), 3);
assert.equal(dragTargetIndex('move:0', 3, 3), 2);
assert.equal(dragTargetIndex('move:0', 2, 3), 1);
assert.equal(dragTargetIndex('move:2', 0, 3), 0);
assert.equal(dragTargetIndex('move:1', 3, 3), 2);
const movedDown = applyDrag(start, 'move:0', dragTargetIndex('move:0', 2, start.length));
assert.equal(movedDown.map((row) => row.id).join(','), 'felt_1,felt_0,felt_2');
const movedEnd = applyDrag(start, 'move:0', dragTargetIndex('move:0', start.length, start.length));
assert.equal(movedEnd.map((row) => row.id).join(','), 'felt_1,felt_2,felt_0');

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

const scale = normalizeBuilderField({ label: 'Vurdering', kind: 'scale', scaleMax: 12, required: true });
assert.equal(scale.kind, 'scale');
assert.equal(scale.scaleMax, 10);
assert.equal(coerceAnswer('time', '08:30'), '08:30');
assert.equal(normalizeSettings({ confirmation: 'Takk', anotherResponse: false, progress: true }).confirmation, 'Takk');
assert.equal(normalizeSettings({}).anotherResponse, true);
assert.equal(normalizeSettings({}).useCompanyLogo, false);
assert.equal(normalizeSettings({ useCompanyLogo: true }).useCompanyLogo, true);

const summary = summarizeQuestion(
  { id: 'mat', label: 'Mat', kind: 'choice', other: true, options: [{ id: 'a', label: 'Salat' }, { id: 'b', label: 'Dessert' }] },
  [{ answers: { mat: 'a' } }, { answers: { mat: 'a' } }, { answers: { mat: 'b' } }, { answers: { mat: 'other:Suppe' } }],
);
assert.equal(summary.counts.find((row) => row.id === 'a').count, 2);
assert.equal(summary.counts.find((row) => row.id === 'other').count, 1);
const csv = responsesToCsv({
  settings: { collectEmail: true },
  fields: [{ id: 'mat', label: 'Mat', kind: 'choice', options: [{ id: 'a', label: 'Salat' }] }],
  responses: [{ at: '2026-02-01', email: 'a@bedrift.no', answers: { mat: 'a' } }],
});
assert.equal(csv.includes('Salat'), true);
assert.equal(csv.includes('a@bedrift.no'), true);

console.log('form builder ok');
