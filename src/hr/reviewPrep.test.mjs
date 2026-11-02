/**
 * Medarbeidersamtalen fra invitasjon til signert kopi: temaene, forberedelsen, signering og PDF.
 */
import assert from 'node:assert/strict';
import { libraryForm } from '../forms/ksLibrary.js';
import { completeFilledDoc, newFilledDoc, normalizeFilledDoc, setFilledValue } from '../forms/filledDocs.js';
import { setTableCell, tableRows } from '../anbud/formBuilder.js';
import { REVIEW_FORM_KEY, reviewActionPlan } from './reviewForms.js';
import {
  answerCount, applyPrepAnswers, canAnswer, cleanAnswers, copyFileName, copyMail, defaultRespondBy, employeeSignField,
  invitationNotice, invitationPrep, leaderSignField, lockEmployeeSign, meetingLine, normalizePrep, prepState,
  reviewSummary, reviewTopics, signAsLeader, signedDoc, signingPrep, splitTopic, stampLine, topicColumns, topicTable, withAnswers,
  withdrawSigning, ANSWER_MAX, COMMENT_LABEL,
} from './reviewPrep.js';
import { buildReviewCopyPdf, reviewCopyStreams } from './reviewCopyPdf.js';

const form = { ...libraryForm(REVIEW_FORM_KEY), id: 'tmpl', libraryKey: REVIEW_FORM_KEY };
const now = new Date('2026-03-02T09:00:00Z');
const leader = { uid: 'u_leder', name: 'Lea Leder' };
const employee = { id: 'e1', personUid: 'u_ansatt', name: 'Ola Ansatt' };

function fresh() {
  return newFilledDoc(form, { actor: leader, scope: 'hr', subject: { kind: 'employee', id: 'e1', name: 'Ola Ansatt' }, now });
}

function fill(doc, label, value) {
  const field = doc.fields.find((f) => f.label === label && f.kind !== 'title');
  return setFilledValue(doc, field.id, value, { actor: leader, now });
}

function cell(doc, tableLabel, rowIndex, colLabelStart, value) {
  return {
    ...doc,
    fields: doc.fields.map((f) => {
      if (f.kind !== 'table' || f.label !== tableLabel) return f;
      const col = f.columns.find((c) => c.label.startsWith(colLabelStart));
      const row = f.rows.filter((r) => !r.group)[rowIndex];
      return { ...f, value: setTableCell(f, row.id, col.id, value) };
    }),
  };
}

// Temaene hentes fra tabellen «Tema»: tittel og spørsmål.
{
  const doc = fresh();
  const topics = reviewTopics(doc);
  assert.equal(topics.length, 6);
  assert.equal(topics[0].no, '1.');
  assert.equal(topics[0].title, 'Oppfølging av forrige samtales handlingsplan');
  assert.deepEqual(topics[0].prompts.slice(0, 1), ['Hva er gjennomført?']);
  assert.equal(topics[5].title, 'Andre tema som ønskes tatt opp');
  assert.deepEqual(topics[5].prompts, []);
  const cols = topicColumns(topicTable(doc));
  assert.ok(cols.before && cols.during && cols.topic && cols.pos);
  assert.deepEqual(splitTopic('Tittel\n• a\n- b\n\n* c'), { title: 'Tittel', prompts: ['a', 'b', 'c'] });
}

// Malen: merknad og den ansattes signatur kan ikke fylles ut av lederen.
{
  const doc = fresh();
  const comment = doc.fields.find((f) => f.label === COMMENT_LABEL);
  assert.equal(comment.editor, 'fast');
  assert.equal(employeeSignField(doc).editor, 'fast');
  assert.equal(leaderSignField(doc).label, 'Signatur for {{firma}}');
  // Eldre skjema der feltet var åpent, låses i visningen.
  const old = { ...doc, fields: doc.fields.map((f) => (f.kind === 'sign' ? { ...f, editor: 'avsender' } : f)) };
  assert.equal(employeeSignField(lockEmployeeSign(old)).editor, 'fast');
  assert.equal(leaderSignField(lockEmployeeSign(old)).editor, 'avsender');
  const tried = setFilledValue(lockEmployeeSign(old), employeeSignField(old).id, { name: 'Lea Leder', at: now.toISOString() });
  assert.equal(employeeSignField(tried).value, null, 'lederen kan ikke signere for den ansatte');
}

