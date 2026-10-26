import assert from 'node:assert/strict';
import {
  ackFor,
  archiveControl,
  ackStatus,
  approveRevision,
  canApprove,
  canComment,
  canSeeComment,
  contentHash,
  controlKey,
  controlStatus,
  docHeader,
  documentsForEmployee,
  ensureWorkingRevision,
  markReviewed,
  newComment,
  newControl,
  normalizeControl,
  normalizeSettings,
  overviewRows,
  pendingFor,
  publishedRevision,
  publishedSnapshot,
  rejectRevision,
  resolveComment,
  revisionLog,
  shouldNotify,
  submitRevision,
  updateControl,
  withdrawRevision,
  workingRevision,
} from './model.js';
import { handbookFromControl, handbookHash, handbookSnapshot, markParts, templateFromSnapshot, templateHash, templateSnapshot } from './content.js';
import {
  autoControlled,
  defaultReadRule,
  draftHeaderForTemplate,
  fillSource,
  formFromControl,
  headerForTemplate,
  libraryKeyOf,
  newTemplateControl,
  nextDocCode,
} from './templates.js';
import { libraryForm, libraryTemplateId } from '../forms/ksLibrary.js';

const kari = { uid: 'kari', name: 'Kari Leder' };
const ola = { uid: 'ola', name: 'Ola Ansatt' };
const per = { uid: 'per', name: 'Per Godkjenner' };
const t0 = new Date('2026-01-10T09:00:00Z');
const t1 = new Date('2026-01-11T09:00:00Z');
const t2 = new Date('2026-03-01T09:00:00Z');

/* Opprettelse og hode */
let control = newControl({ kind: 'template', refId: 'ks_sja', title: 'SJA', code: 'C1-B-03-003', readRule: 'info' }, { actor: kari, now: t0 });
assert.equal(control.id, 'tpl_ks_sja');
assert.equal(controlKey('handbook'), 'handbook');
assert.equal(workingRevision(control).revision, 1);
let header = docHeader(control, { system: 'Eksempel AS - Ledelsessystem' });
assert.equal(header.docId, 'C1-B-03-003');
assert.equal(header.version, 'Utkast 1');
assert.equal(header.approvedBy, '', 'ikke godkjent før godkjenning faktisk skjer');
assert.equal(header.owner, 'Kari Leder', 'den som oppretter, er eier til noe annet er valgt');
assert.equal(header.created, '10.01.26');

/* Innsending og godkjenning med fire øyne */
const settings = normalizeSettings({ approvers: [per], fourEyes: true });
const snapshot1 = templateSnapshot(libraryForm('sja'));
let res = submitRevision(control, snapshot1, { actor: kari, now: t0 });
assert.equal(res.ok, true);
control = res.control;
assert.equal(workingRevision(control).state, 'til_gjennomgang');
assert.equal(controlStatus(control).tone, 'warn');
assert.equal(canApprove(control, kari, settings).ok, false, 'Kari er ikke godkjenner');
assert.equal(canApprove(control, per, settings).ok, true);
assert.equal(approveRevision(control, { actor: per, settings, currentHash: 'annet' }).ok, false, 'endret etter innsending');
res = approveRevision(control, { actor: per, settings, currentHash: contentHash(snapshot1), now: t1 });
assert.equal(res.ok, true);
control = res.control;
assert.equal(publishedRevision(control).revision, 1);
assert.deepEqual(publishedSnapshot(control), snapshot1);
header = docHeader(control);
assert.equal(header.version, '1');
assert.equal(header.approvedBy, 'Per Godkjenner');
assert.equal(header.approved, '11.01.26');
assert.equal(control.nextReview, '2027-01-11', 'gjennomgang hvert år');
assert.equal(controlStatus(control, t1).tone, 'ok');

