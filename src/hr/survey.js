/**
 * Anonym medarbeiderundersøkelse (arbeidsmiljøkartlegging).
 *
 * HR lager undersøkelsen (families/{id}/hrSurveys/{surveyId}). Den ansatte svarer på Min side.
 * Svaret lagres uten navn og bruker-id (hrSurveyAnswers), og en kvittering med bruker-id
 * (hrSurveyReceipts/{surveyId}_{uid}) hindrer at samme person svarer to ganger. Reglene krever
 * at svar og kvittering skrives sammen.
 *
 * Resultatene vises først når undersøkelsen er avsluttet og minst SURVEY_MIN_ANSWERS har svart.
 * En avsluttet undersøkelse kan ikke åpnes igjen. Da kan ingen se hvordan tallene endret seg da
 * én bestemt person svarte.
 */

export const SURVEY_MIN_ANSWERS = 5;
export const SURVEY_SCALE = [1, 2, 3, 4, 5];
export const SURVEY_SCALE_LABELS = ['Helt uenig', 'Litt uenig', 'Nøytral', 'Litt enig', 'Helt enig'];
export const SURVEY_COMMENT_MAX = 1500;

/** Standardspørsmål. Utsagn der 5 = helt enig. reverse = høy verdi er dårlig (mobbing o.l.). */
export const DEFAULT_SURVEY_QUESTIONS = [
  { id: 'trivsel', area: 'Trivsel', text: 'Jeg trives på jobben.' },
  { id: 'arbeidsmengde', area: 'Arbeidsmengde', text: 'Arbeidsmengden min er håndterbar.' },
  { id: 'kontroll', area: 'Arbeidsmengde', text: 'Jeg har nok innflytelse over hvordan jeg gjør jobben.' },
  { id: 'leder', area: 'Ledelse', text: 'Jeg får nødvendig støtte og tilbakemelding fra nærmeste leder.' },
  { id: 'informasjon', area: 'Ledelse', text: 'Jeg får informasjonen jeg trenger for å gjøre jobben.' },
  { id: 'kolleger', area: 'Samarbeid', text: 'Samarbeidet med kollegene mine fungerer godt.' },
  { id: 'kompetanse', area: 'Utvikling', text: 'Jeg får brukt og utviklet kompetansen min.' },
  { id: 'fysisk', area: 'Fysisk arbeidsmiljø', text: 'Det fysiske arbeidsmiljøet (lys, støy, utstyr, ergonomi) er godt.' },
  { id: 'sikkerhet', area: 'HMS', text: 'Jeg føler meg trygg på jobben, og vet hvordan jeg melder avvik.' },
  { id: 'si_fra', area: 'HMS', text: 'Jeg kan si fra om kritikkverdige forhold uten å være redd for reaksjoner.' },
  { id: 'trakassering', area: 'Trakassering', text: 'Jeg har opplevd mobbing, trakassering eller uønsket seksuell oppmerksomhet det siste året.', reverse: true },
  { id: 'anbefale', area: 'Trivsel', text: 'Jeg vil anbefale arbeidsplassen til andre.' },
];

export const SURVEY_STATUSES = [
  { id: 'draft', label: 'Utkast' },
  { id: 'open', label: 'Åpen for svar' },
  { id: 'closed', label: 'Avsluttet' },
];

function text(value) {
  return String(value ?? '').trim();
}

function normalizeQuestion(row = {}, i = 0) {
  return {
    id: text(row.id).replace(/[^a-z0-9_]/gi, '').slice(0, 40) || `q${i + 1}`,
    area: text(row.area).slice(0, 60),
    text: text(row.text).slice(0, 300),
    reverse: row.reverse === true,
  };
}