// Invitasjon: tidspunkt, svarfrist to dager før, og varsel.
{
  const doc = fresh();
  const prep = invitationPrep(doc, { employee, leader, meetingDate: '2026-03-12', meetingTime: '10.00', place: 'Møterom 2', now });
  assert.equal(prep.id, doc.id);
  assert.equal(prep.status, 'sent');
  assert.equal(prep.employeeUid, 'u_ansatt');
  assert.equal(prep.meetingTime, '10:00');
  assert.equal(prep.respondBy, '2026-03-10');
  assert.equal(prep.topics.length, 6);
  assert.equal(meetingLine(prep), '12.03.2026 kl. 10.00 · Møterom 2');
  assert.equal(prepState(prep).label, 'Sendt til medarbeider');
  assert.equal(prepState(null).id, 'none');
  const notice = invitationNotice(prep);
  assert.match(notice.body, /Lea Leder har sendt temaene/);
  assert.match(notice.body, /frivillig/);
  assert.match(notice.body, /10\.03\.2026/);
  assert.equal(defaultRespondBy('2026-03-03', '2026-03-02'), '2026-03-02', 'ikke før i dag');
  assert.equal(defaultRespondBy('2026-03-02', '2026-03-05'), '2026-03-02', 'samtalen har vært');
  assert.equal(defaultRespondBy('', '2026-03-02'), '');
}

// Forberedelse: utkast og innsending; bare kjente tema, og ikke lengre enn en celle.
{
  const doc = fresh();
  const prep = invitationPrep(doc, { employee, leader, meetingDate: '2026-03-12', now });
  const [t1, t2] = prep.topics;
  const draft = withAnswers(prep, { [t1.id]: '  Kurs i Revit \n', ukjent: 'x', [t2.id]: '' }, { now });
  assert.equal(draft.status, 'sent');
  assert.deepEqual(draft.answers, { [t1.id]: 'Kurs i Revit' });
  const sent = withAnswers(draft, { ...draft.answers, [t2.id]: 'y'.repeat(ANSWER_MAX + 50) }, { submit: true, now });
  assert.equal(sent.status, 'submitted');
  assert.equal(sent.answers[t2.id].length, ANSWER_MAX);
  assert.equal(answerCount(sent), 2);
  assert.ok(canAnswer(sent));
  // Et utkast etter innsending beholder «mottatt».
  assert.equal(withAnswers(sent, sent.answers, { now }).status, 'submitted');
  assert.deepEqual(cleanAnswers({ [t1.id]: 5 }, prep.topics), { [t1.id]: '5' });
  // Ny utsending (endret tidspunkt) beholder svarene.
  const again = invitationPrep(doc, { employee, leader, meetingDate: '2026-03-13', previous: sent, now });
  assert.equal(again.status, 'submitted');
  assert.equal(again.answers[t1.id], 'Kurs i Revit');

  // Svarene settes inn i «Før samtalen»; tekst lederen har skrevet, beholdes.
  let filled = cell(doc, 'Tema', 1, 'Før', 'Lederens egne notater');
  const res = applyPrepAnswers(filled, sent);
  assert.equal(res.filled, 1);
  assert.equal(res.kept, 1);
  const table = topicTable(res.doc);
  const before = topicColumns(table).before;
  const rows = tableRows(table);
  assert.equal(rows[0].cells[before], 'Kurs i Revit');
  assert.equal(rows[1].cells[before], 'Lederens egne notater');
  assert.equal(applyPrepAnswers(res.doc, sent).filled, 0, 'ingen endring andre gang');
  filled = applyPrepAnswers(res.doc, sent, { overwrite: true }).doc;
  assert.equal(tableRows(topicTable(filled))[1].cells[before].length, ANSWER_MAX);
}