/* Ny versjon blir ny revisjon av seg selv */
assert.equal(ensureWorkingRevision(control, contentHash(snapshot1)), control, 'uendret innhold gir ingen revisjon');
const changed = { ...snapshot1, title: 'SJA endret' };
control = ensureWorkingRevision(control, contentHash(changed), { actor: kari, now: t2 });
assert.equal(workingRevision(control).revision, 2);
assert.equal(submitRevision(control, changed, { actor: kari }).ok, false, 'rev. 2 krever endringsbeskrivelse');
control = submitRevision(control, changed, { actor: kari, changeReason: 'Nye punkter', now: t2 }).control;
const rejected = rejectRevision(control, 'Nei', { actor: per, settings });
assert.equal(rejected.ok, false, 'avvisning krever begrunnelse');
control = rejectRevision(control, 'Mangler punkt om løfteutstyr', { actor: per, settings, now: t2 }).control;
assert.equal(workingRevision(control).state, 'avvist');
control = submitRevision(control, changed, { actor: kari, now: t2 }).control;
assert.equal(withdrawRevision(control, { actor: kari }).control.revisions.find((row) => row.revision === 2).state, 'utkast');
control = approveRevision(control, { actor: per, settings, currentHash: contentHash(changed), now: t2 }).control;
assert.equal(control.publishedRevision, 2);
assert.equal(control.revisions.find((row) => row.revision === 1).state, 'erstattet');
const log = revisionLog(control);
assert.deepEqual(log.map((row) => [row.revision, row.reason, row.approvedBy]), [[2, 'Nye punkter', 'Per Godkjenner'], [1, 'Første utgave', 'Per Godkjenner']]);

/* Utpekt godkjenner og administrator */
const admin = normalizeSettings({});
let other = newControl({ kind: 'handbook', title: 'Personalhåndbok' }, { actor: kari });
other = submitRevision(other, { chapters: [] }, { actor: kari }).control;
assert.equal(canApprove(other, ola, admin, { isAdmin: false }).ok, false);
assert.equal(canApprove(other, ola, admin, { isAdmin: true }).ok, true, 'uten godkjennere kan administrator godkjenne');
assert.equal(canApprove(other, kari, admin, { isAdmin: true }).ok, false, 'fire øyne: ikke egen innsending');
assert.equal(canApprove(other, kari, normalizeSettings({ fourEyes: false }), { isAdmin: true }).ok, true);
other = updateControl(other, { approver: per, readRule: 'pakrevd' }, { actor: kari });
assert.equal(canApprove(other, ola, admin, { isAdmin: true }).ok, false, 'utpekt godkjenner går foran');
assert.equal(canApprove(other, per, admin).ok, true);
assert.match(other.history.at(-1).action, /godkjenner Per Godkjenner/);

/* Varsel ved ny versjon */
assert.equal(shouldNotify({ readRule: 'pakrevd', notify: 'standard' }, { notifyOnPublish: true }), true);
assert.equal(shouldNotify({ readRule: 'pakrevd', notify: 'standard' }, { notifyOnPublish: false }), false);
assert.equal(shouldNotify({ readRule: 'ingen', notify: 'standard' }, {}), false);
assert.equal(shouldNotify({ readRule: 'ingen', notify: 'ja' }, { notifyOnPublish: false }), true);

/* Gjennomgang */
const reviewed = markReviewed(control, { decision: 'revideres', note: 'Merknader fra ledelsens gjennomgang', actor: kari, now: t2 }).control;
assert.equal(reviewed.lastReview.decision, 'revideres');
assert.equal(workingRevision(reviewed).revision, 3, 'revideres starter ny revisjon');
assert.equal(markReviewed(control, { decision: 'feil' }).ok, false);
assert.equal(controlStatus({ ...control, nextReview: '2026-01-01' }, t2).label, 'Versjon 2 · gjennomgang forfalt');

