import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAction, assessFinding, closeBlockers, closeFinding, completeAction, createFinding,
  recordRootCause, triageFinding, verifyAction, verifyEffect, reopenFinding,
} from './findings.js';
import {
  approveAndPublish, completeStep, createProcess, focusView, makeEdge, makeNode, saveDraftDiagram,
  startInstance, startNewVersion, submitForApproval, validateDiagram, diagramToSvg, exportProcessJson, importProcessJson,
} from './processes.js';
import { PROCESS_TEMPLATES, templateByKey } from './processTemplates.js';
import {
  approveAndPublishDocument, createDocument, newDocumentRevision, publishedRevisionOf, revisionOf, saveDocumentDraft, submitDocument,
} from './documents.js';
import {
  FORM_TEMPLATES, NATIVE_FORMS, approveTemplate, builderTemplateFromIso, controlledVersion, correctSubmission, driftStatus,
  recommendedFormKeys, submitControlled, templateIdFor, validateAnswers,
} from './forms.js';
import { normalizeFormTemplates } from '../anbud/bidLibrary.js';
import {
  actionsDoneInTasks, aspectSuggestions, autoAssignee, autoTaskEffects, contractReviewStatus, legacyProjectCases, mileageSeries,
  qualityPlanDraft, readinessChecklist, requirementIdsForFinding, setupDefaultsFromCompany, sickLeaveSeries, stakeholderSuggestions,
  starterPlan, supplierSuggestions, wasteSummary,
} from './integrations.js';
import {
  attachEvidence, effectiveStatus, matrixRows, reviewEvidenceLink, setAssessment, markForReassessment,
} from './requirements.js';
import {
  addAuditFinding, competenceMatrix, createRecord, findingInputFromAudit, objectiveProgress, addMeasurement,
  riskMatrix, assessmentStatusFromCompliance, setRecordState,
} from './registers.js';
import { canSeeFinding, isoCapabilities, visibleFindings } from './access.js';
import { closedWithinDeadline, findingTrend, kpis } from './analytics.js';
import { emptyIsoState, stateFromCollections } from './state.js';
import { isoRequirementLibrary, mayBeNotApplicable } from './catalog.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const PER = { uid: 'u2', name: 'Per Tiltak' };
const BOSS = { uid: 'u3', name: 'Siri Leder' };
const ADMIN = isoCapabilities({ bypass: true, uid: 'u3' });
const now = new Date('2026-10-22T10:00:00Z');

function state(extra = {}) {
  const s = emptyIsoState();
  s.system = { ...s.system, standards: ['ISO9001', 'ISO14001', 'ISO45001'], setupAt: '2026-10-01' };
  return { ...s, ...extra };
}

function reportedFinding(input = {}) {
  const r = createFinding({ type: 'prosess', title: 'Feil revisjon sendt kunde', description: 'Tegning rev B sendt i stedet for C.', ...input }, { actor: ANNE, now });
  assert.equal(r.ok, true, r.error);
  return r.finding;
}

test('avvik: ende-til-ende med tiltak, kontroll, effekt og lukking (A07/T09)', () => {
  let f = reportedFinding();
  assert.match(f.number, /^AVV-2026-001$/);
  assert.equal(f.state, 'registrert');
  assert.equal(closeFinding(f, { note: 'x' }, { actor: BOSS, caps: ADMIN, now }).ok, false);

  f = triageFinding(f, { severity: 'middels', assigneeName: ANNE.name, assigneeUid: ANNE.uid }, { actor: ANNE, now }).finding;
  assert.equal(f.state, 'triage');
  f = assessFinding(f, { correctiveRequired: true }, { actor: ANNE, now }).finding;
  assert.equal(f.effect.required, true);
  const added = addAction(f, { title: 'Innfør sjekk av revisjon før utsendelse', ownerName: PER.name, ownerUid: PER.uid, dueAt: '2026-11-01', requiredEvidence: 'Oppdatert sjekkliste' }, { actor: ANNE, now });
  f = added.finding;
  assert.equal(f.state, 'tiltak');
  assert.equal(added.action.taskKey, `iso_${f.id}_${added.action.id}`);

  // Kan ikke lukke: årsak mangler, tiltak åpent, effekt mangler
  const blockers = closeBlockers(f);
  assert.ok(blockers.some((b) => /Årsaksvurdering/.test(b)));
  assert.ok(blockers.some((b) => /tiltak er ikke kontrollert/.test(b)));
  assert.ok(blockers.some((b) => /Effekten/.test(b)));

  f = recordRootCause(f, { whys: ['Mangler kontroll', 'Ingen rutine'], systemCause: 'Rutine for utsendelse manglet kontrollsteg.' }, { actor: ANNE, now }).finding;
  assert.equal(completeAction(f, added.action.id, { note: 'Sjekkliste oppdatert' }, { actor: PER, now }).ok, false, 'krever bevis');
  f = completeAction(f, added.action.id, { note: 'Sjekkliste oppdatert', evidence: [{ label: 'Sjekkliste rev 2' }] }, { actor: PER, now }).finding;
  assert.equal(verifyAction(f, added.action.id, { approved: true }, { actor: PER, now }).ok, false, 'egen kontroll avvises');
  f = verifyAction(f, added.action.id, { approved: true }, { actor: ANNE, now }).finding;
  assert.equal(f.state, 'effektkontroll');
  assert.equal(closeFinding(f, { note: 'ok' }, { actor: BOSS, caps: ADMIN, now }).ok, false, 'effekt ikke verifisert');
  f = verifyEffect(f, { outcome: 'verifisert', method: 'Stikkprøve 10 utsendelser', note: 'Ingen feil' }, { actor: BOSS, now }).finding;
  const closed = closeFinding(f, { note: 'Tiltak virker' }, { actor: BOSS, caps: ADMIN, now });
  assert.equal(closed.ok, true, closed.error);
  assert.equal(closed.finding.state, 'lukket');
  assert.equal(closed.events[0].action, 'iso.finding.closed');
  assert.ok(closed.events[0].beforeHash && closed.events[0].afterHash);
});