export function newSurveyId(now = new Date()) {
  return `mu_${now.getFullYear()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newSurvey({ year = new Date().getFullYear(), uid = '', now = new Date() } = {}) {
  return normalizeSurvey({
    id: newSurveyId(now),
    title: `Medarbeiderundersøkelse ${year}`,
    intro: 'Undersøkelsen er anonym. Ingen kan se hva du har svart. Resultatene vises bare samlet, når undersøkelsen er avsluttet og minst fem har svart.',
    status: 'draft',
    year,
    questions: DEFAULT_SURVEY_QUESTIONS,
    createdBy: uid,
    createdAt: now.toISOString(),
  });
}

export function normalizeSurvey(raw = {}) {
  const status = SURVEY_STATUSES.some((s) => s.id === raw.status) ? raw.status : 'draft';
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map(normalizeQuestion)
    .filter((q) => q.text);
  const seen = new Set();
  const unique = questions.filter((q) => (seen.has(q.id) ? false : seen.add(q.id)));
  return {
    id: text(raw.id),
    title: text(raw.title).slice(0, 120) || 'Medarbeiderundersøkelse',
    intro: text(raw.intro).slice(0, 1000),
    status,
    year: Number(raw.year) || new Date().getFullYear(),
    questions: unique,
    closesOn: text(raw.closesOn).slice(0, 10),
    openedAt: text(raw.openedAt),
    closedAt: text(raw.closedAt),
    createdBy: text(raw.createdBy),
    createdAt: text(raw.createdAt),
  };
}

/** Kan HR endre spørsmålene? Bare før undersøkelsen er åpnet. */
export function surveyEditable(survey) {
  return normalizeSurvey(survey).status === 'draft';
}

/** Neste status. Avsluttet er endelig. */
export function surveyTransition(survey, to, { now = new Date() } = {}) {
  const s = normalizeSurvey(survey);
  if (s.status === 'closed') return s;
  if (to === 'open' && s.status === 'draft') return { ...s, status: 'open', openedAt: now.toISOString() };
  if (to === 'closed' && s.status === 'open') return { ...s, status: 'closed', closedAt: now.toISOString() };
  return s;
}

/**
 * Svaret som lagres: bare verdiene og kommentaren. Ingen bruker-id, navn eller tidspunkt.
 * Gir null når noe er ugyldig. Ubesvarte spørsmål er lov (hoppes over).
 */
export function surveyAnswerDoc(survey, values, comment = '') {
  const s = normalizeSurvey(survey);
  if (!s.id || s.status !== 'open') return null;
  const answers = {};
  for (const q of s.questions) {
    const v = Number(values?.[q.id]);
    if (SURVEY_SCALE.includes(v)) answers[q.id] = v;
  }
  if (!Object.keys(answers).length) return null;
  return {
    surveyId: s.id,
    answers,
    comment: text(comment).slice(0, SURVEY_COMMENT_MAX),
  };
}

export function receiptId(surveyId, uid) {
  return `${text(surveyId)}_${text(uid)}`;
}

/**
 * Samlede resultater. Gir { ready, count, questions: [{ id, text, area, n, avg, score, dist }], areas, comments }.
 * score er 0–100 der høyt er bra (snudd for reverse-spørsmål). Ikke ready → ingen tall, bare antall.
 */
export function surveyResults(survey, answers, { min = SURVEY_MIN_ANSWERS } = {}) {
  const s = normalizeSurvey(survey);
  const rows = (Array.isArray(answers) ? answers : []).filter((a) => a && text(a.surveyId) === s.id);
  const count = rows.length;
  const ready = s.status === 'closed' && count >= min;
  if (!ready) return { ready, count, min, questions: [], areas: [], comments: [] };
  const questions = s.questions.map((q) => {
    const vals = rows.map((a) => Number(a.answers?.[q.id])).filter((v) => SURVEY_SCALE.includes(v));
    const n = vals.length;
    const dist = SURVEY_SCALE.map((v) => vals.filter((x) => x === v).length);
    // Spørsmål med færre enn min svar vises uten tall.
    if (n < min) return { ...q, n, avg: null, score: null, dist: null };
    const avg = vals.reduce((sum, v) => sum + v, 0) / n;
    const good = q.reverse ? 6 - avg : avg;
    return { ...q, n, avg: Math.round(avg * 10) / 10, score: Math.round(((good - 1) / 4) * 100), dist };
  });
  const byArea = new Map();
  for (const q of questions) {
    if (q.score == null) continue;
    const key = q.area || 'Annet';
    if (!byArea.has(key)) byArea.set(key, []);
    byArea.get(key).push(q.score);
  }
  const areas = [...byArea].map(([area, scores]) => ({
    area,
    score: Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length),
  })).sort((a, b) => a.score - b.score);
  // Kommentarene sorteres alfabetisk, så rekkefølgen ikke viser hvem som svarte først.
  const comments = rows.map((a) => text(a.comment)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'nb'));
  return { ready, count, min, questions, areas, comments };
}

/** Svarprosent ut fra hvor mange som kan svare (egne ansatte med brukerkonto). */
export function participation(count, invited) {
  const n = Number(invited) || 0;
  if (!n) return { count, invited: 0, pct: null };
  return { count, invited: n, pct: Math.min(100, Math.round((count / n) * 100)) };
}