/* Merknader */
const comment = newComment({ control, anchorId: 'kap_1', anchorLabel: 'Ferie', quote: '5 uker', note: 'Gjelder også deltid?' }, { actor: ola });
assert.equal(comment.revision, 2);
assert.equal(canSeeComment(comment, ola, settings), true, 'forfatteren ser sin egen merknad');
assert.equal(canSeeComment(comment, { uid: 'x' }, settings), false, 'andre ansatte ser den ikke');
assert.equal(canSeeComment(comment, per, settings), true, 'godkjenner ser den');
assert.equal(canSeeComment(comment, { uid: 'leser' }, normalizeSettings({ commentReaders: [{ uid: 'leser', name: 'L' }] })), true);
assert.equal(canSeeComment(comment, kari, settings, { control }), true, 'eier ser den');
assert.equal(canComment(ola, settings), false, 'ansatte kan ikke skrive merknader uten innstilling');
assert.equal(canComment(ola, normalizeSettings({ employeesCanComment: true })), true);
assert.equal(canComment(kari, settings, { isLeader: true }), true);
const resolved = resolveComment(comment, { status: 'tatt_inn', resolution: 'Presisert', actor: kari, control: reviewed });
assert.equal(resolved.resolvedInRevision, 3);

/* Lesebekreftelse og oversikt */
const employees = [
  { id: 'e1', personUid: 'ola', person: { firstName: 'Ola', lastName: 'Ansatt' } },
  { id: 'e2', person: { firstName: 'Lise', lastName: 'Ny' } },
];
const pakrevd = updateControl(control, { readRule: 'pakrevd' });
const acks = [ackFor(pakrevd.id, 1, { uid: 'ola', employeeId: 'e1' }), ackFor(pakrevd.id, 2, { employeeId: 'e2' })];
const status = ackStatus(employees, acks, pakrevd);
assert.deepEqual(status.map((row) => row.current), [false, true], 'Ola har bare lest versjon 1');
const rows = overviewRows([pakrevd], { acks, comments: [comment], employees, now: t2 });
assert.equal(rows[0].read.done, 1);
assert.equal(rows[0].openComments, 1);
assert.equal(rows[0].version, 2);
const mine = documentsForEmployee([pakrevd], { acks, uid: 'ola', employeeId: 'e1' });
assert.equal(mine[0].required, true);
assert.equal(mine[0].done, false);
const signeres = updateControl(control, { readRule: 'signeres' });
const signed = documentsForEmployee([signeres], { filled: [{ templateId: 'ks_sja', status: 'ferdig', subject: { kind: 'employee', id: 'e1' } }], employeeId: 'e1' });
assert.equal(signed[0].done, true);
const pending = pendingFor([reviewed, submitRevision(reviewed, { x: 1 }, { actor: kari, changeReason: 'x' }).control], per, settings, { now: t2 });
assert.equal(pending.approvals.length, 1);

/* Innhold */
const form = libraryForm('branninstruks');
assert.equal(templateHash(form), templateHash({ ...form, responses: [{ id: 'svar' }] }), 'svar påvirker ikke sjekksummen');
assert.notEqual(templateHash(form), templateHash({ ...form, title: 'Ny tittel' }));
assert.equal(templateFromSnapshot(templateSnapshot(form), { id: 'ks_branninstruks' }).fields.length, form.fields.length);
assert.equal(handbookHash({ chapters: [{ id: 'a', title: 'A', body: 'x' }] }), handbookHash({ chapters: [{ id: 'a', title: 'A', body: 'x' }], changedAt: 'nå' }));
assert.equal(handbookSnapshot({ chapters: [] }).title, 'Personalhåndbok');

/* Merknader merkes i teksten */
assert.deepEqual(markParts('Ferie er fem uker i året', ['fem uker']), [
  { text: 'Ferie er ', hit: false }, { text: 'fem uker', hit: true }, { text: ' i året', hit: false },
]);
assert.deepEqual(markParts('Ingen treff', ['annet']), [{ text: 'Ingen treff', hit: false }]);
assert.equal(markParts('Fem uker og FEM UKER', ['fem uker']).filter((row) => row.hit).length, 2, 'uten hensyn til store og små bokstaver');
assert.deepEqual(markParts('ab', ['a']), [{ text: 'ab', hit: false }], 'for korte sitater merkes ikke');