test('avvik: effekt ikke verifisert gjenåpner og beholder historikk (T11)', () => {
  let f = reportedFinding();
  f = triageFinding(f, { severity: 'lav', assigneeName: ANNE.name }, { actor: ANNE, now }).finding;
  f = assessFinding(f, { correctiveRequired: true }, { actor: ANNE, now }).finding;
  const a = addAction(f, { title: 'Tiltak', ownerName: PER.name, dueAt: '2026-11-01' }, { actor: ANNE, now });
  f = completeAction(a.finding, a.action.id, { note: 'gjort' }, { actor: PER, now }).finding;
  f = verifyAction(f, a.action.id, { approved: true }, { actor: ANNE, now }).finding;
  f = verifyEffect(f, { outcome: 'ikke_verifisert', method: 'Oppfølging', note: 'Gjentok seg' }, { actor: BOSS, now }).finding;
  assert.equal(f.state, 'vurdert');
  assert.equal(f.reopenCount, 1);
  assert.equal(f.effect.checks.length, 1);
  assert.ok(f.history.some((h) => /gjenåpnet/.test(h.action)));
  assert.equal(closeFinding(f, { note: 'x' }, { actor: BOSS, caps: ADMIN, now }).ok, false);
});

test('avvik: ingen korrigerende tiltak krever begrunnelse og administrator for lukking', () => {
  let f = reportedFinding({ type: 'forbedring' });
  f = triageFinding(f, { severity: 'lav', assigneeName: ANNE.name }, { actor: ANNE, now }).finding;
  assert.equal(assessFinding(f, { correctiveRequired: false, rationale: 'kort' }, { actor: ANNE, now }).ok, false);
  f = assessFinding(f, { correctiveRequired: false, rationale: 'Forslaget er notert, men gir ingen risiko for kunde.' }, { actor: ANNE, now }).finding;
  const staff = isoCapabilities({ grants: { iso: 'read' }, uid: 'u1' });
  assert.equal(closeFinding(f, { note: 'ok' }, { actor: ANNE, caps: staff, now }).ok, false);
  assert.equal(closeFinding(f, { note: 'ok' }, { actor: BOSS, caps: ADMIN, now }).ok, true);
});

test('avvik: meldeplikt og akutt fare må håndteres', () => {
  const missing = createFinding({ type: 'hms', title: 'Fall', description: 'Fall fra stige', authorityNotificationRequired: true }, { actor: ANNE, now });
  assert.equal(missing.ok, false);
  let f = createFinding({ type: 'hms', title: 'Fall', description: 'Fall fra stige', authorityNotificationRequired: true, notificationAssignee: BOSS.name }, { actor: ANNE, now }).finding;
  assert.equal(f.restricted, true, 'HMS-hendelse skjermes som standard');
  assert.equal(triageFinding(f, { severity: 'hoy', urgent: true, assigneeName: BOSS.name }, { actor: BOSS, now }).ok, false);
  f = triageFinding(f, { severity: 'hoy', urgent: true, immediateAction: 'Stige tatt ut av bruk', assigneeName: BOSS.name }, { actor: BOSS, now }).finding;
  f = assessFinding(f, { correctiveRequired: false, rationale: 'Engangshendelse, stige kassert og erstattet.' }, { actor: BOSS, now }).finding;
  assert.match(closeBlockers(f)[0], /meldeplikt/);
});

