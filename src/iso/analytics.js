/**
 * Indikatorer og grafdata (fil 03). Alle tall regnes fra registrene, etter tilgangsfilter.
 * Hver indikator har metode og kilde-id-er slik at drilldown kan vise nøyaktig samme utvalg.
 * Ingen «ISO-score». Nevner 0 gir «ingen datagrunnlag», aldri 100 %.
 */
import { lastMonths, monthKey, todayKey, addDays } from './core.js';
import { ASSESSMENT_STATUSES, FINDING_TYPES } from './catalog.js';
import { isOpenFinding, openActions, overdueActions } from './findings.js';
import { documentsAwaitingApproval, documentsDueForReview } from './documents.js';
import { matrixRows, statusCounts } from './requirements.js';
import { competenceGaps, competenceMatrix, overdueRecords, riskMatrix } from './registers.js';
import { visibleFindings } from './access.js';

export function kpis(state, caps, { people = [], now = new Date() } = {}) {
  const findings = visibleFindings(caps, state.findings);
  const open = findings.filter(isOpenFinding);
  const overdue = overdueActions(findings, now);
  const today = todayKey(now);
  const horizon = addDays(today, 90);
  const audits = (state.records.revisjon || []).filter((a) => a.state === 'planlagt' && a.plannedDate && a.plannedDate >= today && a.plannedDate <= horizon);
  const docs = documentsAwaitingApproval(state.documents);
  const matrix = competenceMatrix(people, state.records.kompetansekrav, state.records.kompetanse, now);
  const gaps = competenceGaps(matrix);
  const legal = matrixRows(state, { kind: 'lov' }, now).filter((r) => ['ikke_vurdert', 'ma_revurderes'].includes(r.status));
  const overdueEval = overdueRecords(state.records.samsvar, 'nextReview', now);
  return [
    { key: 'openFindings', label: 'Åpne avvik', value: open.length, ids: open.map((f) => f.id), target: { page: 'avvik', filter: { open: true } }, method: 'Antall saker du har tilgang til som ikke er lukket eller kansellert.' },
    { key: 'overdueActions', label: 'Forfalte tiltak', value: overdue.length, ids: overdue.map((a) => a.id), tone: overdue.length ? 'danger' : 'ok', target: { page: 'avvik', filter: { overdue: true } }, method: 'Tiltak med frist før i dag som ikke er kontrollert eller kansellert.' },
    { key: 'upcomingAudits', label: 'Revisjoner neste 90 dager', value: audits.length, ids: audits.map((a) => a.id), target: { page: 'revisjon' }, method: 'Planlagte internrevisjoner med dato innen 90 dager.' },
    { key: 'docsApproval', label: 'Dokumenter til godkjenning', value: docs.length, ids: docs.map((d) => d.id), target: { page: 'dokumenter', filter: { awaiting: true } }, method: 'Dokumentrevisjoner sendt til gjennomgang.' },
    { key: 'competenceGaps', label: 'Kompetansegap', value: people.length && (state.records.kompetansekrav || []).length ? gaps : null, target: { page: 'kompetanse' }, method: 'Celler i kompetansematrisen som mangler, er utløpt eller utløper innen 60 dager. Krever kompetansekrav og ansatte.' },
    { key: 'legalToAssess', label: 'Lovkrav til vurdering', value: legal.length + overdueEval.length, ids: [...legal.map((r) => r.id), ...overdueEval.map((r) => r.id)], target: { page: 'lovkrav' }, method: 'Lovkrav som ikke er vurdert, må revurderes eller har forfalt samsvarsvurdering.' },
  ];
}

/** Nye og lukkede avvik per måned (G02/G08). */
export function findingTrend(findings, { months = 6, now = new Date(), type = '' } = {}) {
  const keys = lastMonths(months, now);
  const rows = keys.map((key) => ({ key, opened: [], closed: [] }));
  const index = new Map(rows.map((r) => [r.key, r]));
  for (const f of findings || []) {
    if (type && f.type !== type) continue;
    const o = index.get(monthKey(f.reportedAt || f.occurredAt));
    if (o) o.opened.push(f.id);
    if (f.state === 'lukket') {
      const c = index.get(monthKey(f.closedAt));
      if (c) c.closed.push(f.id);
    }
  }
  return rows;
}

/** «Lukket innen frist» med n/N og ekskluderte. */
export function closedWithinDeadline(findings) {
  const closed = (findings || []).filter((f) => f.state === 'lukket');
  const eligible = closed.filter((f) => f.dueAt);
  const onTime = eligible.filter((f) => String(f.closedAt || '').slice(0, 10) <= f.dueAt);
  return {
    numerator: onTime.length,
    denominator: eligible.length,
    excluded: closed.length - eligible.length,
    pct: eligible.length ? Math.round((onTime.length / eligible.length) * 100) : null,
    method: 'Lukkede saker med avtalt frist der lukkedato ≤ frist, delt på alle lukkede saker med frist.',
  };
}