/* Maler i Skjemabygger */
const sja = { ...libraryForm('sja'), id: libraryTemplateId('sja') };
assert.equal(libraryKeyOf(sja), 'sja');
assert.equal(libraryKeyOf('ks_sja'), 'sja');
assert.equal(libraryKeyOf('egen_mal'), '');
assert.equal(autoControlled(sja), true, 'KS-maler styres alltid');
assert.equal(autoControlled({ id: 'x', title: 'Egen' }), false);
assert.equal(autoControlled({ ...sja, category: 'avtale' }), false, 'avtalemaler har egen flyt');
assert.equal(defaultReadRule('taushetserklaering'), 'signeres');
assert.equal(defaultReadRule('branninstruks'), 'pakrevd');
assert.equal(defaultReadRule('avfallsinstruks'), 'info');
assert.equal(defaultReadRule('sja'), 'ingen');
assert.equal(nextDocCode([{ code: 'PT-001' }, { code: 'PT-007' }, { code: 'C1-A' }]), 'PT-008');
let tpl = newTemplateControl(sja, { actor: kari, settings: normalizeSettings({ defaultReviewMonths: 24 }) });
assert.equal(tpl.id, 'tpl_ks_sja');
assert.equal(tpl.code, 'C1-B-03-003', 'KS-referansen blir dokument-ID');
assert.equal(tpl.reviewIntervalMonths, 24);
assert.equal(newTemplateControl({ id: 'egen', title: 'Egen' }, { controls: [{ code: 'PT-002' }] }).code, 'PT-003');
assert.equal(headerForTemplate(sja, null).version, 'Utkast', 'uten godkjenning står det utkast, ikke versjon 1');
assert.equal(headerForTemplate(sja, null).approvedBy, '');
assert.equal(headerForTemplate({ id: 'x', title: 'Uten hode' }, null).docId, '', 'egne maler uten styring har tomt hode');
assert.equal(fillSource(sja, tpl).approved, false);
tpl = submitRevision(tpl, templateSnapshot(sja), { actor: kari }).control;
tpl = approveRevision(tpl, { actor: per, settings }).control;
let source = fillSource({ ...sja, title: 'Endret utkast' }, tpl);
assert.equal(source.approved, true);
assert.equal(source.form.title, sja.title, 'utfylling bruker godkjent versjon, ikke utkastet');
assert.equal(source.form.doc.version, '1');
assert.equal(source.form.doc.approvedBy, 'Per Godkjenner');
assert.equal(source.form.doc.system, '{{firma}} - Ledelsessystem');
tpl = ensureWorkingRevision(tpl, templateHash({ ...sja, title: 'Endret utkast' }), { actor: kari });
assert.equal(draftHeaderForTemplate(sja, tpl).version, 'Utkast 2', 'utkastet som redigeres er neste revisjon');
assert.equal(draftHeaderForTemplate(sja, tpl).approvedBy, '');
assert.equal(headerForTemplate(sja, tpl).version, '1', 'utskrift av gjeldende versjon');
const fromControl = formFromControl(tpl);
assert.equal(fromControl.id, 'ks_sja');
assert.equal(fromControl.libraryKey, 'sja');
assert.equal(fromControl.doc.docId, 'C1-B-03-003');
assert.equal(formFromControl(newTemplateControl(sja)), null, 'uten godkjent versjon kan ingen signere');
assert.equal(archiveControl(tpl, { actor: kari }).archived, true);
assert.equal(documentsForEmployee([archiveControl(updateControl(tpl, { readRule: 'pakrevd' }))], {}).length, 0, 'arkiverte dokumenter vises ikke for ansatte');
const hb = handbookFromControl(approveRevision(submitRevision(newControl({ kind: 'handbook', title: 'Personalhåndbok' }, { actor: kari }), handbookSnapshot({ chapters: [{ id: 'a', title: 'A', body: 'x' }] }), { actor: kari }).control, { actor: per, settings }).control);
assert.equal(hb.version, 1);
assert.equal(hb.chapters[0].title, 'A');
assert.equal(handbookFromControl(null), null);

/* Normalisering tåler JSON-runde og eldre data */
assert.deepEqual(normalizeControl(JSON.parse(JSON.stringify(control))), control);
assert.equal(normalizeControl({ id: 'x' }), null);
assert.deepEqual(normalizeSettings({ approvers: [per, { name: 'uten uid' }] }).approverUids, ['per']);

console.log('doccontrol.test.mjs ok');