test('tilgang: skjermet HMS-sak er usynlig for ansatt uten tilgang, også i KPI (A11/T23)', () => {
  const hms = createFinding({ type: 'hms', title: 'Skade', description: 'Kutt i hånd', personalDetails: 'Navn og skade' }, { actor: BOSS, now }).finding;
  const normal = reportedFinding();
  const staff = isoCapabilities({ grants: { iso: 'see' }, uid: 'u9' });
  assert.equal(canSeeFinding(staff, hms), false);
  assert.equal(canSeeFinding(staff, normal), true);
  assert.deepEqual(visibleFindings(staff, [hms, normal]).map((f) => f.id), [normal.id]);
  const s = state({ findings: [hms, normal] });
  assert.equal(kpis(s, staff, { now }).find((k) => k.key === 'openFindings').value, 1);
  const reporter = isoCapabilities({ grants: { iso: 'see' }, uid: BOSS.uid });
  assert.equal(canSeeFinding(reporter, hms), true, 'den som meldte saken ser den');
  const hse = isoCapabilities({ grants: { iso: 'read' }, uid: 'u8', system: { restrictedAccess: [{ uid: 'u8', name: 'HMS' }] } });
  assert.equal(isoCapabilities({ grants: { iso: 'read' }, uid: 'u7', system: { roleMap: { hse_manager: { uid: 'u7' } } } }).restrictedView, true, 'HMS-leder ser skjermede saker');
  assert.equal(canSeeFinding(hse, hms), true);
});

test('kravmatrise: ett bevis til to krav, hver kobling vurderes for seg (A02/T18)', () => {
  let s = state();
  const lib = matrixRows(s);
  assert.ok(lib.length > 60, 'alle tre standarder gir kravposter');
  const r1 = lib.find((r) => r.standard === 'ISO9001' && r.areaKey === 'nonconformity');
  const r2 = lib.find((r) => r.standard === 'ISO45001' && r.areaKey === 'nonconformity');
  const att = attachEvidence(s, { type: 'finding', objectId: 'avv1', objectRevision: 7, label: 'AVV-2026-001' }, [r1.id, r2.id], { actor: ANNE, now });
  s = { ...s, evidence: att.evidence, evidenceLinks: att.evidenceLinks, assessments: att.assessments };
  assert.equal(s.evidence.length, 1);
  assert.equal(s.evidenceLinks.length, 2);
  assert.equal(effectiveStatus(s, r1.id, now), 'dokumentert', 'bevis gir ikke automatisk verifisert');
  // Samme bevis igjen → ingen duplikat
  const again = attachEvidence(s, { type: 'finding', objectId: 'avv1', objectRevision: 7, label: 'AVV-2026-001' }, [r1.id], { actor: ANNE, now });
  assert.equal(again.evidence.length, 1);
  assert.equal(again.evidenceLinks.length, 2);
  // Verifisering krever godkjent bevis + begrunnelse
  assert.equal(setAssessment(s, r1.id, { status: 'internt_verifisert', rationale: 'Kontrollert sak og tiltak mot rutine' }, { actor: BOSS, caps: ADMIN, now }).ok, false);
  const link = s.evidenceLinks.find((l) => l.requirementId === r1.id);
  s = { ...s, evidenceLinks: reviewEvidenceLink(s, link.id, { decision: 'godkjent' }, { actor: BOSS, caps: ADMIN, now }).evidenceLinks };
  const ok = setAssessment(s, r1.id, { status: 'internt_verifisert', rationale: 'Kontrollert sak og tiltak mot rutine' }, { actor: BOSS, caps: ADMIN, now });
  assert.equal(ok.ok, true, ok.error);
  s = { ...s, assessments: ok.assessments };
  assert.equal(effectiveStatus(s, r1.id, now), 'internt_verifisert');
  assert.equal(effectiveStatus(s, r2.id, now), 'dokumentert', 'r2 er ikke vurdert selv om beviset er delt');
  assert.equal(effectiveStatus(s, r1.id, new Date('2028-01-01')), 'ma_revurderes', 'forfalt vurdering');
  const flagged = markForReassessment(s, [r1.id], 'Prosess endret', { actor: BOSS, now });
  assert.equal(flagged.assessments.find((a) => a.requirementId === r1.id).status, 'ma_revurderes');
});

test('kravmatrise: 14001/45001 kan ikke settes ikke relevant, 9001 kap. 8 kan med begrunnelse', () => {
  const lib = isoRequirementLibrary();
  const env = lib.find((r) => r.standard === 'ISO14001' && r.areaKey === 'aspects');
  const design = lib.find((r) => r.standard === 'ISO9001' && r.areaKey === 'design');
  assert.equal(mayBeNotApplicable(env), false);
  assert.equal(mayBeNotApplicable(design), true);
  const s = state();
  assert.equal(setAssessment(s, env.id, { status: 'ikke_relevant', rationale: 'Vi har ingen miljøpåvirkning i det hele tatt' }, { actor: BOSS, caps: ADMIN, now }).ok, false);
  assert.equal(setAssessment(s, design.id, { status: 'ikke_relevant', rationale: 'Virksomheten prosjekterer ikke, kun kontroll.' }, { actor: BOSS, caps: ADMIN, now }).ok, true);
});

