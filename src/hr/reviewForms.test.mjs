/**
 * Medarbeidersamtalen: ett skjema (KS «Medarbeidersamtale»), speilet i hr.reviews.
 */
import assert from 'node:assert/strict';
import { libraryForm } from '../forms/ksLibrary.js';
import { newFilledDoc, completeFilledDoc } from '../forms/filledDocs.js';
import { setTableCell } from '../anbud/formBuilder.js';
import { normalizeReview } from './model.js';
import {
  REVIEW_FORM_KEY, isReviewDoc, previousActionPlan, reviewActionPlan, reviewDate, reviewEntries,
  reviewDocsToSync, reviewFromFilledDoc, reviewRowId, syncReviewRows,
} from './reviewForms.js';

const form = { ...libraryForm(REVIEW_FORM_KEY), id: 'tmpl', libraryKey: REVIEW_FORM_KEY };
assert.ok(form.fields.length, 'KS-malen finnes');

function fill(doc, label, value) {
  return { ...doc, fields: doc.fields.map((f) => (f.label === label ? { ...f, value } : f)) };
}

function withPlan(doc, rows) {
  return {
    ...doc,
    fields: doc.fields.map((f) => {
      if (f.label !== 'Handlingsplan' || f.kind !== 'table') return f;
      let next = f;
      const tiltak = f.columns.find((c) => c.label === 'Tiltak').id;
      const frist = f.columns.find((c) => c.label === 'Frist').id;
      rows.forEach(([t, d], i) => {
        next = { ...next, value: setTableCell(next, f.rows[i].id, tiltak, t) };
        if (d) next = { ...next, value: setTableCell(next, f.rows[i].id, frist, d) };
      });
      return next;
    }),
  };
}

let doc = newFilledDoc(form, { scope: 'hr', subject: { kind: 'employee', id: 'e1', name: 'Ada' } });
assert.ok(isReviewDoc(doc));
doc = fill(doc, 'Dato for samtalen', '2026-03-12');
doc = fill(doc, 'Leder', 'Hanne');
doc = withPlan(doc, [['Kurs i Excel', '2026-06-01'], ['Fast en-til-en hver måned', '']]);

assert.equal(reviewDate(doc), '2026-03-12');
assert.deepEqual(reviewActionPlan(doc).map((r) => r.tiltak), ['Kurs i Excel', 'Fast en-til-en hver måned']);
assert.equal(reviewActionPlan(doc)[0].frist, '2026-06-01');

let row = reviewFromFilledDoc(doc);
assert.equal(row.id, reviewRowId(doc.id));
assert.equal(row.employeeId, 'e1');
assert.equal(row.status, 'planned', 'utkast = planlagt');
assert.equal(row.interviewer, 'Hanne');
assert.equal(row.summary, 'Handlingsplan: 2 tiltak');
assert.match(row.followUps, /Kurs i Excel · frist: 2026-06-01/);
assert.equal(row.formDocId, doc.id);

// Ferdig: gjennomført. Raden erstattes, ikke dobles.
const done = { ...doc, status: 'ferdig', completedAt: '2026-03-12T10:00:00Z' };
let reviews = syncReviewRows([], doc, normalizeReview);
reviews = syncReviewRows(reviews, done, normalizeReview);
assert.equal(reviews.length, 1);
assert.equal(reviews[0].status, 'done');
assert.equal(normalizeReview(reviews[0]).formDocId, doc.id, 'formDocId beholdes av model');
// Slettet dokument fjerner raden.
assert.deepEqual(syncReviewRows(reviews, done, normalizeReview, { removed: true }), []);
// Uten ansatt: ingen rad.
assert.equal(reviewFromFilledDoc({ ...doc, subject: null }), null);
// Andre skjema er ikke samtaler.
assert.equal(isReviewDoc({ ...doc, libraryKey: 'nyansatt' }), false);

// Listen: utfylte skjema og eldre samtaler, nyeste først. Speilede rader står ikke to ganger.
const legacy = normalizeReview({ id: 'old', employeeId: 'e1', date: '2025-03-01', status: 'done', summary: 'Gammel' });
const fresh = newFilledDoc(form, { scope: 'hr', subject: { kind: 'employee', id: 'e1', name: 'Ada' } });
const older = { ...withPlan(fill(fresh, 'Dato for samtalen', '2025-09-01'), [['Lære ProTop']]), id: 'd0', status: 'ferdig' };
const entries = reviewEntries([legacy, ...reviews], [done, older, { ...done, id: 'x', subject: { id: 'e2' } }], 'e1');
assert.deepEqual(entries.map((e) => `${e.kind}:${e.date}`), ['form:2026-03-12', 'form:2025-09-01', 'legacy:2025-03-01']);
// Forrige handlingsplan (tema 1 i neste samtale).
assert.deepEqual(previousActionPlan(entries, done.id).plan.map((r) => r.tiltak), ['Lære ProTop']);
assert.equal(previousActionPlan(entries, 'd0'), null);

// Ferdig samtale med handlingsplan: én sak, ikke to; utkast og samtale uten plan: ingen.
{
  const { casesFromReviewDoc } = await import('./reviewForms.js');
  const { normalizeCase } = await import('./model.js');
  let cases = casesFromReviewDoc([], done, normalizeCase);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].employeeId, 'e1');
  assert.equal(cases[0].title, 'Oppfølging fra samtale 2026-03-12');
  assert.match(cases[0].description, /Kurs i Excel/);
  assert.equal(cases[0].sourceReviewId, reviewRowId(done.id));
  cases = casesFromReviewDoc(cases, done, normalizeCase);
  assert.equal(cases.length, 1, 'ikke to ganger');
  assert.equal(casesFromReviewDoc([], doc, normalizeCase).length, 0, 'utkast');
  assert.equal(casesFromReviewDoc([], { ...fresh, status: 'ferdig' }, normalizeCase).length, 0, 'uten handlingsplan');
}
// Signert på Min side: serveren har ferdigstilt skjemaet; HR speiler det når samtalene lastes.
{
  const draftRow = reviewFromFilledDoc({ ...done, status: 'utkast' });
  assert.deepEqual(reviewDocsToSync([{ ...draftRow, status: 'planned' }], [done, doc]).map((d) => d.id), [done.id]);
  assert.deepEqual(reviewDocsToSync([reviewFromFilledDoc(done)], [done]), [], 'allerede speilet');
  assert.deepEqual(reviewDocsToSync([], [{ ...done, subject: null }]), [], 'uten ansatt');
}
void completeFilledDoc;
console.log('reviewForms ok');
