import assert from 'node:assert/strict';
import {
  addTableRow,
  answerFilled,
  blankField,
  coerceAnswer,
  formProgress,
  needsInput,
  normalizeBuilderField,
  normalizeDocInfo,
  normalizeResponses,
  removeTableRow,
  setTableCell,
  tableProgress,
  tableRows,
} from '../anbud/formBuilder.js';
import { saveFormTemplate } from '../anbud/bidLibrary.js';
import { emptyAnbudState } from '../anbud/model.js';
import { fillTokens, formWithTokens, formatOrgnr, tokenContext } from './tokens.js';
import {
  KS_LIBRARY,
  libraryEntry,
  libraryForm,
  libraryTemplateId,
  searchLibrary,
} from './ksLibrary.js';
import {
  completeFilledDoc,
  filledForTemplate,
  filledProgress,
  newFilledDoc,
  normalizeFilledDoc,
  reopenFilledDoc,
  setFilledValue,
} from './filledDocs.js';

/* Tabellfelt */
const table = normalizeBuilderField({
  ...blankField('table'),
  id: 'tab',
  label: 'Sjekkpunkter',
  columns: [
    { id: 'pos', label: 'Pos', type: 'fixed' },
    { id: 'punkt', label: 'Sjekkpunkt', type: 'fixed' },
    { id: 'merk', label: 'Merknad', type: 'text' },
    { id: 'jni', label: 'J/N/I', type: 'mark', options: ['J', 'N', 'I'] },
    { id: 'ok', label: 'OK', type: 'check' },
    { id: 'tom', label: 'Uten valg', type: 'mark', options: ['A'] },
  ],
  rows: [
    { id: 'g1', group: 'Generelt' },
    { id: 'r1', cells: { pos: '1.', punkt: 'Er døren låst?', jni: 'J' } },
    { id: 'r2', cells: { pos: '2.', punkt: 'Er lyset slukket?' } },
  ],
});
assert.equal(table.columns.length, 5, 'mark-kolonne med ett valg forkastes');
assert.equal(table.rows[0].group, 'Generelt');
assert.equal(table.rows[1].cells.jni, undefined, 'faste celler lagres ikke i avkrysningskolonner');
assert.equal(table.width, 'full');
assert.deepEqual(table.value, { cells: {}, added: [] });
assert.equal(needsInput(table), true);

let value = setTableCell(table, 'r1', 'jni', 'N');
value = setTableCell({ ...table, value }, 'r1', 'ok', true);
let filled = { ...table, value };
assert.deepEqual(value.cells.r1, { jni: 'N', ok: true });
assert.deepEqual(tableProgress(filled), { rows: 2, filled: 1 });
assert.equal(answerFilled(filled), true);
assert.equal(needsInput(filled), false);
value = setTableCell(filled, 'r1', 'jni', '');
value = setTableCell({ ...table, value }, 'r1', 'ok', false);
assert.deepEqual(value.cells, {}, 'tom rad fjernes fra svaret');

value = addTableRow(table);
assert.equal(value.added.length, 1);
const addedId = value.added[0].id;
value = setTableCell({ ...table, value }, addedId, 'punkt', 'Eget punkt');
filled = { ...table, value };
const shown = tableRows(filled);
assert.equal(shown.length, 4);
assert.equal(shown[3].added, true);
assert.equal(shown[3].cells.punkt, 'Eget punkt');
assert.equal(removeTableRow(filled, addedId).added.length, 0);

const roundTrip = normalizeResponses([{ id: 's1', answers: { tab: filled.value } }]);
assert.equal(roundTrip[0].answers.tab.added[0].cells.punkt, 'Eget punkt');

/* Signatur */
assert.equal(coerceAnswer('sign', { name: '' }), null);
const signed = coerceAnswer('sign', { name: 'Kari Nordmann', at: '2026-10-26T10:00:00.000Z', extra: 'x' });
assert.deepEqual(signed, { name: 'Kari Nordmann', at: '2026-10-26T10:00:00.000Z', uid: '', place: '' });
const signField = normalizeBuilderField({ ...blankField('sign'), label: 'Signatur', required: true });
assert.equal(needsInput(signField), true);
assert.equal(needsInput({ ...signField, value: signed }), false);

/* Fremdrift og låste felt */
const progress = formProgress([
  { ...blankField('text'), id: 'a', label: 'A', required: true, value: 'x' },
  { ...blankField('text'), id: 'b', label: 'B', required: true, value: '' },
  { ...blankField('text'), id: 'c', label: 'C', editor: 'fast', value: 'Fast' },
  { ...blankField('note'), id: 'd', label: 'Tekst' },
]);
assert.deepEqual(progress, { total: 2, filled: 1, required: 2, missing: ['b'], ready: false });

/* Dokumenthode */
assert.equal(normalizeDocInfo({ docId: 'C1-B-03-004', version: 1 }).version, '1');