// Signering: lederen signerer, den ansatte signerer, skjemaet blir ferdig.
{
  let doc = fill(fresh(), 'Medarbeider', 'Ola Ansatt');
  doc = fill(doc, 'Leder', 'Lea Leder');
  const missing = signAsLeader(doc, { actor: leader, now });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Dato for samtalen/);
  doc = fill(doc, 'Dato for samtalen', '2026-03-12');
  doc = cell(doc, 'Tema', 0, 'Under', 'Alt gjennomført.');
  doc = cell(doc, 'Handlingsplan', 0, 'Tiltak', 'Revit-kurs');
  doc = cell(doc, 'Handlingsplan', 0, 'Ansvar', 'Ola');
  doc = cell(doc, 'Handlingsplan', 0, 'Frist', '2026-06-01');
  const signed = signAsLeader(doc, { actor: leader, now });
  assert.equal(signed.ok, true);
  assert.equal(leaderSignField(signed.doc).value.name, 'Lea Leder');
  assert.equal(employeeSignField(signed.doc).value, null);
  assert.equal(signAsLeader(signed.doc, { actor: { uid: 'x', name: 'Annen' }, now }).doc, signed.doc, 'signerer ikke to ganger');
  assert.equal(signAsLeader(fill(fill(fill(fresh(), 'Medarbeider', 'O'), 'Leder', 'L'), 'Dato for samtalen', '2026-03-12'), { actor: { uid: 'x' }, now }).ok, false, 'uten navn');

  let prep = invitationPrep(doc, { employee, leader, meetingDate: '2026-03-12', now });
  prep = signingPrep(prep, signed.doc, { actor: leader, now });
  assert.equal(prep.status, 'signing');
  assert.equal(prep.leaderSignature.name, 'Lea Leder');
  assert.equal(canAnswer(prep), false);
  assert.equal(withAnswers(prep, {}), null);
  const stored = normalizePrep(JSON.parse(JSON.stringify(prep)));
  assert.equal(stored.signing.doc.id, doc.id);
  const back = withdrawSigning(stored, { now });
  assert.equal(back.status, 'sent');
  assert.equal(back.signing, null);

  const at = '2026-03-12T09:42:00.000Z';
  const done = normalizeFilledDoc(signedDoc(stored.signing.doc, {
    signature: { name: 'Ola Ansatt', uid: 'u_ansatt', at }, comment: 'Ønsker også et kurs i BIM.', now: new Date(at),
  }));
  assert.equal(done.status, 'ferdig');
  assert.equal(done.completedBy.uid, 'u_ansatt');
  assert.equal(employeeSignField(done).value.name, 'Ola Ansatt');
  assert.equal(done.fields.find((f) => f.label === COMMENT_LABEL).value, 'Ønsker også et kurs i BIM.');
  assert.equal(reviewActionPlan(done)[0].tiltak, 'Revit-kurs');
  // Ferdig skjema kan ikke få nye svar satt inn.
  assert.equal(applyPrepAnswers(done, { answers: { x: 'y' } }).filled, 0);

  // Bedriftens variant uten merknad og uten signaturfelt for den ansatte: feltene legges til.
  const custom = { ...stored.signing.doc, fields: stored.signing.doc.fields.filter((f) => f.label !== COMMENT_LABEL && !/medarbeider/i.test(f.kind === 'sign' ? f.label : '')) };
  const customDone = signedDoc(custom, { signature: { name: 'Ola', at }, comment: 'Merk', now: new Date(at) });
  const signIdx = customDone.fields.findIndex((f) => f.kind === 'sign');
  assert.equal(customDone.fields[signIdx - 1].label, COMMENT_LABEL);
  assert.equal(employeeSignField(customDone).value.name, 'Ola');

  // Det den ansatte leser før signering.
  const summary = reviewSummary(stored.signing.doc);
  assert.equal(summary.topics.length, 6);
  assert.equal(summary.topics[0].during, 'Alt gjennomført.');
  assert.equal(summary.topics[0].title, 'Oppfølging av forrige samtales handlingsplan');
  assert.deepEqual(summary.plan, [{ tiltak: 'Revit-kurs', ansvar: 'Ola', frist: '2026-06-01' }]);
  assert.ok(summary.facts.some((f) => f.label === 'Dato for samtalen' && f.value === '12.03.2026'));

  // E-post og PDF.
  const finalPrep = { ...stored, status: 'signed', employeeSignature: { name: 'Ola Ansatt', uid: 'u_ansatt', at }, comment: 'Ønsker også et kurs i BIM.' };
  const mail = copyMail(finalPrep, { companyName: 'Bygg AS' });
  assert.equal(mail.subject, 'Medarbeidersamtale 12.03.2026 – signert kopi');
  assert.match(mail.text, /mellom Lea Leder og Ola Ansatt 12\.03\.2026 i Bygg AS/);
  assert.match(mail.text, /Ola Ansatt, 12\.03\.2026 kl\. 10\.42/);
  assert.match(mail.text, /Merknad fra medarbeider: Ønsker også et kurs i BIM\./);
  assert.equal(stampLine(at), '12.03.2026 kl. 10.42');
  assert.equal(copyFileName(finalPrep), 'Medarbeidersamtale-Ola-Ansatt-2026-03-12.pdf');

  const { doc: head, streams } = reviewCopyStreams(done, { company: { firma: 'Bygg AS' }, employeeName: 'Ola Ansatt', meetingDate: '2026-03-12' });
  assert.equal(head.draft, false);
  assert.equal(head.subtitle, 'Ola Ansatt · 12.03.2026');
  assert.match(head.footerLeft, /^Fortrolig · Bygg AS/);
  const all = streams.join('\n');
  assert.match(all, /Signatur for Bygg AS/i);
  assert.match(all, /Revit-kurs/);
  assert.match(all, /Signert digitalt 12\.03\.2026 kl\. 10\.42/);
  assert.doesNotMatch(all, /\{\{firma\}\}/);
  const bytes = buildReviewCopyPdf(done, { company: { firma: 'Bygg AS' }, employeeName: 'Ola Ansatt' });
  const pdf = Buffer.from(bytes).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-'));
  assert.ok(pdf.trimEnd().endsWith('%%EOF'));
  // Utkast (ikke ferdig) merkes.
  assert.equal(reviewCopyStreams(doc, {}).doc.draft, true);
  assert.equal(completeFilledDoc(done).ok, true);
}

console.log('reviewPrep: ok');
