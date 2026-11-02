/**
 * Tiltaksplan etter medarbeiderundersøkelsen, i de fem trinnene KS anbefaler:
 *   1. Ledelsen går gjennom resultatet sammen med verneombud og tillitsvalgte.
 *   2. Resultatet gjennomgås med de ansatte.
 *   3. Dere blir enige om få, viktige tiltak.
 *   4. Tiltakene får ansvar og frist (en plan).
 *   5. Tiltakene gjennomføres og evalueres, senest ved neste undersøkelse.
 *
 * Lagres i HR-tilstanden (hr.surveyPlans), som bare HR leser og skriver. Planen inneholder ingen
 * enkeltsvar, bare områder, tiltak og datoer. Ren JS, testes i node.
 */

export const PLAN_STEPS = [
  { id: 'ledelse', label: 'Ledelsen har gått gjennom resultatet', short: 'Ledelsen', hint: 'Sammen med verneombud og tillitsvalgte. Se etter de to–tre områdene som betyr mest.' },
  { id: 'ansatte', label: 'Resultatet er gjennomgått med de ansatte', short: 'De ansatte', hint: 'På personalmøte eller i teamene. Spør hva som ligger bak tallene.' },
  { id: 'tiltak', label: 'Tiltakene er valgt', short: 'Tiltak', hint: 'Velg få tiltak som betyr mest, gjerne ett til tre.' },
  { id: 'plan', label: 'Tiltakene har ansvar og frist', short: 'Plan', hint: 'Hvert tiltak har en ansvarlig og en frist.' },
  { id: 'evaluert', label: 'Tiltakene er gjennomført og evaluert', short: 'Evaluert', hint: 'Virket det? Se endringen i neste undersøkelse.' },
];

export const ACTION_STATUSES = [
  { id: 'planned', label: 'Planlagt' },
  { id: 'doing', label: 'I gang' },
  { id: 'done', label: 'Gjennomført' },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function dateOnly(value) {
  const s = text(value, 10);
  return DATE.test(s) ? s : '';
}

function newId() {
  return `tp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeAction(row = {}) {
  if (!row || typeof row !== 'object') return null;
  const status = ACTION_STATUSES.some((s) => s.id === row.status) ? row.status : 'planned';
  const out = {
    id: text(row.id, 60) || newId(),
    area: text(row.area, 80),
    text: text(row.text, 500),
    owner: text(row.owner, 120),
    due: dateOnly(row.due),
    status,
    taskId: text(row.taskId, 120),
    result: text(row.result, 500),
  };
  return out.text || out.area ? out : null;
}

export function normalizeSurveyPlan(raw = {}) {
  if (!raw || typeof raw !== 'object' || !text(raw.surveyId, 120)) return null;
  const steps = {};
  for (const step of PLAN_STEPS) {
    const d = dateOnly(raw.steps?.[step.id]);
    if (d) steps[step.id] = d;
  }
  return {
    surveyId: text(raw.surveyId, 120),
    steps,
    actions: (Array.isArray(raw.actions) ? raw.actions : []).map(normalizeAction).filter(Boolean).slice(0, 30),
    note: text(raw.note, 2000),
    updatedAt: text(raw.updatedAt, 40),
  };
}

export function emptyPlan(surveyId) {
  return normalizeSurveyPlan({ surveyId, steps: {}, actions: [] });
}

export function planFor(plans, surveyId) {
  const found = (Array.isArray(plans) ? plans : []).find((p) => p?.surveyId === surveyId);
  return normalizeSurveyPlan(found) || emptyPlan(surveyId);
}

/** Erstatt eller legg til planen i listen. */
export function upsertPlan(plans, plan, now = new Date()) {
  const next = normalizeSurveyPlan({ ...plan, updatedAt: now.toISOString() });
  if (!next) return Array.isArray(plans) ? plans : [];
  const rest = (Array.isArray(plans) ? plans : []).filter((p) => p?.surveyId !== next.surveyId);
  return [next, ...rest];
}

function todayKey(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Kryss av eller fjern et trinn. */
export function toggleStep(plan, stepId, now = new Date()) {
  const p = normalizeSurveyPlan(plan);
  const steps = { ...p.steps };
  if (steps[stepId]) delete steps[stepId];
  else steps[stepId] = todayKey(now);
  return { ...p, steps };
}

export function addAction(plan, action) {
  const p = normalizeSurveyPlan(plan);
  const row = normalizeAction({ ...action, id: action?.id || newId() });
  return row ? { ...p, actions: [...p.actions, row] } : p;
}

export function updateAction(plan, id, patch = {}) {
  const p = normalizeSurveyPlan(plan);
  return { ...p, actions: p.actions.map((a) => (a.id === id ? normalizeAction({ ...a, ...patch, id: a.id }) || a : a)) };
}

export function removeAction(plan, id) {
  const p = normalizeSurveyPlan(plan);
  return { ...p, actions: p.actions.filter((a) => a.id !== id) };
}

/**
 * Status per trinn. Trinn 3–5 regnes også som gjort ut fra tiltakene: valgt når det finnes
 * tiltak, plan når alle har ansvarlig og frist, evaluert når alle er gjennomført og har resultat.
 * Svar: { steps: [{ ...step, done, date, auto }], done, total, current, overdue }.
 */
export function planProgress(plan, now = new Date()) {
  const p = normalizeSurveyPlan(plan) || emptyPlan('x');
  const acts = p.actions;
  const auto = {
    tiltak: acts.length > 0,
    plan: acts.length > 0 && acts.every((a) => a.owner && a.due),
    evaluert: acts.length > 0 && acts.every((a) => a.status === 'done' && a.result),
  };
  const steps = PLAN_STEPS.map((s) => {
    const date = p.steps[s.id] || '';
    return { ...s, date, auto: !date && !!auto[s.id], done: !!date || !!auto[s.id] };
  });
  const done = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done)?.id || '';
  const today = todayKey(now);
  const overdue = acts.filter((a) => a.status !== 'done' && a.due && a.due < today).length;
  const finished = acts.filter((a) => a.status === 'done').length;
  return { steps, done, total: steps.length, current, overdue, actions: acts.length, finished };
}

/** Forslag til tiltak fra analysen: de svake områdene med tekst fra AREA_ADVICE. */
export function suggestedActions(analysis, plan) {
  const taken = new Set(normalizeSurveyPlan(plan)?.actions.map((a) => a.area) || []);
  return (analysis?.areas || [])
    .filter((a) => a.level !== 'good' && !taken.has(a.area))
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((a) => ({ area: a.area, text: a.advice || '', score: a.score }));
}

/**
 * Virket tiltakene? For hvert tiltak i planen til forrige undersøkelse: områdets score før og
 * nå. currentAreas: [{ area, score }] fra undersøkelsen som følger.
 */
export function actionEffects(previousPlan, previousAreas = [], currentAreas = []) {
  const plan = normalizeSurveyPlan(previousPlan);
  if (!plan || !plan.actions.length) return [];
  const before = new Map(previousAreas.map((a) => [a.area, a.score]));
  const after = new Map(currentAreas.map((a) => [a.area, a.score]));
  return plan.actions.map((a) => {
    const b = before.get(a.area);
    const n = after.get(a.area);
    const delta = b == null || n == null ? null : Math.round(n - b);
    return {
      ...a,
      before: b ?? null,
      after: n ?? null,
      delta,
      verdict: delta == null ? 'ukjent' : delta >= 5 ? 'bedre' : delta <= -5 ? 'verre' : 'uendret',
    };
  });
}
