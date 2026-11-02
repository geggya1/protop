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

/** Forslag til tiltak per område, brukt i analysen og som tekst i oppgaven. */
export const AREA_ADVICE = {
  Trivsel: 'Snakk med de ansatte om hva som gjør hverdagen bedre, og følg opp i medarbeidersamtalene.',
  Arbeidsmengde: 'Gå gjennom fordeling av oppgaver, frister og bemanning. Avklar prioriteringer når det er travelt.',
  Ledelse: 'Avtal faste en-til-en-samtaler, og sørg for at informasjon og tilbakemeldinger kommer jevnlig.',
  Samarbeid: 'Ta samarbeid opp på personalmøtet. Avklar roller og ansvar der det skurrer.',
  Utvikling: 'Lag en kompetanseplan, og ta opp utviklingsønsker i medarbeidersamtalene.',
  'Fysisk arbeidsmiljø': 'Gjør en vernerunde med verneombudet, og meld og følg opp funn som avvik.',
  HMS: 'Gå gjennom avviksrutinen og varslingsrutinen med alle, og vis at meldte avvik blir fulgt opp.',
  Trakassering: 'Gå gjennom rutinen for varsling og håndtering av trakassering med verneombudet, og gjør den kjent for alle (arbeidsmiljøloven § 4-3).',
};

/** Nivået der et område regnes som godt (0–100). */
export const SURVEY_GOOD_SCORE = 70;
export const SURVEY_WEAK_SCORE = 50;

/**
 * Fordeling i «god retning»: [svært negativt, negativt, nøytralt, positivt, svært positivt] i prosent.
 * For snudde spørsmål (trakassering) er «helt enig» svært negativt.
 */
export function likertShares(dist, reverse = false) {
  if (!dist) return null;
  const counts = reverse ? [...dist].reverse() : [...dist];
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) return null;
  const pct = counts.map((c) => (c / n) * 100);
  return {
    shares: pct.map((v) => Math.round(v * 10) / 10),
    negative: Math.round(pct[0] + pct[1]),
    neutral: Math.round(pct[2]),
    positive: Math.round(pct[3] + pct[4]),
  };
}

/**
 * Analyse av et ferdig resultat: totalindeks, styrker og forbedringsområder (spørsmål), områder
 * under SURVEY_WEAK_SCORE med forslag til tiltak, og hvor mange som har opplevd trakassering.
 * previous: resultatet fra forrige avsluttede undersøkelse, for utvikling per område og spørsmål.
 */
export function surveyAnalysis(results, previous = null) {
  if (!results?.ready) return null;
  const scored = results.questions.filter((q) => q.score != null);
  const index = scored.length ? Math.round(scored.reduce((a, q) => a + q.score, 0) / scored.length) : null;
  const prevReady = previous?.ready ? previous : null;
  const prevIndex = prevReady ? surveyAnalysis(prevReady)?.index ?? null : null;
  const prevArea = new Map((prevReady?.areas || []).map((a) => [a.area, a.score]));
  const prevQ = new Map((prevReady?.questions || []).map((q) => [q.id, q.score]));
  const delta = (now, before) => (now == null || before == null ? null : now - before);
  // Områder der alle spørsmålene er snudd (trakassering): 100 betyr at ingen har opplevd det.
  const reversedAreas = new Set(
    [...new Set(results.questions.map((q) => q.area))]
      .filter((area) => results.questions.filter((q) => q.area === area).every((q) => q.reverse)),
  );
  const areas = results.areas.map((a) => ({
    ...a,
    note: reversedAreas.has(a.area) ? '100 = ingen har opplevd det' : '',
    delta: delta(a.score, prevArea.get(a.area)),
    level: a.score >= SURVEY_GOOD_SCORE ? 'good' : a.score < SURVEY_WEAK_SCORE ? 'weak' : 'ok',
    advice: AREA_ADVICE[a.area] || '',
  }));
  const questions = scored.map((q) => ({ ...q, likert: likertShares(q.dist, q.reverse), delta: delta(q.score, prevQ.get(q.id)) }));
  // Snudde spørsmål (trakassering) har eget varsel og står ikke blant styrker og forbedringsområder.
  const byScore = questions.filter((q) => !q.reverse).sort((a, b) => b.score - a.score);
  const shares = questions.map((q) => q.likert).filter(Boolean);
  const avgOf = (key) => (shares.length ? Math.round(shares.reduce((a, l) => a + l[key], 0) / shares.length) : null);
  // Trakassering: de som er nøytrale eller enige i at de har opplevd det (3–5), snudd spørsmål.
  const harassQ = results.questions.find((q) => q.area === 'Trakassering' && q.reverse && q.dist);
  const harassed = harassQ ? harassQ.dist[2] + harassQ.dist[3] + harassQ.dist[4] : null;
  return {
    index,
    indexDelta: delta(index, prevIndex),
    positive: avgOf('positive'),
    negative: avgOf('negative'),
    areas,
    questions,
    strengths: byScore.slice(0, 3),
    improvements: byScore.slice(-3).reverse().filter((q) => q.score < SURVEY_GOOD_SCORE),
    weakAreas: areas.filter((a) => a.level === 'weak'),
    harassment: harassQ ? { count: harassed, of: harassQ.n } : null,
    hasPrevious: !!prevReady,
  };
}

/** Forrige avsluttede undersøkelse før denne (for sammenligning). */
export function previousSurvey(surveys, survey) {
  const s = normalizeSurvey(survey);
  return (surveys || [])
    .map(normalizeSurvey)
    .filter((x) => x.id !== s.id && x.status === 'closed' && String(x.closedAt) < String(s.closedAt || '9999'))
    .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)))[0] || null;
}

/** Oppgaveutkast for tiltak på et område (HR → Oppfølging → oppgave). */
export function surveyActionDraft(survey, area, { today = new Date() } = {}) {
  const s = normalizeSurvey(survey);
  const due = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const pad = (n) => String(n).padStart(2, '0');
  return {
    title: `Tiltak etter ${s.title.toLowerCase()}: ${area.area.toLowerCase()}`,
    description: [
      `Området «${area.area}» fikk ${area.score} av 100 i ${s.title}.`,
      area.advice,
      'Gå gjennom resultatet med verneombudet og de ansatte, og avtal tiltak med ansvar og frist (internkontrollforskriften § 5).',
    ].filter(Boolean).join('\n'),
    deadline: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`,
    source: 'hr-survey',
  };
}

/** Svarprosent ut fra hvor mange som kan svare (egne ansatte med brukerkonto). */
export function participation(count, invited) {
  const n = Number(invited) || 0;
  if (!n) return { count, invited: 0, pct: null };
  return { count, invited: n, pct: Math.min(100, Math.round((count / n) * 100)) };
}
