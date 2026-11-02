/**
 * Medarbeidersamtalen har én visning: KS-skjemaet «Medarbeidersamtale» (C1-F-03-001), fylt ut i
 * FormFill. Den åpnes både fra HR → Rutiner → Skjemaer og fra HR → Oppfølging → Samtaler og saker
 * (og personens Oppfølging-fane), og lagres som utfylt dokument (filledDocs, scope 'hr').
 *
 * Hvert utfylt samtaleskjema speiles i hr.reviews (en kort rad med dato, leder og handlingsplan),
 * så Oversikt, årshjulet og den ansattes Min side ser samtalen uansett hvor den ble ført.
 * Eldre samtaler (registrert med feltene under Oppfølging før dette) står som før.
 */
import { tableRows } from '../anbud/formBuilder.js';

export const REVIEW_FORM_KEY = 'medarbeidersamtale';

function text(value) {
  return String(value ?? '').trim();
}

function norm(value) {
  return text(value).toLocaleLowerCase('nb-NO');
}

/** Feltet med navnet (og typen, når samme navn også er en overskrift, som «Handlingsplan»). */
function fieldByLabel(doc, label, kind = '') {
  const want = norm(label);
  return (doc?.fields || []).find((f) => norm(f.label) === want && (!kind || f.kind === kind) && f.kind !== 'title') || null;
}

export function isReviewDoc(doc) {
  return !!doc && doc.scope === 'hr' && doc.libraryKey === REVIEW_FORM_KEY;
}

/** Tiltakene i handlingsplanen: [{ tiltak, ansvar, frist }] (bare rader med tiltak). */
export function reviewActionPlan(doc) {
  const field = fieldByLabel(doc, 'Handlingsplan', 'table');
  if (!field) return [];
  const col = (name) => (field.columns || []).find((c) => norm(c.label) === name)?.id || '';
  const tiltak = col('tiltak');
  const ansvar = col('ansvar');
  const frist = col('frist');
  return tableRows(field)
    .filter((row) => !row.group)
    .map((row) => {
      const cells = { ...(row.preset || {}), ...(row.cells || {}) };
      return { tiltak: text(cells[tiltak]), ansvar: text(cells[ansvar]), frist: text(cells[frist]).slice(0, 10) };
    })
    .filter((row) => row.tiltak);
}

/** Datoen for samtalen: feltet i skjemaet, ellers når det ble ferdig eller sist endret. */
export function reviewDate(doc) {
  const own = text(fieldByLabel(doc, 'Dato for samtalen')?.value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(own)) return own;
  return text(doc?.completedAt || doc?.updatedAt || doc?.createdAt).slice(0, 10);
}

function planText(plan) {
  return plan.map((row) => [
    row.tiltak,
    row.ansvar ? `ansvar: ${row.ansvar}` : '',
    row.frist ? `frist: ${row.frist}` : '',
  ].filter(Boolean).join(' · ')).join('\n');
}

export function reviewRowId(docId) {
  return `hrr_form_${text(docId)}`;
}

/** Raden i hr.reviews for et utfylt samtaleskjema. null når skjemaet ikke gjelder en ansatt. */
export function reviewFromFilledDoc(doc) {
  if (!isReviewDoc(doc) || !text(doc.subject?.id)) return null;
  const plan = reviewActionPlan(doc);
  return {
    id: reviewRowId(doc.id),
    employeeId: text(doc.subject.id),
    date: reviewDate(doc),
    status: doc.status === 'ferdig' ? 'done' : 'planned',
    interviewer: text(fieldByLabel(doc, 'Leder')?.value),
    summary: plan.length ? `Handlingsplan: ${plan.length} tiltak` : 'Medarbeidersamtale',
    followUps: planText(plan),
    formDocId: text(doc.id),
    employeeVisible: true,
  };
}

/**
 * hr.reviews oppdatert med raden for dokumentet (ny, endret eller fjernet når dokumentet er slettet).
 * normalizeOne: normalizeReview fra model.js.
 */
export function syncReviewRows(reviews, doc, normalizeOne, { removed = false } = {}) {
  const list = Array.isArray(reviews) ? reviews : [];
  const id = reviewRowId(doc?.id);
  const rest = list.filter((row) => row.id !== id);
  if (removed) return rest;
  const row = reviewFromFilledDoc(doc);
  if (!row) return rest;
  const before = list.find((r) => r.id === id);
  return [normalizeOne({ ...before, ...row, createdAt: before?.createdAt }), ...rest];
}

/**
 * Samtalene til én ansatt, nyeste først: utfylte samtaleskjema og eldre samtaler (uten skjema).
 * [{ kind: 'form', doc, date, status } | { kind: 'legacy', review, date, status }]
 */
export function reviewEntries(reviews, docs, employeeId) {
  const emp = text(employeeId);
  const forms = (docs || []).filter((d) => isReviewDoc(d) && text(d.subject?.id) === emp)
    .map((doc) => ({ kind: 'form', id: doc.id, doc, date: reviewDate(doc), status: doc.status === 'ferdig' ? 'done' : 'planned' }));
  const legacy = (reviews || []).filter((r) => text(r.employeeId) === emp && !text(r.formDocId))
    .map((review) => ({ kind: 'legacy', id: review.id, review, date: text(review.date), status: review.status }));
  return [...forms, ...legacy].sort((a, b) => b.date.localeCompare(a.date));
}

/** Handlingsplanen fra forrige ferdige samtale før denne (tema 1 i neste samtale). */
export function previousActionPlan(entries, currentId) {
  const idx = entries.findIndex((e) => e.id === currentId);
  const older = (idx >= 0 ? entries.slice(idx + 1) : entries).find((e) => e.kind === 'form' && e.doc.status === 'ferdig');
  return older ? { date: older.date, plan: reviewActionPlan(older.doc) } : null;
}

/**
 * Når en samtale med handlingsplan er ferdig, blir handlingsplanen én sak til oppfølging (som før).
 * Bare én sak per samtale (sourceReviewId). normalizeOne: normalizeCase fra model.js.
 */
export function casesFromReviewDoc(cases, doc, normalizeOne, { formatDate = (d) => d } = {}) {
  const list = Array.isArray(cases) ? cases : [];
  if (!isReviewDoc(doc) || doc.status !== 'ferdig' || !text(doc.subject?.id)) return list;
  const plan = reviewActionPlan(doc);
  const source = reviewRowId(doc.id);
  if (!plan.length || list.some((c) => c.sourceReviewId === source)) return list;
  return [normalizeOne({
    employeeId: text(doc.subject.id),
    title: `Oppfølging fra samtale ${formatDate(reviewDate(doc))}`,
    description: planText(plan),
    priority: 'normal',
    sourceReviewId: source,
    status: 'open',
  }), ...list];
}
