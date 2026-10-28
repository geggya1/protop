/**
 * «Sertifiseringsklar»: per standard og kapittel 4–10, med status Dekket / Delvis / Mangler (ISO-06).
 *
 * Statusen regnes fra det som faktisk ligger i ProTop (registre, prosesser, dokumenter, saker,
 * utstyr, skjema og kravvurderinger), ikke fra avkrysninger. Hvert punkt har en lenke til siden
 * der hullet fikses. Dekket betyr at det finnes registreringer revisor kan få se som bevis.
 * Det er ikke en sertifiseringsgrad, og det betyr ikke at kravet er oppfylt i virksomheten.
 */
import { addDays, isoDate, text, todayKey } from './core.js';
import { STANDARDS, standardLabel } from './catalog.js';
import { documentsDueForReview } from './documents.js';
import { isOpenFinding, overdueActions } from './findings.js';
import { matrixRows } from './requirements.js';
import { auditCoverage, competenceGaps, competenceMatrix, overdueRecords, periodSortKey } from './registers.js';
import { contractReviewStatus, performedDate } from './integrations.js';
import { templateIdFor } from './forms.js';
import { gearControls } from '../equipment/model.js';

export const CHAPTERS = [
  { id: '4', title: 'Organisasjonens kontekst' },
  { id: '5', title: 'Lederskap' },
  { id: '6', title: 'Planlegging' },
  { id: '7', title: 'Støtte' },
  { id: '8', title: 'Drift' },
  { id: '9', title: 'Evaluering av prestasjoner' },
  { id: '10', title: 'Forbedring' },
];

export const READY_STATUS = {
  dekket: { label: 'Dekket', tone: 'ok', icon: 'checkmark-circle' },
  delvis: { label: 'Delvis', tone: 'warn', icon: 'ellipse-outline' },
  mangler: { label: 'Mangler', tone: 'danger', icon: 'close-circle-outline' },
};

const live = (rows) => (rows || []).filter((r) => r && !['arkivert'].includes(r.state));
const pick = (ok, partly) => (ok ? 'dekket' : (partly ? 'delvis' : 'mangler'));
const AUDIT_LABEL = { ISO9001: 'ISO 9001', ISO14001: 'ISO 14001', ISO45001: 'ISO 45001' };

/** Kontroll og kalibrering på utstyr (Utstyr eier dataene). Forfalt = neste frist er passert. */
function equipmentControls(equipment, today) {
  const rows = (equipment || []).filter((e) => e && e.status !== 'retired' && e.scope !== 'private');
  const controls = rows.flatMap((e) => gearControls(e, today).filter((c) => c.next || c.last).map((c) => ({ equipment: e, control: c })));
  const overdue = controls.filter((x) => x.control.state === 'forfalt');
  const unchecked = rows.filter((e) => e.measuring && !gearControls(e, today).some((c) => c.next || c.last));
  return { rows, controls, overdue, unchecked };
}

/**
 * Alle punktene. clauses: klausul per standard (mangler standarden, gjelder ikke punktet der).
 * check(ctx, code) → { status, detail }. page/params eller tab sier hvor hullet fikses.
 */