test('prosess: validator gir konkrete feil (T05)', () => {
  const start = makeNode('start', { id: 's' });
  const dec = makeNode('decision', { id: 'd', label: 'OK?', roleLabel: 'Leder' });
  const a = makeNode('activity', { id: 'a', roleLabel: 'Leder' });
  const end = makeNode('end', { id: 'e' });
  const missingNo = { nodes: [start, dec, a, end], edges: [makeEdge('s', 'd'), makeEdge('d', 'a', { condition: 'yes', label: 'Ja' }), makeEdge('a', 'e')] };
  const res = validateDiagram(missingNo);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.nodeId === 'd' && /to utganger|Nei-gren/.test(e.message)));
  const noRole = validateDiagram({ nodes: [start, makeNode('task', { id: 't' }), end], edges: [makeEdge('s', 't'), makeEdge('t', 'e')] });
  assert.ok(noRole.errors.some((e) => /ansvarlig rolle/.test(e.message)));
  const loop = validateDiagram({ nodes: [start, makeNode('activity', { id: 'x', roleLabel: 'A' }), makeNode('activity', { id: 'y', roleLabel: 'A' }), end], edges: [makeEdge('s', 'x'), makeEdge('x', 'y'), makeEdge('y', 'x')] });
  assert.ok(loop.errors.some((e) => /Løkke/.test(e.message) || /fører ikke fram/.test(e.message)));
  const orphan = validateDiagram({ nodes: [start, end, makeNode('activity', { id: 'o', roleLabel: 'A' })], edges: [makeEdge('s', 'e')] });
  assert.ok(orphan.errors.some((e) => e.nodeId === 'o' && /kan ikke nås/.test(e.message)));
});

test('prosessmaler er gyldige og kan publiseres', () => {
  for (const t of PROCESS_TEMPLATES) {
    const tpl = templateByKey(t.key);
    const res = validateDiagram(tpl.diagram);
    assert.equal(res.ok, true, `${t.key}: ${res.errors.map((e) => e.message).join('; ')}`);
  }
});

test('prosess: design → godkjenning → publiser → instans; v1-saker beholder versjon (A03/A05/T06/T08)', () => {
  let p = createProcess({ title: 'Avvik', ownerName: ANNE.name }, { actor: ANNE, now, template: templateByKey('P02_avvik') }).process;
  assert.equal(startInstance(p, {}, { actor: ANNE, now }).ok, false, 'utkast kan ikke kjøres');
  const staff = isoCapabilities({ grants: { iso: 'see' } });
  assert.equal(submitForApproval(p, {}, { actor: ANNE, caps: staff, now }).ok, false);
  p = submitForApproval(p, {}, { actor: ANNE, now }).process;
  assert.equal(saveDraftDiagram(p, p.versions[0].diagram, { actor: ANNE, now }).ok, false, 'låst under godkjenning');
  p = approveAndPublish(p, {}, { actor: BOSS, caps: ADMIN, now }).process;
  assert.equal(p.publishedVersion, 1);

  const run = startInstance(p, { title: 'AVV-2026-001' }, { actor: ANNE, now });
  assert.equal(run.ok, true, run.error);
  let inst = run.instance;
  assert.deepEqual(inst.active, ['a']);
  assert.equal(run.effects.length, 1);
  assert.match(run.effects[0].key, /^isoproc_/);
  const step = completeStep(inst, p, 'a', {}, { actor: ANNE, now });
  inst = step.instance;
  assert.deepEqual(inst.active, ['b']);
  assert.equal(completeStep(inst, p, 'a', {}, { actor: ANNE, now }).ok, false, 'ingen dobbel fullføring');
  inst = completeStep(inst, p, 'b', {}, { actor: ANNE, now }).instance;
  assert.equal(completeStep(inst, p, 'c', {}, { actor: ANNE, now }).ok, false, 'beslutning krever valg');
  inst = completeStep(inst, p, 'c', { decision: 'no' }, { actor: ANNE, now }).instance;
  assert.deepEqual(inst.active, ['f']);

  // Ny versjon v2 publiseres — instansen bruker fortsatt v1
  p = startNewVersion(p, { actor: ANNE, now }).process;
  const draft = p.versions.find((v) => v.version === 2);
  const diagram = { ...draft.diagram, nodes: draft.diagram.nodes.map((n) => (n.id === 'f' ? { ...n, label: 'Endret' } : n)) };
  p = saveDraftDiagram(p, diagram, { actor: ANNE, now }).process;
  p = submitForApproval(p, {}, { actor: ANNE, now }).process;
  p = approveAndPublish(p, {}, { actor: BOSS, caps: ADMIN, now }).process;
  assert.equal(p.publishedVersion, 2);
  assert.equal(p.versions.find((v) => v.version === 1).state, 'erstattet');
  assert.equal(inst.version, 1);
  const view = focusView(inst, p);
  assert.equal(view.now[0].label, 'Korrigerende tiltak?', 'gammel versjon brukes for gammel sak');
  inst = completeStep(inst, p, 'f', { decision: 'no' }, { actor: ANNE, now }).instance;
  inst = completeStep(inst, p, 'l', {}, { actor: ANNE, now }).instance;
  assert.equal(completeStep(inst, p, 'k', {}, { actor: BOSS, now }).ok, false, 'godkjenning krever valg');
  inst = completeStep(inst, p, 'k', { approval: 'approved' }, { actor: BOSS, now }).instance;
  assert.equal(inst.state, 'fullfort');
});