/* Låste felt beholder fast tekst når malen lagres */
const saved = saveFormTemplate(emptyAnbudState(), {
  title: 'Test',
  doc: { docId: 'KS-1' },
  libraryKey: 'brev',
  fields: [
    { id: 'f1', label: 'Firma', kind: 'text', editor: 'fast', value: '{{firma}}' },
    { id: 'f2', label: 'Navn', kind: 'text', value: 'Skal bort' },
  ],
});
assert.equal(saved.ok, true);
const template = saved.state.formTemplates.find((row) => row.title === 'Test');
assert.equal(template.fields[0].value, '{{firma}}');
assert.equal(template.fields[1].value, '');
assert.equal(template.doc.docId, 'KS-1');
assert.equal(template.libraryKey, 'brev');

/* Flettefelt */
assert.equal(formatOrgnr('916538804'), '916 538 804');
const ctx = tokenContext({
  navn: 'Eksempel AS',
  organisasjonsnummer: '123456789',
  addressLabel: 'Gate 1, 0150 Oslo',
  hjemmeside: 'https://eksempel.no/',
}, { userName: 'Ola', now: new Date('2026-10-26T12:00:00Z') });
assert.equal(ctx.web, 'eksempel.no');
assert.equal(fillTokens('{{firma}} ({{orgnr}})', ctx), 'Eksempel AS (123 456 789)');
assert.equal(fillTokens('Tlf {{telefon}}', ctx), 'Tlf [Telefon]', 'tom verdi blir synlig etikett');
assert.equal(fillTokens('{{ukjent}}', ctx), '{{ukjent}}');
const withTokens = formWithTokens(libraryForm('hms-egenerklaering'), ctx);
assert.equal(withTokens.fields.find((row) => row.label === 'Virksomhetens navn').value, 'Eksempel AS');

/* Biblioteket */
const keys = new Set();
for (const entry of KS_LIBRARY) {
  assert.ok(!keys.has(entry.key), `dobbel nøkkel ${entry.key}`);
  keys.add(entry.key);
  assert.ok(entry.ref && entry.summary, `${entry.key} mangler KS-nummer eller beskrivelse`);
  if (entry.kind === 'system') {
    assert.ok(entry.target?.tab && entry.target?.label, `${entry.key} mangler modul`);
    continue;
  }
  const form = libraryForm(entry.key);
  assert.ok(form.fields.length > 2, `${entry.key} har for få felt`);
  assert.equal(form.libraryKey, entry.key);
  assert.equal(form.doc.docId, entry.ref);
  const ids = form.fields.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, `${entry.key} har like felt-id-er`);
  assert.deepEqual(libraryForm(entry.key).fields.map((row) => row.id), ids, 'felt-id-ene er stabile');
  for (const field of form.fields.filter((row) => row.kind === 'table')) {
    assert.ok(field.columns.length, `${entry.key}: ${field.label} mangler kolonner`);
    assert.ok(field.rows.length, `${entry.key}: ${field.label} mangler rader`);
  }
  const text = JSON.stringify(form);
  assert.ok(!/\d{6}\s?\d{5}/.test(text), `${entry.key} inneholder noe som ligner fødselsnummer`);
  assert.ok(!/passord/i.test(text), `${entry.key} spør etter passord`);
}
assert.equal(libraryEntry('avviksrapport').kind, 'system');
assert.equal(libraryEntry('avviksrapport').target.subView, 'avvik');
assert.equal(libraryEntry('egenmelding').target.tab, 'arbeid');
assert.equal(libraryTemplateId('el-kontroll'), 'ks_el-kontroll');
assert.ok(searchLibrary('SJA').some((row) => row.key === 'sja'));
assert.ok(searchLibrary('C1-B-03-005').some((row) => row.key === 'avviksrapport'));

/* Utfylte dokumenter */
const form = { ...libraryForm('hms-aarlig'), id: libraryTemplateId('hms-aarlig') };
const actor = { uid: 'u1', name: 'Kari' };
let doc = newFilledDoc(form, { actor, now: new Date('2026-10-26T08:00:00Z') });
assert.equal(doc.status, 'utkast');
assert.equal(doc.libraryKey, 'hms-aarlig');
assert.equal(doc.templateId, 'ks_hms-aarlig');
assert.equal(normalizeFilledDoc(JSON.parse(JSON.stringify(doc))).fields.length, doc.fields.length);
const dateField = doc.fields.find((row) => row.kind === 'date');
const blocked = completeFilledDoc(doc, { actor });
assert.equal(blocked.ok, false);
assert.match(blocked.error, /Dato/);
doc = setFilledValue(doc, dateField.id, '2026-10-26', { actor });
assert.equal(filledProgress(doc).ready, true);
const done = completeFilledDoc(doc, { actor, now: new Date('2026-10-26T09:00:00Z') });
assert.equal(done.ok, true);
assert.equal(done.doc.status, 'ferdig');
assert.equal(setFilledValue(done.doc, dateField.id, '2026-01-01').fields.find((row) => row.id === dateField.id).value, '2026-10-26', 'ferdig dokument endres ikke');
assert.equal(reopenFilledDoc(done.doc, { actor }).status, 'utkast');
assert.equal(filledForTemplate([done.doc], { libraryKey: 'hms-aarlig' }).length, 1);
assert.equal(newFilledDoc(libraryForm('taushetserklaering'), { scope: 'hr' }).scope, 'hr');

console.log('forms.test.mjs ok');