const CHECKS = [
  {
    key: 'context', chapter: '4', clauses: { ISO9001: '4.1', ISO14001: '4.1', ISO45001: '4.1' }, label: 'Interne og eksterne forhold', page: 'kontekst',
    check: ({ rec }) => {
      const rows = live(rec.kontekst);
      const both = rows.some((r) => r.scope === 'Internt') && rows.some((r) => r.scope === 'Eksternt');
      return { status: pick(both, rows.length), detail: rows.length ? `${rows.length} forhold registrert${both ? '' : ', mangler interne eller eksterne'}` : 'Ingen forhold registrert' };
    },
  },
  {
    key: 'climate', chapter: '4', clauses: { ISO9001: '4.1', ISO14001: '4.1', ISO45001: '4.1' }, label: 'Klimaendringer vurdert (Amd 1:2024)', page: 'kontekst',
    check: ({ state, rec }) => {
      const c = state.system?.climate;
      if (c && (c.relevant === true || c.relevant === false) && text(c.rationale).length >= 10) {
        return { status: 'dekket', detail: `${c.relevant ? 'Relevant' : 'Ikke relevant'}, vurdert ${isoDate(c.assessedAt) || ''}`.trim() };
      }
      const some = live(rec.kontekst).some((r) => ['Ja', 'Nei'].includes(r.climate));
      return { status: some ? 'delvis' : 'mangler', detail: some ? 'Vurdert per forhold, men ikke avgjort for ledelsessystemet' : 'Ikke avgjort om klimaendringer er et relevant forhold' };
    },
  },
  {
    key: 'parties', chapter: '4', clauses: { ISO9001: '4.2', ISO14001: '4.2', ISO45001: '4.2' }, label: 'Interessenter og krav', page: 'kontekst',
    check: ({ rec }) => {
      const rows = live(rec.interessent);
      const followed = rows.filter((r) => text(r.followUp) || r.nextReview);
      return { status: pick(rows.length && followed.length === rows.length, rows.length), detail: rows.length ? `${rows.length} interessenter, ${followed.length} med oppfølging` : 'Ingen interessenter registrert' };
    },
  },
  {
    key: 'scope', chapter: '4', clauses: { ISO9001: '4.3', ISO14001: '4.3', ISO45001: '4.3' }, label: 'Omfang fastsatt', page: 'innstillinger',
    check: ({ state }) => ({ status: pick(!!(text(state.system?.scopeText) && state.system?.setupAt), text(state.system?.scopeText)), detail: text(state.system?.scopeText) ? 'Omfang er beskrevet' : 'Omfang mangler' }),
  },
  {
    key: 'processes', chapter: '4', clauses: { ISO9001: '4.4', ISO14001: '4.4', ISO45001: '4.4' }, label: 'Prosesser med eier er publisert', page: 'prosesser',
    check: ({ published }) => {
      const owned = published.filter((p) => text(p.ownerName));
      return { status: pick(owned.length >= 3, published.length), detail: `${published.length} publisert, ${owned.length} med prosesseier` };
    },
  },
  {
    key: 'leadership', chapter: '5', clauses: { ISO9001: '5.1', ISO14001: '5.1', ISO45001: '5.1' }, label: 'Ledelsen deltar (gjennomgang siste 12 mnd)', page: 'ledelse',
    check: ({ rec, year, now }) => {
      const done = live(rec.ledelse).filter((l) => ['godkjent', 'lukket'].includes(l.state) && performedDate(l, now) >= year);
      return { status: pick(done.length, live(rec.ledelse).length), detail: done.length ? `Godkjent gjennomgang ${performedDate(done[0], now)}` : 'Ingen godkjent gjennomgang siste 12 mnd' };
    },
  },
  {
    key: 'policy', chapter: '5', clauses: { ISO9001: '5.2', ISO14001: '5.2', ISO45001: '5.2' }, label: 'Policy godkjent og publisert', page: 'dokumenter',
    check: ({ state, docs }) => {
      const pub = docs.some((d) => d.docType === 'policy');
      const draft = (state.documents || []).some((d) => !d.archived && d.docType === 'policy');
      return { status: pick(pub, draft), detail: pub ? 'Publisert policy' : (draft ? 'Policy er utkast' : 'Ingen policy') };
    },
  },
  {
    key: 'roles', chapter: '5', clauses: { ISO9001: '5.3', ISO14001: '5.3', ISO45001: '5.3' }, label: 'Roller, ansvar og myndighet', page: 'organisasjon',
    check: ({ state, rec }) => {
      const map = state.system?.roleMap || {};
      const leads = ['top_management', 'quality_manager', 'hse_manager', 'system_owner'].filter((k) => map[k]?.name).length;
      const described = live(rec.rolle).length;
      return { status: pick(leads >= 2 && described, leads || described), detail: `${leads} ledende ISO-roller satt, ${described} rollebeskrivelser` };
    },
  },
  {
    key: 'participation', chapter: '5', clauses: { ISO45001: '5.4' }, label: 'Medvirkning og verneombud', page: 'hms',
    check: ({ state, rec, year }) => {
      const rep = !!state.system?.roleMap?.safety_rep?.name;
      const recent = (rec.medvirkning || []).filter((m) => String(m.createdAt || '').slice(0, 10) >= year).length;
      return { status: pick(rep && recent, rep || recent), detail: `${rep ? 'Verneombud satt' : 'Verneombud mangler'} · ${recent} medvirkningssaker siste 12 mnd` };
    },
  },
  {
    key: 'risk', chapter: '6', clauses: { ISO9001: '6.1', ISO14001: '6.1.1', ISO45001: '6.1' }, label: 'Risiko og muligheter vurdert', page: 'risiko',
    check: ({ rec, now }) => {
      const rows = (rec.risiko || []).filter((r) => !['arkivert', 'lukket'].includes(r.state));
      const scored = rows.filter((r) => r.inherentL && r.inherentC);
      const late = overdueRecords(rows, 'nextReview', now).length;
      return { status: pick(scored.length && !late, rows.length), detail: `${scored.length} vurdert${late ? `, ${late} med forfalt revurdering` : ''}` };
    },
  },
  {
    key: 'aspects', chapter: '6', clauses: { ISO14001: '6.1.2' }, label: 'Miljøaspekter med vesentlighet', page: 'miljo',
    check: ({ rec }) => {
      const rows = live(rec.miljoaspekt);
      const decided = rows.filter((r) => ['Ja', 'Nei'].includes(r.significant));
      return { status: pick(rows.length && decided.length === rows.length, rows.length), detail: `${rows.length} aspekter, ${rows.filter((r) => r.significant === 'Ja').length} vesentlige` };
    },
  },
  {
    key: 'hazards', chapter: '6', clauses: { ISO45001: '6.1.2' }, label: 'Farer kartlagt med medvirkning', page: 'hms',
    check: ({ rec }) => {
      const rows = (rec.fare || []).filter((r) => r.state !== 'lukket');
      const withPart = rows.filter((r) => text(r.participation));
      return { status: pick(rows.length && withPart.length === rows.length, rows.length), detail: `${rows.length} farer, ${withPart.length} med medvirkning` };
    },
  },
  {
    key: 'obligations', chapter: '6', clauses: { ISO14001: '6.1.3', ISO45001: '6.1.3' }, label: 'Lovkrav og forpliktelser vurdert', page: 'lovkrav',
    check: ({ state, now }) => {
      const legal = matrixRows(state, { kind: 'lov' }, now);
      const open = legal.filter((r) => ['ikke_vurdert', 'ma_revurderes'].includes(r.status)).length;
      return { status: pick(legal.length && !open, legal.length), detail: legal.length ? `${legal.length} lovkrav, ${open} ikke vurdert` : 'Ingen lovkrav registrert' };
    },
  },
  {
    key: 'objectives', chapter: '6', clauses: { ISO9001: '6.2', ISO14001: '6.2', ISO45001: '6.2' }, label: 'Mål med eier, frist og måling', page: 'mal',
    check: ({ rec }) => {
      const rows = (rec.mal || []).filter((m) => m.state !== 'arkivert');
      const measured = rows.filter((m) => (m.measurements || []).length);
      return { status: pick(rows.length && measured.length === rows.length, rows.length), detail: `${rows.length} mål, ${measured.length} med måling` };
    },
  },
  {
    key: 'change', chapter: '6', clauses: { ISO9001: '6.3', ISO45001: '8.1.3' }, label: 'Endringer planlegges med vurdering', page: 'avvik',
    check: ({ state }) => {
      const rows = (state.findings || []).filter((f) => f.type === 'endringsforslag');
      const assessed = rows.filter((f) => f.change?.risk);
      return { status: pick(assessed.length, rows.length), detail: rows.length ? `${assessed.length} av ${rows.length} endringsforslag vurdert` : 'Ingen endringer er vurdert ennå (bruk «Endringsforslag»)' };
    },
  },
  {
    key: 'equipment', chapter: '7', clauses: { ISO9001: '7.1.5', ISO45001: '9.1.1' }, label: 'Kalibrering og kontroll av utstyr', tab: 'utstyr',
    check: ({ gear }) => {
      if (!gear.controls.length) return { status: 'mangler', detail: gear.rows.length ? 'Ingen utstyr har kontroll eller kalibrering registrert' : 'Ingen utstyr registrert' };
      return {
        status: pick(!gear.overdue.length && !gear.unchecked.length, true),
        detail: `${gear.controls.length} kontroller${gear.overdue.length ? `, ${gear.overdue.length} forfalt` : ''}${gear.unchecked.length ? `, ${gear.unchecked.length} måleutstyr uten kontroll` : ''}`,
      };
    },
  },
  {
    key: 'competence', chapter: '7', clauses: { ISO9001: '7.2', ISO14001: '7.2', ISO45001: '7.2' }, label: 'Kompetansekrav og bevis', page: 'kompetanse',
    check: ({ rec, people, now }) => {
      const reqs = live(rec.kompetansekrav);
      if (!reqs.length) return { status: 'mangler', detail: 'Ingen kompetansekrav' };
      const gaps = competenceGaps(competenceMatrix(people, rec.kompetansekrav, rec.kompetanse, now, { roles: rec.rolle }));
      return { status: pick(!gaps && people.length, true), detail: `${reqs.length} krav, ${gaps} hull i matrisen` };
    },
  },
  {
    key: 'awareness', chapter: '7', clauses: { ISO9001: '7.3', ISO14001: '7.3', ISO45001: '7.3' }, label: 'Policy lest og bekreftet', page: 'dokumenter',
    check: ({ docs, people }) => {
      const policy = docs.find((d) => d.docType === 'policy');
      if (!policy) return { status: 'mangler', detail: 'Ingen publisert policy å bekrefte' };
      const staff = people.filter((p) => p.uid && p.own !== false).length;
      const read = new Set((policy.readAcks || []).filter((a) => a.revision === policy.publishedRevision).map((a) => a.uid)).size;
      return { status: pick(staff && read >= Math.ceil(staff * 0.8), read), detail: `${read} av ${staff} har bekreftet policyen` };
    },
  },
  {
    key: 'communication', chapter: '7', clauses: { ISO9001: '7.4', ISO14001: '7.4', ISO45001: '7.4' }, label: 'Kommunikasjonsplan', page: 'kommunikasjon',
    check: ({ rec }) => ({ status: pick(live(rec.kommunikasjon).length >= 2, live(rec.kommunikasjon).length), detail: `${live(rec.kommunikasjon).length} punkter i planen` }),
  },
  {
    key: 'documented', chapter: '7', clauses: { ISO9001: '7.5', ISO14001: '7.5', ISO45001: '7.5' }, label: 'Styrte dokumenter er gjennomgått', page: 'dokumenter',
    check: ({ state, docs, now }) => {
      const late = documentsDueForReview(state.documents, now).length;
      return { status: pick(docs.length && !late, docs.length), detail: `${docs.length} publisert${late ? `, ${late} med forfalt gjennomgang` : ''}` };
    },
  },
  {
    key: 'operation', chapter: '8', clauses: { ISO9001: '8.1', ISO14001: '8.1', ISO45001: '8.1' }, label: 'Kvalitetsplan på aktive prosjekter', page: 'prosjekt',
    check: ({ rec, projects }) => {
      const active = (projects || []).filter((p) => p && !['arkivert', 'avsluttet'].includes(p.status));
      if (!active.length) return { status: 'delvis', detail: 'Ingen aktive prosjekter å vurdere' };
      const has = new Set(live(rec.kvalitetsplan).map((r) => r.projectId));
      const covered = active.filter((p) => has.has(p.id)).length;
      return { status: pick(covered === active.length, covered), detail: `${covered} av ${active.length} prosjekter har kvalitetsplan` };
    },
  },
  {
    key: 'contracts', chapter: '8', clauses: { ISO9001: '8.2' }, label: 'Kontraktsgjennomgang', page: 'prosjekt',
    check: ({ state, contracts }) => {
      const res = contractReviewStatus(contracts, state.submissions);
      if (!res.rows.length) return { status: 'delvis', detail: 'Ingen aktive kontrakter i Kontrakt' };
      return { status: pick(!res.missing.length, res.rows.length > res.missing.length), detail: `${res.rows.length - res.missing.length} av ${res.rows.length} gjennomgått` };
    },
  },
  {
    key: 'emergency', chapter: '8', clauses: { ISO14001: '8.2', ISO45001: '8.2' }, label: 'Beredskap øvd siste 12 mnd', page: 'beredskap',
    check: ({ rec, year }) => {
      const rows = live(rec.beredskap);
      const drilled = rows.filter((r) => (r.exercises || []).some((x) => String(x.date || '') >= year));
      return { status: pick(rows.length && drilled.length === rows.length, rows.length), detail: rows.length ? `${drilled.length} av ${rows.length} scenarier øvd` : 'Ingen beredskapsscenarier' };
    },
  },
  {
    key: 'suppliers', chapter: '8', clauses: { ISO9001: '8.4', ISO14001: '8.1', ISO45001: '8.1.4' }, label: 'Leverandører evaluert', page: 'leverandorer',
    check: ({ rec, now }) => {
      const rows = live(rec.leverandor);
      const evaluated = rows.filter((r) => (r.evaluations || []).length || r.approval === 'Godkjent');
      const late = overdueRecords(rows, 'nextReview', now).length;
      return { status: pick(rows.length && evaluated.length === rows.length && !late, rows.length), detail: rows.length ? `${evaluated.length} av ${rows.length} evaluert${late ? `, ${late} forfalt` : ''}` : 'Ingen leverandører registrert' };
    },
  },
  {
    key: 'monitoring', chapter: '9', clauses: { ISO9001: '9.1', ISO14001: '9.1', ISO45001: '9.1' }, label: 'Målinger siste kvartal', page: 'mal',
    check: ({ rec, now }) => {
      const from = addDays(todayKey(now), -100).slice(0, 7);
      const rows = (rec.mal || []).filter((m) => m.state !== 'arkivert');
      const recent = rows.filter((m) => (m.measurements || []).some((x) => periodSortKey(x.period) >= from));
      return { status: pick(rows.length && recent.length === rows.length, recent.length), detail: `${recent.length} av ${rows.length} mål målt siste kvartal` };
    },
  },
  {
    key: 'satisfaction', chapter: '9', clauses: { ISO9001: '9.1.2' }, label: 'Kundetilfredshet målt (SF28)', page: 'prosjekt',
    check: ({ state, year }) => {
      const id = templateIdFor('SF28_TILFREDSHET');
      const rows = (state.submissions || []).filter((s) => (s.templateKey === 'SF28_TILFREDSHET' || s.templateId === id) && String(s.submittedAt || '').slice(0, 10) >= year);
      return { status: pick(rows.length >= 3, rows.length), detail: `${rows.length} svar siste 12 mnd` };
    },
  },
  {
    key: 'evaluation', chapter: '9', clauses: { ISO14001: '9.1.2', ISO45001: '9.1.2' }, label: 'Evaluering av samsvar', page: 'lovkrav',
    check: ({ rec, now }) => {
      const rows = rec.samsvar || [];
      const late = overdueRecords(rows, 'nextReview', now).length;
      return { status: pick(rows.length && !late, rows.length), detail: rows.length ? `${rows.length} vurderinger${late ? `, ${late} forfalt` : ''}` : 'Ingen samsvarsvurderinger' };
    },
  },
  {
    key: 'audit', chapter: '9', clauses: { ISO9001: '9.2', ISO14001: '9.2', ISO45001: '9.2' }, label: 'Internrevisjon siste 12 mnd', page: 'revisjon',
    check: ({ rec, year, now }, code) => {
      const rows = (rec.revisjon || []).filter((a) => !(a.standards || []).length || (a.standards || []).includes(AUDIT_LABEL[code]));
      const done = rows.filter((a) => ['godkjent', 'oppfolging', 'lukket'].includes(a.state) && performedDate(a, now) >= year);
      const planned = rows.filter((a) => ['planlagt', 'pagar', 'rapport'].includes(a.state));
      return { status: pick(done.length, planned.length), detail: done.length ? `Godkjent rapport ${performedDate(done[0], now)}` : (planned.length ? 'Planlagt, ikke gjennomført' : 'Ingen revisjon av denne standarden') };
    },
  },
  {
    key: 'auditProgram', chapter: '9', clauses: { ISO9001: '9.2.2', ISO14001: '9.2.2', ISO45001: '9.2.2' }, label: 'Revisjonsprogrammet dekker prosessene (3 år)', page: 'revisjon',
    check: ({ rec, state, now }) => {
      const cov = auditCoverage(rec.revisjon, state.processes, { now });
      if (!cov.rows.length) return { status: 'mangler', detail: 'Ingen publiserte prosesser å revidere' };
      const covered = cov.rows.length - cov.uncovered.length;
      return { status: pick(!cov.uncovered.length, covered), detail: `${covered} av ${cov.rows.length} prosesser revidert ${cov.years[0]}–${cov.years.at(-1)}` };
    },
  },
  {
    key: 'review', chapter: '9', clauses: { ISO9001: '9.3', ISO14001: '9.3', ISO45001: '9.3' }, label: 'Ledelsens gjennomgang med konklusjon', page: 'ledelse',
    check: ({ rec, year, now }) => {
      const rows = live(rec.ledelse);
      const done = rows.filter((l) => ['godkjent', 'lukket'].includes(l.state) && performedDate(l, now) >= year);
      const full = done.filter((l) => text(l.assessment).length >= 10 && l.snapshot);
      return { status: pick(full.length, rows.length), detail: full.length ? 'Godkjent med grunnlag og konklusjon' : (done.length ? 'Godkjent, men mangler grunnlag eller konklusjon' : 'Ingen godkjent gjennomgang siste 12 mnd') };
    },
  },
  {
    key: 'nonconformity', chapter: '10', clauses: { ISO9001: '10.2', ISO14001: '10.2', ISO45001: '10.2' }, label: 'Avvik behandlet innen frist', page: 'avvik', params: { overdue: true },
    check: ({ state, now }) => {
      const rows = state.findings || [];
      const late = overdueActions(rows, now).length;
      const closed = rows.filter((f) => f.state === 'lukket').length;
      return { status: pick(rows.length && closed && !late, rows.length), detail: `${rows.filter(isOpenFinding).length} åpne, ${closed} lukket${late ? `, ${late} tiltak forfalt` : ''}` };
    },
  },
  {
    key: 'improvement', chapter: '10', clauses: { ISO9001: '10.3', ISO14001: '10.3', ISO45001: '10.3' }, label: 'Forbedring og læring', page: 'avvik',
    check: ({ state }) => {
      const ideas = (state.findings || []).filter((f) => f.type === 'forbedring').length;
      const learned = (state.findings || []).filter((f) => f.state === 'lukket' && text(f.learning)).length;
      return { status: pick(ideas && learned, ideas || learned), detail: `${ideas} forbedringsforslag, ${learned} lukkede saker med læring` };
    },
  },
];