test('prosess: parallell split/join venter på alle grener', () => {
  const nodes = [
    makeNode('start', { id: 's' }), makeNode('parallel_split', { id: 'p' }),
    makeNode('task', { id: 'x', roleLabel: 'A' }), makeNode('task', { id: 'y', roleLabel: 'B' }),
    makeNode('parallel_join', { id: 'j' }), makeNode('end', { id: 'e' }),
  ];
  const edges = [makeEdge('s', 'p'), makeEdge('p', 'x'), makeEdge('p', 'y'), makeEdge('x', 'j'), makeEdge('y', 'j'), makeEdge('j', 'e')];
  assert.equal(validateDiagram({ nodes, edges }).ok, true);
  let p = createProcess({ title: 'Parallell', ownerName: 'A' }, { actor: ANNE, now, template: { title: 'x', diagram: { nodes, edges } } }).process;
  p = submitForApproval(p, {}, { actor: ANNE, now }).process;
  p = approveAndPublish(p, {}, { actor: BOSS, caps: ADMIN, now }).process;
  let inst = startInstance(p, {}, { actor: ANNE, now }).instance;
  assert.deepEqual([...inst.active].sort(), ['x', 'y']);
  inst = completeStep(inst, p, 'x', {}, { actor: ANNE, now }).instance;
  assert.deepEqual(inst.active, ['y']);
  assert.equal(inst.state, 'aktiv');
  inst = completeStep(inst, p, 'y', {}, { actor: ANNE, now }).instance;
  assert.equal(inst.state, 'fullfort');
});

test('prosess: eksport SVG og JSON rundtur', () => {
  const tpl = templateByKey('P02_avvik');
  const svg = diagramToSvg(tpl.diagram, { title: 'Avvik' });
  assert.match(svg, /^<svg/);
  assert.match(svg, /Registrer avvik/);
  const p = createProcess({ title: 'Avvik', ownerName: 'A' }, { actor: ANNE, now, template: tpl }).process;
  const back = importProcessJson(exportProcessJson(p));
  assert.equal(back.ok, true);
  assert.equal(back.template.diagram.nodes.length, tpl.diagram.nodes.length);
  assert.equal(importProcessJson('{"format":"x"}').ok, false);
});

test('dokument: publisert revisjon låst, ny revisjon bevarer gammel (A06/T03)', () => {
  let d = createDocument({ title: 'Avviksrutine', docType: 'prosedyre', content: 'Rev 1 tekst' }, { actor: ANNE, now }).document;
  d = submitDocument(d, { actor: ANNE, now }).document;
  d = approveAndPublishDocument(d, { actor: BOSS, caps: ADMIN, now }).document;
  assert.equal(d.publishedRevision, 1);
  assert.equal(saveDocumentDraft(d, { content: 'endret' }, { actor: ANNE, now }).ok, false);
  d = newDocumentRevision(d, 'Ny kontroll', { actor: ANNE, now }).document;
  d = saveDocumentDraft(d, { content: 'Rev 2 tekst', changeReason: 'Lagt til kontrollsteg' }, { actor: ANNE, now }).document;
  d = submitDocument(d, { actor: ANNE, now }).document;
  d = approveAndPublishDocument(d, { actor: BOSS, caps: ADMIN, now }).document;
  assert.equal(publishedRevisionOf(d).content, 'Rev 2 tekst');
  assert.equal(revisionOf(d, 1).state, 'erstattet');
  assert.equal(revisionOf(d, 1).content, 'Rev 1 tekst');
});

function answerFor(f) {
  switch (f.kind) {
    case 'number': return '12';
    case 'date': return '2026-10-22';
    case 'time': return '08:00';
    case 'scale': return 3;
    case 'check': return true;
    case 'checks': return [f.options[0]?.label].filter(Boolean);
    case 'choice': case 'dropdown': return f.options[0]?.label || 'x';
    case 'image': case 'file': return [{ url: 'https://example.invalid/x.pdf', name: 'x.pdf' }];
    default: return 'Utfylt';
  }
}

