/**
 * Grunnlaget til ledelsens gjennomgang (ISO 9001/14001/45001 9.3.2) for perioden gjennomgangen gjelder.
 *
 * Hvert punkt i 9.3.2 a–f, og tilleggene i 14001 (samsvar, miljøaspekter) og 45001 (medvirkning,
 * hendelsestrender), er en egen seksjon med klausul og linjer. Referatet viser dermed at alt er
 * gjennomgått. Arkiverte poster og poster utenfor perioden er ikke med.
 * Skjermede HMS-saker telles bare når den som henter grunnlaget, har særskilt tilgang. Ellers merkes
 * grunnlaget, og godkjenning krever en bekreftelse (reviewApprovalBlockers i registers.js).
 */
import { addDays, monthKey, todayKey } from './core.js';
import { FINDING_TYPES } from './catalog.js';
import { isOpenFinding, overdueActions } from './findings.js';
import { competenceGaps, competenceMatrix, objectiveProgress, overdueRecords, sortedMeasurements } from './registers.js';

export { REVIEW_INPUTS, missingReviewInputs } from './registers.js';
import { visibleFindings } from './access.js';

/**
 * Perioden: «2026» = kalenderåret, «2026-H1»/«2026-H2» = halvår, ellers de siste 12 månedene
 * fram til møtedatoen (eller i dag).
 */
export function reviewPeriod(record, now = new Date()) {
  const p = String(record?.period || '').trim();
  let m = /^(\d{4})$/.exec(p);
  if (m) return { from: `${m[1]}-01-01`, to: `${m[1]}-12-31`, label: m[1] };
  m = /^(\d{4})-H([12])$/i.exec(p);
  if (m) return m[2] === '1' ? { from: `${m[1]}-01-01`, to: `${m[1]}-06-30`, label: p } : { from: `${m[1]}-07-01`, to: `${m[1]}-12-31`, label: p };
  const to = String(record?.meetingDate || '').slice(0, 10) || todayKey(now);
  return { from: addDays(to, -365), to, label: p || 'siste 12 måneder' };
}

function inPeriod(value, period) {
  const d = String(value || '').slice(0, 10);
  return !!d && d >= period.from && d <= period.to;
}

const avg = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);

/**
 * Seksjonene i grunnlaget. helpers: { kpis, closedWithinDeadline, requirementStatusDistribution } fra analytics.js
 * (sendes inn for å unngå sirkulær import). extra: { people, now, record, equipment, safety }.
 */