function chapterOf(clause) {
  return String(clause || '').split('.')[0];
}

/** Kravvurderingene i kapitlet (kravmatrisen): hvor mange er internt verifisert eller har bevis. */
function assessmentItem(state, code, chapter, now) {
  const rows = matrixRows(state, { standard: code }, now).filter((r) => r.kind === 'iso' && chapterOf(r.clause) === chapter && r.status !== 'ikke_relevant');
  if (!rows.length) return null;
  const verified = rows.filter((r) => r.status === 'internt_verifisert').length;
  const started = rows.filter((r) => ['internt_verifisert', 'dokumentert', 'under_arbeid'].includes(r.status)).length;
  return {
    key: `assess_${chapter}`,
    clause: `kap. ${chapter}`,
    label: 'Kravene i kapitlet er vurdert mot bevis',
    status: pick(verified === rows.length, started),
    detail: `${verified} av ${rows.length} internt verifisert`,
    page: 'krav',
    params: { standard: code },
  };
}

function rollUp(items) {
  if (!items.length) return 'mangler';
  if (items.every((i) => i.status === 'dekket')) return 'dekket';
  return items.some((i) => i.status !== 'mangler') ? 'delvis' : 'mangler';
}

/**
 * Sertifiseringsklar-visningen for valgte standarder.
 * ctx: { people, projects, contracts, equipment } fra resten av ProTop.
 * Svar: { standards: [{ code, label, status, counts, chapters: [{ id, title, status, items }] }], method }
 */