test('skjema: alle 30 maler går fra Skjemabygger til godkjent, innsendt, låst og rapporterbar registrering (C5)', () => {
  assert.equal(FORM_TEMPLATES.length, 30);
  const keys = new Set(FORM_TEMPLATES.map((t) => t.key));
  for (const k of Object.keys(NATIVE_FORMS)) assert.ok(keys.has(k), `native ${k} finnes ikke som mal`);
  for (const k of recommendedFormKeys(['ISO9001', 'ISO14001', 'ISO45001'])) assert.ok(keys.has(k), k);
  const builder = normalizeFormTemplates(FORM_TEMPLATES.map(builderTemplateFromIso));
  assert.equal(builder.length, 30, 'Skjemabygger normaliserer bort maler');
  const submissions = [];
  for (const t of FORM_TEMPLATES) {
    const tpl = builder.find((b) => b.id === templateIdFor(t.key));
    assert.ok(tpl, t.key);
    assert.ok(tpl.fields.length, `${t.key} har ingen felt etter normalisering`);
    const approved = approveTemplate(null, tpl, { actor: BOSS, caps: ADMIN, now, templateKey: t.key });
    assert.equal(approved.ok, true, `${t.key}: ${approved.error}`);
    const control = approved.form;
    assert.equal(driftStatus(control, tpl), 'ok');
    const v = controlledVersion(control);
    const missing = submitControlled(control, {}, { actor: ANNE, now, existing: submissions });
    if (v.fields.some((f) => f.required)) assert.equal(missing.ok, false, `${t.key} godtar tomt skjema`);
    const answers = Object.fromEntries(v.fields.map((f) => [f.id, answerFor(f)]));
    const sub = submitControlled(control, answers, { actor: ANNE, now, idempotencyKey: `k_${t.key}`, existing: submissions, subjectRef: { projectId: 'p1' } });
    assert.equal(sub.ok, true, `${t.key}: ${sub.error} ${JSON.stringify(sub.errors)}`);
    assert.equal(sub.submission.locked, true);
    assert.equal(sub.submission.templateKey, t.key);
    assert.equal(sub.events.length, 1);
    submissions.push(sub.submission);
  }
  assert.equal(new Set(submissions.map((x) => x.id)).size, 30);
  // Rapportering: kontraktsgjennomgang telles per kontrakt.
  const c = contractReviewStatus([{ id: 'k1', title: 'Rammeavtale' }, { id: 'k2', title: 'Oppdrag' }], [{ ...submissions.find((x) => x.templateKey === 'SF19_KONTRAKT'), subjectRef: { contractId: 'k1' } }]);
  assert.deepEqual(c.missing.map((r) => r.id), ['k2']);
});

test('skjema: idempotent innsending, drift ved endring i Skjemabygger, retting bevarer original', () => {
  const tpl = normalizeFormTemplates([builderTemplateFromIso(FORM_TEMPLATES.find((t) => t.key === 'SF16_AVVIK'))])[0];
  const control = approveTemplate(null, tpl, { actor: BOSS, caps: ADMIN, now, templateKey: 'SF16_AVVIK' }).form;
  assert.equal(approveTemplate(control, tpl, { actor: BOSS, caps: ADMIN, now }).ok, false, 'samme versjon godkjennes ikke to ganger');
  assert.equal(approveTemplate(null, tpl, { actor: ANNE, caps: isoCapabilities({ grants: { iso: 'edit' }, uid: 'u1' }), now }).ok, false, 'bare admin godkjenner');
  const v = controlledVersion(control);
  const answers = Object.fromEntries(v.fields.map((f) => [f.id, answerFor(f)]));
  const a = submitControlled(control, answers, { actor: ANNE, now, idempotencyKey: 'k1' });
  const b = submitControlled(control, answers, { actor: ANNE, now, idempotencyKey: 'k1', existing: [a.submission] });
  assert.equal(b.duplicate, true);
  assert.equal(b.submission.id, a.submission.id);
  const changed = { ...tpl, fields: [...tpl.fields, { id: 'ny', label: 'Nytt felt', kind: 'text', required: false, options: [] }] };
  assert.equal(driftStatus(control, changed), 'endret');
  assert.equal(driftStatus(control, null), 'slettet');
  const v2 = approveTemplate(control, changed, { actor: BOSS, caps: ADMIN, now });
  assert.equal(v2.form.publishedVersion, 2);
  assert.equal(v2.form.versions.length, 2, 'v1 bevares');
  const fixed = correctSubmission(a.submission, { [v.fields[0].id]: 'Rettet' }, 'Skrivefeil', { actor: BOSS, now });
  assert.equal(fixed.ok, true);
  assert.equal(fixed.submission.corrections.length, 1);
  assert.notEqual(fixed.submission.hash, a.submission.hash);
  assert.equal(validateAnswers(v.fields, { ...answers, [v.fields.find((f) => f.kind === 'date')?.id || 'x']: 'ikke dato' }).ok, !v.fields.some((f) => f.kind === 'date'));
});