export function reviewSections(state, caps, helpers, { people = [], now = new Date(), record = null, equipment = [], safety = null } = {}) {
  const period = reviewPeriod(record, now);
  const all = visibleFindings(caps, state.findings);
  const findings = all.filter((f) => inPeriod(f.reportedAt || f.occurredAt, period) || isOpenFinding(f));
  const rec = state.records || {};
  const std = new Set(state.system?.standards || []);
  const today = todayKey(now);
  const audits = (rec.revisjon || []).filter((a) => a.state !== 'avlyst' && (inPeriod(a.plannedDate, period) || inPeriod(a.updatedAt, period)));
  const objectives = (rec.mal || []).filter((m) => m.state !== 'arkivert');
  const compliance = (rec.samsvar || []).filter((s) => inPeriod(s.updatedAt || s.createdAt, period) || (s.nextReview && s.nextReview >= period.from));
  const previous = (rec.ledelse || []).filter((l) => l.id !== record?.id)
    .flatMap((l) => (l.decisions || []).map((d) => ({ from: l.number, decision: d.decision, kind: d.kind || '', done: !!d.done, dueAt: d.dueAt })));
  const changedContext = [...(rec.kontekst || []), ...(rec.interessent || [])]
    .filter((r) => r.state !== 'arkivert' && (inPeriod(r.createdAt, period) || inPeriod(r.updatedAt, period)));
  const climate = state.system?.climate || null;
  const sat = (state.submissions || []).filter((x) => String(x.templateKey || '').startsWith('SF28') && inPeriod(x.submittedAt, period));
  const ratings = sat.map((x) => Number(Object.values(x.answers || {}).find((v) => /^[1-5]$/.test(String(v))))).filter((n) => n >= 1 && n <= 5);
  const instances = (state.instances || []).filter((i) => inPeriod(i.startedAt, period));
  const published = (state.processes || []).filter((p) => p.publishedVersion && !p.archived);
  const late = overdueActions(all, now);
  const onTime = helpers.closedWithinDeadline(findings);
  const suppliers = (rec.leverandor || []).filter((r) => r.state !== 'arkivert');
  const evaluations = suppliers.flatMap((r) => (r.evaluations || []).filter((e) => inPeriod(e.date, period)).map((e) => Number(e.total)).filter(Number.isFinite));
  const supplierCases = findings.filter((f) => f.links?.supplierId);
  const gaps = competenceGaps(competenceMatrix(people, rec.kompetansekrav, rec.kompetanse, now, { roles: rec.rolle }));
  const gear = (equipment || []).filter((e) => e && e.status !== 'retired' && e.scope !== 'private');
  const lateControls = gear.filter((e) => (e.controls || []).some((c) => c?.next && c.next < today));
  const risks = (rec.risiko || []).filter((r) => r.state === 'aktiv' && r.kind !== 'Mulighet');
  const reduced = risks.filter((r) => r.residualL && r.residualC && (r.residualL * r.residualC) < (r.inherentL * r.inherentC));
  const opportunities = (rec.risiko || []).filter((r) => r.state !== 'arkivert' && r.kind === 'Mulighet');
  const participation = (rec.medvirkning || []).filter((m) => inPeriod(m.createdAt, period));
  const incidents = findings.filter((f) => ['hms', 'nestenulykke'].includes(f.type) && inPeriod(f.reportedAt || f.occurredAt, period));
  const byMonth = new Map();
  for (const f of incidents) {
    const k = monthKey(f.reportedAt || f.occurredAt);
    byMonth.set(k, (byMonth.get(k) || 0) + 1);
  }
  const aspects = (rec.miljoaspekt || []).filter((r) => r.state !== 'arkivert' && r.significant === 'Ja');
  const improvements = findings.filter((f) => f.type === 'forbedring');
  const auditImprovements = audits.flatMap((a) => (a.findings || []).filter((x) => x.classification === 'forbedring'));
  const restrictedIncluded = !!caps?.restrictedView;
  const req = helpers.requirementStatusDistribution(state, now);

  const sections = [
    { key: 'previous', clause: '9.3.2 a', label: 'Status for tiltak fra tidligere gjennomganger', lines: [
      `${previous.filter((x) => !x.done).length} åpne av ${previous.length} vedtak`,
      ...previous.filter((x) => !x.done).slice(0, 6).map((x) => `Åpent: ${x.decision} (${x.from}, frist ${x.dueAt || '–'})`),
    ] },
    { key: 'context', clause: '9.3.2 b', label: 'Endringer i interne og eksterne forhold, interessenter og klima', lines: [
      `${changedContext.length} forhold og interessenter nye eller endret i perioden`,
      ...changedContext.slice(0, 6).map((r) => `${r.register === 'interessent' ? 'Interessent' : 'Forhold'}: ${r.title}`),
      climate && (climate.relevant === true || climate.relevant === false)
        ? `Klimaendringer: ${climate.relevant ? 'relevant' : 'ikke relevant'} (${climate.rationale || 'uten begrunnelse'})`
        : 'Klimaendringer: ikke avgjort for ledelsessystemet',
    ] },
    { key: 'satisfaction', clause: '9.3.2 c 1', label: 'Kundetilfredshet og tilbakemeldinger fra interessenter', lines: [
      `${sat.length} svar på kundetilfredshet (SF28)${ratings.length ? `, snitt ${avg(ratings)} av 5` : ''}`,
      `${findings.filter((f) => f.type === 'kundeklage').length} kundeklager, ${findings.filter((f) => f.type === 'positiv').length} positive tilbakemeldinger`,
    ] },
    { key: 'objectives', clause: '9.3.2 c 2', label: 'Måloppnåelse', lines: objectives.length
      ? objectives.map((m) => { const p = objectiveProgress(m); return `${m.title}: ${p.label}${p.value != null ? ` (${p.value} ${m.unit || ''} mot ${m.target})` : ''}`; })
      : ['Ingen mål registrert'] },
    { key: 'process', clause: '9.3.2 c 3', label: 'Prosessytelse og samsvar for produkter og tjenester', lines: [
      `${published.length} publiserte prosesser, ${instances.length} gjennomføringer startet i perioden (${instances.filter((i) => i.state === 'fullfort').length} fullført)`,
      `${findings.filter((f) => ['prosess', 'leveranse'].includes(f.type)).length} prosess- og leveranseavvik`,
    ] },
    { key: 'nonconformity', clause: '9.3.2 c 4', label: 'Avvik og korrigerende tiltak', lines: [
      `${findings.filter(isOpenFinding).length} åpne, ${findings.filter((f) => f.state === 'lukket').length} lukket, ${late.length} tiltak forfalt`,
      `Lukket innen frist: ${onTime.pct == null ? 'ingen datagrunnlag' : `${onTime.pct} % (${onTime.numerator}/${onTime.denominator})`} · effekt verifisert i ${findings.filter((f) => f.effect?.outcome === 'verifisert').length} saker`,
      ...FINDING_TYPES.map((t) => ({ t, n: findings.filter((f) => f.type === t.id).length })).filter((x) => x.n).map((x) => `${x.t.label}: ${x.n}`),
    ] },
    { key: 'monitoring', clause: '9.3.2 c 5', label: 'Resultater fra overvåking og måling', lines: [
      ...helpers.kpis(state, caps, { people, now }).map((k) => `${k.label}: ${k.value ?? '–'}`),
      `Krav: ${req.segments.map((x) => `${x.label} ${x.value}`).join(', ') || '–'}`,
      ...(safety?.h1 != null ? [`H-verdi (skader med fravær per million timer): ${safety.h1} · ${safety.hours} timer`] : []),
    ] },
    { key: 'audits', clause: '9.3.2 c 6', label: 'Resultater fra revisjoner', lines: audits.length
      ? audits.map((a) => `${a.number} ${a.title}: ${(a.findings || []).filter((x) => x.classification === 'avvik').length} avvik, ${(a.findings || []).length} funn${a.conclusion ? ` · ${a.conclusion}` : ''}`)
      : ['Ingen internrevisjoner i perioden'] },
    { key: 'suppliers', clause: '9.3.2 c 7', label: 'Eksterne leverandørers prestasjoner', lines: [
      `${suppliers.length} leverandører, ${evaluations.length} evalueringer i perioden${evaluations.length ? ` (snitt ${avg(evaluations)})` : ''}`,
      `${overdueRecords(suppliers, 'nextReview', now).length} med forfalt evaluering, ${supplierCases.length} avvik koblet til leverandør`,
    ] },
    { key: 'resources', clause: '9.3.2 d', label: 'Om ressursene er tilstrekkelige', lines: [
      `${people.length} ansatte, ${gaps} hull i kompetansematrisen`,
      `${gear.length} utstyr, ${gear.filter((e) => e.status === 'service').length} på service, ${lateControls.length} med forfalt kontroll eller kalibrering`,
    ] },
    { key: 'risks', clause: '9.3.2 e', label: 'Effekt av tiltak mot risiko og muligheter', lines: [
      `${risks.length} aktive risikoer, ${reduced.length} med lavere restrisiko etter tiltak`,
      `${overdueRecords(risks, 'nextReview', now).length} forfalte revurderinger, ${opportunities.length} muligheter`,
    ] },
    { key: 'improvement', clause: '9.3.2 f', label: 'Muligheter for forbedring', lines: [
      `${improvements.length} forbedringsforslag, ${auditImprovements.length} forbedringsmuligheter fra revisjon`,
      ...improvements.slice(0, 5).map((f) => `Forslag: ${f.title}`),
    ] },
  ];
  if (std.has('ISO14001')) {
    sections.push({ key: 'environment', clause: '14001 9.3 c', label: 'Samsvarsforpliktelser og vesentlige miljøaspekter', lines: [
      `${compliance.length} samsvarsvurderinger: ${compliance.filter((c) => c.result === 'Etterleves').length} etterleves, ${compliance.filter((c) => c.result && c.result !== 'Etterleves').length} ikke helt`,
      `${aspects.length} vesentlige miljøaspekter, ${findings.filter((f) => f.type === 'miljo').length} miljøhendelser`,
    ] });
  }
  if (std.has('ISO45001')) {
    sections.push({ key: 'participation', clause: '45001 9.3 d', label: 'Konsultasjon og medvirkning', lines: [
      `${participation.length} medvirkningssaker i perioden`,
      state.system?.roleMap?.safety_rep?.name ? `Verneombud: ${state.system.roleMap.safety_rep.name}` : 'Verneombud er ikke satt',
    ] });
    sections.push({ key: 'incidents', clause: '45001 9.3 c', label: 'Hendelsestrender', lines: [
      `${incidents.length} personskader og nestenulykker i perioden${restrictedIncluded ? '' : ' (uten skjermede saker)'}`,
      ...[...byMonth.entries()].sort().map(([k, n]) => `${k}: ${n}`),
    ] });
  }
  return {
    period,
    sections,
    restrictedIncluded,
    restrictedNote: restrictedIncluded ? '' : 'Skjermede HMS-saker er ikke med: grunnlaget er hentet uten særskilt tilgang. Be en med særskilt tilgang hente grunnlaget, eller bekreft at det ikke finnes skjermede saker i perioden.',
    findings,
    audits,
    objectives: objectives.map((m) => ({ title: m.title, target: m.target, unit: m.unit, last: sortedMeasurements(m).at(-1)?.value ?? null })),
    compliance: compliance.map((x) => ({ title: x.title, result: x.result, nextReview: x.nextReview })),
    previous,
    risks: risks.length,
  };
}