export function requirementStatusDistribution(state, now = new Date()) {
  const rows = matrixRows(state, {}, now);
  const counts = statusCounts(rows);
  const relevant = rows.filter((r) => r.status !== 'ikke_relevant').length;
  return {
    total: rows.length,
    relevant,
    verified: counts.internt_verifisert || 0,
    segments: ASSESSMENT_STATUSES.map((s) => ({ id: s.id, label: s.label, tone: s.tone, value: counts[s.id] || 0 })).filter((s) => s.value > 0),
    method: 'Antall kravposter per intern vurderingsstatus. Ikke en sertifiseringsgrad.',
  };
}

/** Fasefordeling (G15). */
export function findingFunnel(findings) {
  const steps = [
    { id: 'registrert', label: 'Registrert' },
    { id: 'triage', label: 'Triage' },
    { id: 'vurdert', label: 'Vurdert' },
    { id: 'tiltak', label: 'Tiltak' },
    { id: 'effektkontroll', label: 'Effektkontroll' },
  ];
  return steps.map((s) => {
    const ids = (findings || []).filter((f) => f.state === s.id).map((f) => f.id);
    return { ...s, value: ids.length, ids };
  });
}

/** Pareto etter årsakskategori, ellers type (G06). */
export function paretoCauses(findings) {
  const counts = new Map();
  for (const f of findings || []) {
    const cats = f.rootCause?.categories?.length ? f.rootCause.categories : [FINDING_TYPES.find((t) => t.id === f.type)?.label || 'Annet'];
    for (const c of cats) {
      const row = counts.get(c) || { label: c, ids: [] };
      row.ids.push(f.id);
      counts.set(c, row);
    }
  }
  const rows = [...counts.values()].map((r) => ({ ...r, value: r.ids.length })).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  let acc = 0;
  return rows.map((r) => {
    acc += r.value;
    return { ...r, cumulative: total ? Math.round((acc / total) * 100) : 0 };
  });
}

export function riskMatrixData(state, which = 'inherent') {
  const risks = [...(state.records.risiko || []).filter((r) => r.kind !== 'Mulighet'), ...(state.records.fare || [])];
  return riskMatrix(risks, which);
}

/** Kommende aktiviteter (kalenderliste). */
export function upcomingActivities(state, caps, now = new Date(), days = 120) {
  const today = todayKey(now);
  const horizon = addDays(today, days);
  const out = [];
  const within = (d) => d && d >= today && d <= horizon;
  for (const a of state.records.revisjon || []) if (a.state === 'planlagt' && within(a.plannedDate)) out.push({ date: a.plannedDate, label: `Internrevisjon: ${a.title}`, page: 'revisjon', id: a.id });
  for (const d of state.documents || []) if (!d.archived && within(d.nextReview)) out.push({ date: d.nextReview, label: `Dokumentgjennomgang: ${d.title}`, page: 'dokumenter', id: d.id });
  for (const b of state.records.beredskap || []) if (within(b.nextExercise)) out.push({ date: b.nextExercise, label: `Beredskapsøvelse: ${b.title}`, page: 'beredskap', id: b.id });
  for (const l of state.records.ledelse || []) if (l.state === 'planlagt' && within(l.meetingDate)) out.push({ date: l.meetingDate, label: `Ledelsens gjennomgang: ${l.title}`, page: 'ledelse', id: l.id });
  for (const a of openActions(visibleFindings(caps, state.findings))) if (within(a.dueAt)) out.push({ date: a.dueAt, label: `Tiltaksfrist: ${a.title}`, page: 'avvik', id: a.findingId });
  for (const s of state.records.sertifikat || []) if (within(s.nextAudit)) out.push({ date: s.nextAudit, label: `Ekstern revisjon: ${s.title}`, page: 'sertifisering', id: s.id });
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 20);
}

/** Datapakke til ledelsens gjennomgang (P11 / A16). */
export function managementReviewSnapshot(state, caps, { people = [], now = new Date() } = {}) {
  const findings = visibleFindings(caps, state.findings);
  const req = requirementStatusDistribution(state, now);
  return {
    kpis: kpis(state, caps, { people, now }).map(({ key, label, value }) => ({ key, label, value })),
    findings: {
      open: findings.filter(isOpenFinding).length,
      closed: findings.filter((f) => f.state === 'lukket').length,
      byType: FINDING_TYPES.map((t) => ({ type: t.label, count: findings.filter((f) => f.type === t.id).length })).filter((r) => r.count),
      closedWithinDeadline: closedWithinDeadline(findings),
    },
    requirements: { total: req.total, segments: req.segments.map(({ label, value }) => ({ label, value })) },
    audits: (state.records.revisjon || []).map((a) => ({ number: a.number, title: a.title, state: a.state, findings: (a.findings || []).length, nonconformities: (a.findings || []).filter((f) => f.classification === 'avvik').length })),
    objectives: (state.records.mal || []).map((m) => ({ title: m.title, target: m.target, unit: m.unit, last: (m.measurements || []).at(-1)?.value ?? null })),
    compliance: (state.records.samsvar || []).map((s) => ({ title: s.title, result: s.result, nextReview: s.nextReview })),
    previousDecisions: (state.records.ledelse || []).flatMap((l) => (l.decisions || []).map((d) => ({ from: l.number, decision: d.decision, done: d.done, dueAt: d.dueAt }))),
    risks: (state.records.risiko || []).filter((r) => r.state === 'aktiv').length,
    suppliersDue: overdueRecords(state.records.leverandor, 'nextReview', now).length,
  };
}