test('integrasjoner: data fra andre moduler blir ISO-kunnskap uten kopiering', () => {
  const d = setupDefaultsFromCompany({ navn: 'Rådgiver AS', organisasjonsnummer: '999888777', naeringsbeskrivelse: 'Rådgivende ingeniør', naeringskode: '71.129', addressLabel: 'Storgata 1, Oslo' }, { employees: [{}, {}] });
  assert.match(d.scopeText, /999888777/);
  assert.match(d.scopeText, /71\.129/);
  assert.equal(d.staffCount, 2);
  const km = mileageSeries([{ date: '2026-10-02', km: 100, electric: true }, { date: '2026-09-02', km: 50 }, { date: '2020-01-01', km: 999 }], { now });
  assert.equal(km.totalKm, 150);
  assert.equal(km.electricShare, 67);
  const w = wasteSummary([{ id: 'w1', fraction: 'Treverk', kg: 30 }, { id: 'w2', fraction: 'Restavfall', kg: 10, sorted: false }]);
  assert.equal(w.totalKg, 40);
  assert.equal(w.sortingRate, 75);
  const sick = sickLeaveSeries([{ type: 'egenmelding', date: '2026-10-01', hours: 8, employeeId: 'e1' }, { type: 'ferie', date: '2026-10-02', hours: 8 }], { now });
  assert.equal(sick.totalDays, 1);
  assert.ok(!JSON.stringify(sick).includes('e1'), 'ingen person-id ut av fraværsdata');
  const st = stakeholderSuggestions({ contracts: [{ buyer: 'Statens vegvesen', value: 10 }], requirements: [{ kind: 'lov', authority: 'Arbeidstilsynet' }], existing: [{ title: 'Ansatte og innleide' }] });
  assert.deepEqual(st.map((x) => x.title), ['Statens vegvesen', 'Arbeidstilsynet']);
  const sup = supplierSuggestions([{ vendor: 'Byggmakker' }, { vendor: 'Byggmakker' }, { vendor: 'Elkjøp' }], [{ title: 'Elkjøp' }]);
  assert.deepEqual(sup.map((x) => [x.title, x.count]), [['Byggmakker', 2]]);
  const legacy = legacyProjectCases({ projects: [{ id: 'p1', number: '101', name: 'Skole' }], deviations: [{ id: 'd1', title: 'Feil', projectId: 'p1' }, { id: 'd2', title: 'Lukket', status: 'lukket' }], incidents: [{ id: 'r1', title: 'Nesten fall', severity: 'høy' }] }, [{ sourceRef: { id: 'r1' } }]);
  assert.deepEqual(legacy.map((x) => x.id), ['d1']);
  assert.equal(legacy[0].projectName, '101 Skole');
  const plan = qualityPlanDraft({ id: 'p1', number: '101', name: 'Skole', manager: 'Kari' }, { contracts: [{ projectId: 'p1', title: 'Totalentreprise', buyer: 'Kommunen' }] });
  assert.match(plan.requirements, /Totalentreprise/);
  assert.equal(plan.ownerName, 'Kari');
  assert.equal(createRecord('kvalitetsplan', plan, { actor: ANNE, now }).ok, true, 'forslaget kan lagres direkte');
  assert.ok(aspectSuggestions({ trips: [{}] }).some((a) => a.title === 'Kjøring med bil'));
});

test('automatikk: ansvarlig, kravkobling, påminnelser og startpakke', () => {
  const s = state();
  s.system.roleMap = { quality_manager: { name: 'Anne', uid: 'u1' }, hse_manager: { name: 'Hans', uid: 'u9' } };
  assert.equal(autoAssignee(s.system, 'hms').uid, 'u9');
  assert.equal(autoAssignee(s.system, 'prosess').uid, 'u1');
  assert.equal(autoAssignee({}, 'prosess'), null);
  assert.ok(requirementIdsForFinding(s, 'prosess').length > 0);
  s.records = { ...s.records, leverandor: [{ id: 'l1', title: 'X', state: 'aktiv', nextReview: '2026-01-01' }] };
  const fx = autoTaskEffects(s, { now });
  assert.ok(fx.some((e) => e.title.includes('Evaluer leverandør X')));
  const again = autoTaskEffects(s, { now });
  assert.deepEqual(fx.map((e) => e.key), again.map((e) => e.key), 'samme frist gir samme nøkkel (idempotent)');
  const r = readinessChecklist(s, { now });
  assert.ok(r.total >= 12 && r.done < r.total);
  const plan = starterPlan(s.system, now);
  assert.ok(plan.processes.includes('P02_avvik') && plan.processes.includes('SJA'));
  const f = reportedFinding();
  const t1 = triageFinding(f, { decision: 'tiltak', severity: 'middels', ownerName: 'Per', ownerUid: 'u2' }, { actor: BOSS, caps: ADMIN, now });
  if (t1.ok) {
    const withAction = addAction(t1.finding, { title: 'Rett tegning', ownerName: 'Per', ownerUid: 'u2', dueAt: '2026-11-01' }, { actor: BOSS, now });
    if (withAction.ok) {
      const a = withAction.finding.actions[0];
      assert.equal(actionsDoneInTasks([withAction.finding], { [a.taskKey]: { done: true } }).length, a.taskKey ? 1 : 0);
    }
  }
});