export function certificationReadiness(state, { now = new Date(), people = [], projects = [], contracts = [], equipment = [] } = {}) {
  const today = todayKey(now);
  const base = {
    state,
    rec: state?.records || {},
    now,
    year: addDays(today, -365),
    people: people || [],
    projects: projects || [],
    contracts: contracts || [],
    gear: equipmentControls(equipment, today),
    published: (state?.processes || []).filter((p) => p.publishedVersion && !p.archived),
    docs: (state?.documents || []).filter((d) => d.publishedRevision && !d.archived),
  };
  const codes = (state?.system?.standards || []).filter((c) => STANDARDS.some((s) => s.code === c));
  const standards = codes.map((code) => {
    const std = STANDARDS.find((s) => s.code === code);
    const chapters = CHAPTERS.map((ch) => {
      const items = CHECKS.filter((c) => c.clauses[code] && c.chapter === ch.id).map((c) => {
        const res = c.check(base, code);
        return { key: c.key, clause: c.clauses[code], label: c.label, status: res.status, detail: res.detail, page: c.page || '', tab: c.tab || '', params: c.params || null };
      });
      const assess = assessmentItem(state, code, ch.id, now);
      if (assess) items.push(assess);
      return { ...ch, status: rollUp(items), items };
    });
    const all = chapters.flatMap((c) => c.items);
    const counts = { dekket: 0, delvis: 0, mangler: 0 };
    for (const i of all) counts[i.status] += 1;
    return { code, label: standardLabel(code, state?.system?.editions), short: std?.short || code, status: rollUp(all), counts, chapters };
  });
  return {
    standards,
    method: 'Regnet fra registreringene i ProTop per kapittel 4–10. Dekket = det finnes bevis revisor kan få se; Delvis = noe finnes, men ikke alt; Mangler = ingenting registrert. Ikke en sertifiseringsgrad.',
  };
}