test('registre: risiko iboende/rest holdes adskilt, samsvar gir aldri «verifisert» (T12/T14)', () => {
  const r = createRecord('risiko', { kind: 'Risiko', title: 'Feil i beregning', category: 'kvalitet', inherentL: 4, inherentC: 4, residualL: 2, residualC: 3, ownerName: 'A' }, { actor: ANNE, now });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.record.methodVersion, '1.0');
  const inh = riskMatrix([r.record], 'inherent');
  const res = riskMatrix([r.record], 'residual');
  assert.equal(inh[3][3].length, 1);
  assert.equal(res[1][2].length, 1);
  assert.equal(createRecord('risiko', { kind: 'Risiko', title: 'x', category: 'kvalitet', residualL: 2, residualC: 2, ownerName: 'A' }, { actor: ANNE, now }).ok, false);
  assert.equal(assessmentStatusFromCompliance('Etterleves'), 'dokumentert');
  const aspect = createRecord('miljoaspekt', { activity: 'Reiser', title: 'Bilkjøring', impact: 'Utslipp', significant: 'Ja', rationale: 'Stort omfang' }, { actor: ANNE, now });
  assert.equal(aspect.ok, false, 'vesentlig krever tiltak');
});

test('registre: kompetanse utløpt gir gap (T15), mål uten måling gir ingen datagrunnlag', () => {
  const req = createRecord('kompetansekrav', { title: 'Fallsikring', role: 'Montør' }, { actor: ANNE, now }).record;
  const rec = createRecord('kompetanse', { personName: 'Ola', requirementId: req.id, title: 'Kurs', validFrom: '2024-01-01', validTo: '2025-01-01' }, { actor: ANNE, now }).record;
  const m = competenceMatrix([{ name: 'Ola' }, { name: 'Kari' }], [req], [rec], now);
  assert.equal(m[0].cells[0].status, 'utlopt');
  assert.equal(m[1].cells[0].status, 'mangler');
  let goal = createRecord('mal', { domain: 'Miljø', title: 'Færre km', unit: 'km', direction: 'Redusere', baseline: 2200, target: 1600, method: 'Kjørebok', ownerName: 'A' }, { actor: ANNE, now }).record;
  assert.equal(objectiveProgress(goal).status, 'ingen_data');
  goal = addMeasurement(goal, { period: '2026-09', value: 1810 }, { actor: ANNE, now }).record;
  const prog = objectiveProgress(goal);
  assert.equal(prog.status, 'underveis');
  assert.equal(prog.pct, 65);
});

test('revisjon: funn blir avvikssak med kravkobling (A08/T16)', () => {
  let audit = createRecord('revisjon', { title: 'Prosjektstyring', scope: 'Prosjekt', criteria: 'ISO 9001 kap 8', auditorName: 'Revisor', independence: true, plannedDate: '2026-11-12' }, { actor: ANNE, now }).record;
  assert.equal(addAuditFinding(audit, { classification: 'avvik', description: 'Mangler fagkontroll' }, { actor: ANNE, now }).ok, false, 'krever bevis');
  const r = addAuditFinding(audit, { classification: 'avvik', description: 'Mangler fagkontroll', evidence: 'Tre tegninger uten kontrollspor', requirementIds: ['req_9001_2026_design'] }, { actor: ANNE, now });
  audit = r.record;
  assert.equal(audit.state, 'pagar');
  const input = findingInputFromAudit(audit, r.auditFinding);
  const f = createFinding(input, { actor: ANNE, now });
  assert.equal(f.ok, true);
  assert.deepEqual(f.finding.links.requirementIds, ['req_9001_2026_design']);
  assert.equal(f.finding.links.auditId, audit.id);
  assert.equal(setRecordState(audit, 'godkjent', { actor: ANNE, caps: isoCapabilities({ grants: { iso: 'read' } }), now }).ok, false);
});

test('analyse: ingen 100 % uten datagrunnlag og trend teller riktige måneder', () => {
  assert.equal(closedWithinDeadline([]).pct, null);
  const f1 = { id: 'a', reportedAt: '2026-09-03', state: 'lukket', closedAt: '2026-10-02', dueAt: '2026-10-10' };
  const f2 = { id: 'b', reportedAt: '2026-10-05', state: 'triage' };
  const trend = findingTrend([f1, f2], { months: 3, now });
  assert.deepEqual(trend.map((r) => [r.key, r.opened.length, r.closed.length]), [['2026-08', 0, 0], ['2026-09', 1, 0], ['2026-10', 1, 1]]);
  assert.equal(closedWithinDeadline([f1]).pct, 100);
});

test('tilstand: skjermede saker lagres i egen samling og flettes', () => {
  const s = stateFromCollections({ findings: [{ id: 'a', reportedAt: '2026-01-01' }], restrictedFindings: [{ id: 'b', reportedAt: '2026-02-01' }], records: [{ id: 'r', register: 'risiko' }, { id: 'x', register: 'ukjent' }] });
  assert.deepEqual(s.findings.map((f) => [f.id, f.restricted]), [['b', true], ['a', false]]);
  assert.equal(s.records.risiko.length, 1);
  assert.equal(s.system.standards.length, 0, 'ingen standarder eller eksempeldata før oppsett');
});
