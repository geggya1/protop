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

/**
 * Flere spørsmål å velge mellom (spørsmålsbank). Faste id-er, så samme spørsmål kan
 * sammenlignes fra år til år.
 */
export const SURVEY_QUESTION_BANK = [
  { id: 'balanse', area: 'Arbeidsmengde', text: 'Jeg klarer å balansere jobb og fritid.' },
  { id: 'tidspress', area: 'Arbeidsmengde', text: 'Jeg har sjelden så mye å gjøre at det går ut over kvaliteten eller sikkerheten.' },
  { id: 'rolle', area: 'Ledelse', text: 'Jeg vet hva som forventes av meg i jobben.' },
  { id: 'anerkjennelse', area: 'Ledelse', text: 'Jeg får anerkjennelse når jeg gjør en god jobb.' },
  { id: 'rettferdig', area: 'Ledelse', text: 'Ledelsen behandler de ansatte rettferdig.' },
  { id: 'endring', area: 'Ledelse', text: 'Jeg blir tatt med på råd når det gjøres endringer som angår meg.' },
  { id: 'team', area: 'Samarbeid', text: 'Vi hjelper hverandre når det trengs.' },
  { id: 'konflikt', area: 'Samarbeid', text: 'Uenighet og konflikter blir tatt tak i og løst.' },
  { id: 'opplaering', area: 'Utvikling', text: 'Jeg har fått nok opplæring til å gjøre jobben trygt og riktig.' },
  { id: 'mestring', area: 'Utvikling', text: 'Jeg opplever mestring i jobben.' },
  { id: 'utstyr', area: 'Fysisk arbeidsmiljø', text: 'Jeg har verktøyet og verneutstyret jeg trenger.' },
  { id: 'belastning', area: 'Fysisk arbeidsmiljø', text: 'Jeg slipper unødvendige tunge løft og belastende arbeidsstillinger.' },
  { id: 'avvik', area: 'HMS', text: 'Avvik og uønskede hendelser jeg melder, blir fulgt opp.' },
  { id: 'vernerunde', area: 'HMS', text: 'Verneombudet er synlig og lett å få tak i.' },
  { id: 'helse', area: 'Helse', text: 'Jobben påvirker helsen min positivt eller nøytralt.' },
  { id: 'stress', area: 'Helse', text: 'Jeg har sjelden plager som skyldes stress på jobben.' },
  { id: 'stolt', area: 'Trivsel', text: 'Jeg er stolt av jobben vi gjør.' },
  { id: 'bli', area: 'Trivsel', text: 'Jeg ser for meg å jobbe her om to år.' },
];

/**
 * Motivasjon og mestring: ti faktorer fra forskningen på motivasjon i arbeidslivet (samme
 * faktorer som KS sitt verktøy 10-FAKTOR, men med egne utsagn, to per faktor). Måler hva som
 * driver engasjement og gode resultater, ikke risiko i arbeidsmiljøet.
 */
export const MOTIVATION_QUESTIONS = [
  { id: 'mm_indre_1', area: 'Indre motivasjon', text: 'Arbeidsoppgavene mine engasjerer meg.' },
  { id: 'mm_indre_2', area: 'Indre motivasjon', text: 'Jeg gleder meg ofte til å gå på jobb.' },
  { id: 'mm_mestringstro_1', area: 'Mestringstro', text: 'Jeg er trygg på at jeg klarer oppgavene jeg får.' },
  { id: 'mm_mestringstro_2', area: 'Mestringstro', text: 'Når noe går galt, finner jeg som regel en løsning.' },
  { id: 'mm_autonomi_1', area: 'Autonomi', text: 'Jeg kan selv bestemme hvordan jeg løser oppgavene mine.' },
  { id: 'mm_autonomi_2', area: 'Autonomi', text: 'Jeg kan planlegge arbeidsdagen min selv.' },
  { id: 'mm_kompetanse_1', area: 'Bruk av kompetanse', text: 'Jeg får brukt det jeg kan i jobben.' },
  { id: 'mm_kompetanse_2', area: 'Bruk av kompetanse', text: 'Oppgavene mine passer med utdanningen og erfaringen min.' },
  { id: 'mm_ledelse_1', area: 'Mestringsorientert ledelse', text: 'Lederen min hjelper meg å bli bedre i jobben.' },
  { id: 'mm_ledelse_2', area: 'Mestringsorientert ledelse', text: 'Lederen min gir meg nyttige tilbakemeldinger.' },
  { id: 'mm_rolle_1', area: 'Rolleklarhet', text: 'Jeg vet hva som er mitt ansvar.' },
  { id: 'mm_rolle_2', area: 'Rolleklarhet', text: 'Jeg vet hva som skal prioriteres når det er travelt.' },
  { id: 'mm_utvikling_1', area: 'Relevant kompetanseutvikling', text: 'Opplæringen jeg får, gjør meg bedre i jobben.' },
  { id: 'mm_utvikling_2', area: 'Relevant kompetanseutvikling', text: 'Jeg får lære det jeg trenger når arbeidet endrer seg.' },
  { id: 'mm_fleksibel_1', area: 'Fleksibilitetsvilje', text: 'Jeg tar gjerne andre oppgaver når det trengs.' },
  { id: 'mm_fleksibel_2', area: 'Fleksibilitetsvilje', text: 'Jeg er positiv til endringer som gjør arbeidet bedre.' },
  { id: 'mm_klima_1', area: 'Mestringsklima', text: 'Hos oss lærer vi av hverandre i stedet for å konkurrere.' },
  { id: 'mm_klima_2', area: 'Mestringsklima', text: 'Det er greit å spørre om hjelp og innrømme feil.' },
  { id: 'mm_prososial_1', area: 'Prososial motivasjon', text: 'Det er viktig for meg at jobben min gjør nytte for andre.' },
  { id: 'mm_prososial_2', area: 'Prososial motivasjon', text: 'Jeg ser at arbeidet vårt betyr noe for kundene.' },
];

/** Kort puls mellom de store undersøkelsene (fem minutter, samme id-er som standarden). */
export const PULSE_IDS = ['trivsel', 'arbeidsmengde', 'leder', 'sikkerhet', 'trakassering', 'anbefale'];

/**
 * Maler for en ny undersøkelse. Alle bruker samme skala (1–5) og samme id-er fra år til år.
 */
export const SURVEY_TEMPLATES = [
  {
    id: 'arbeidsmiljo',
    label: 'Arbeidsmiljø',
    hint: 'Trivsel, arbeidsmengde, ledelse, samarbeid, HMS og trakassering. 12 spørsmål, cirka 5 minutter. Dekker kartleggingen arbeidsmiljøloven krever.',
    questions: () => DEFAULT_SURVEY_QUESTIONS,
  },
  {
    id: 'motivasjon',
    label: 'Motivasjon og mestring (10 faktorer)',
    hint: 'De ti faktorene som driver engasjement og gode resultater: indre motivasjon, mestringstro, autonomi, ledelse, rolleklarhet og mer. 20 spørsmål, cirka 7 minutter.',
    questions: () => MOTIVATION_QUESTIONS,
  },
  {
    id: 'puls',
    label: 'Kort puls',
    hint: 'Seks spørsmål mellom de store undersøkelsene, for eksempel hvert kvartal. Samme spørsmål som i Arbeidsmiljø, så tallene kan sammenlignes.',
    questions: () => DEFAULT_SURVEY_QUESTIONS.filter((q) => PULSE_IDS.includes(q.id)),
  },
];

export function surveyTemplate(id) {
  return SURVEY_TEMPLATES.find((t) => t.id === id) || SURVEY_TEMPLATES[0];
}

/** Områdene i standardspørsmålene og spørsmålsbanken, til valg i redigeringen. */
export const SURVEY_AREAS = [...new Set([...DEFAULT_SURVEY_QUESTIONS, ...SURVEY_QUESTION_BANK, ...MOTIVATION_QUESTIONS].map((q) => q.area))];
export const SURVEY_MAX_QUESTIONS = 40;

const SURVEY_TEMPLATES_IDS = ['arbeidsmiljo', 'motivasjon', 'puls'];

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

/**
 * Ny undersøkelse. template: forrige undersøkelse. Da brukes de samme spørsmålene og
 * innledningen, så resultatene kan sammenlignes fra år til år.
 */
export function newSurvey({
  year = new Date().getFullYear(), uid = '', now = new Date(), template = null, templateId = '',
} = {}) {
  const base = template ? normalizeSurvey(template) : null;
  const tmpl = templateId ? surveyTemplate(templateId) : null;
  return normalizeSurvey({
    id: newSurveyId(now),
    title: tmpl && tmpl.id !== 'arbeidsmiljo' ? `${tmpl.id === 'puls' ? 'Pulsmåling' : 'Motivasjon og mestring'} ${year}` : `Medarbeiderundersøkelse ${year}`,
    intro: base?.intro || 'Undersøkelsen er anonym. Ingen kan se hva du har svart. Resultatene vises bare samlet, når undersøkelsen er avsluttet og minst fem har svart.',
    status: 'draft',
    year,
    questions: tmpl ? tmpl.questions() : (base?.questions?.length ? base.questions : DEFAULT_SURVEY_QUESTIONS),
    templateId: tmpl ? tmpl.id : (base?.templateId || 'arbeidsmiljo'),
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
  const unique = questions.filter((q) => (seen.has(q.id) ? false : seen.add(q.id))).slice(0, SURVEY_MAX_QUESTIONS);
  return {
    id: text(raw.id),
    title: text(raw.title).slice(0, 120) || 'Medarbeiderundersøkelse',
    intro: text(raw.intro).slice(0, 1000),
    status,
    year: Number(raw.year) || new Date().getFullYear(),
    questions: unique,
    closesOn: /^\d{4}-\d{2}-\d{2}$/.test(text(raw.closesOn).slice(0, 10)) ? text(raw.closesOn).slice(0, 10) : '',
    openedAt: text(raw.openedAt),
    notifiedAt: text(raw.notifiedAt),
    remindedAt: text(raw.remindedAt),
    reminders: Number(raw.reminders) || 0,
    templateId: SURVEY_TEMPLATES_IDS.includes(text(raw.templateId)) ? text(raw.templateId) : '',
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
  if (!(s.status === 'closed' && count >= min)) return { ready: false, count, min, questions: [], areas: [], comments: [] };
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
  // Uten ett eneste spørsmål med nok svar er det ingenting å vise (unngår «null av 100»).
  if (!questions.some((q) => q.score != null)) return { ready: false, count, min, questions: [], areas: [], comments: [] };
  return { ready: true, count, min, questions, areas, comments };
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
  'Indre motivasjon': 'Snakk med hver enkelt om hvilke oppgaver som gir energi, og fordel arbeidet så flest mulig får noe av det.',
  Mestringstro: 'Gi tydelige mål og tilbakemelding underveis, og la folk lykkes med gradvis større oppgaver.',
  Autonomi: 'La teamene bestemme mer selv om rekkefølge og arbeidsmåte, innenfor tydelige rammer.',
  'Bruk av kompetanse': 'Kartlegg hva de ansatte kan, og bruk det når oppgaver og prosjekter fordeles.',
  'Mestringsorientert ledelse': 'Gi lederne tid til jevnlige en-til-en-samtaler med fokus på læring, ikke bare resultat.',
  Rolleklarhet: 'Skriv ned ansvar og prioriteringer for hver rolle, og gå gjennom dem ved oppstart av prosjekter.',
  'Relevant kompetanseutvikling': 'Lag en kompetanseplan som henger sammen med oppgavene, og spør hva folk trenger å lære.',
  Fleksibilitetsvilje: 'Forklar hvorfor endringer gjøres, og ta de ansatte med i planleggingen.',
  Mestringsklima: 'Del erfaringer og feil åpent på møtene, og ros samarbeid mer enn enkeltprestasjoner.',
  'Prososial motivasjon': 'Vis de ansatte hva arbeidet betyr for kundene, for eksempel med tilbakemeldinger fra kundeundersøkelsen.',
  Helse: 'Kartlegg belastninger sammen med verneombudet og bedriftshelsetjenesten, og tilpass arbeidet der det trengs.',
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

/** Malen undersøkelsen bygger på. Eldre undersøkelser uten mal er Arbeidsmiljø. */
export function surveyKind(survey) {
  return normalizeSurvey(survey).templateId || 'arbeidsmiljo';
}

/** Forrige avsluttede undersøkelse av samme slag før denne (for sammenligning). */
export function previousSurvey(surveys, survey) {
  const s = normalizeSurvey(survey);
  const kind = surveyKind(s);
  return (surveys || [])
    .map(normalizeSurvey)
    .filter((x) => x.id !== s.id && x.status === 'closed' && surveyKind(x) === kind && String(x.closedAt) < String(s.closedAt || '9999'))
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

// ------------------------------------------------------------------ redigering av utkast

/** Id til et eget spørsmål: fra teksten, unik i undersøkelsen. */
export function questionIdFor(textValue, taken = []) {
  const base = text(textValue).toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .split('_').slice(0, 4).join('_')
    .slice(0, 30) || 'sporsmal';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

/** Legg til et spørsmål (fra spørsmålsbanken eller eget). Id-en beholdes når den er ledig. */
export function addSurveyQuestion(survey, question) {
  const s = normalizeSurvey(survey);
  const ids = s.questions.map((q) => q.id);
  const id = question?.id && !ids.includes(question.id) ? question.id : questionIdFor(question?.text, ids);
  return normalizeSurvey({ ...s, questions: [...s.questions, { ...question, id }] });
}

export function updateSurveyQuestion(survey, id, patch = {}) {
  const s = normalizeSurvey(survey);
  return normalizeSurvey({
    ...s,
    questions: s.questions.map((q) => (q.id === id ? { ...q, ...patch, id: q.id } : q)),
  });
}

export function removeSurveyQuestion(survey, id) {
  const s = normalizeSurvey(survey);
  return normalizeSurvey({ ...s, questions: s.questions.filter((q) => q.id !== id) });
}

/** Flytt et spørsmål opp (dir = -1) eller ned (dir = 1). */
export function moveSurveyQuestion(survey, id, dir) {
  const s = normalizeSurvey(survey);
  const list = [...s.questions];
  const i = list.findIndex((q) => q.id === id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) return s;
  [list[i], list[j]] = [list[j], list[i]];
  return normalizeSurvey({ ...s, questions: list });
}

/** Spørsmålene i banken som ikke allerede er med. */
export function availableBankQuestions(survey) {
  const ids = new Set(normalizeSurvey(survey).questions.map((q) => q.id));
  return [...DEFAULT_SURVEY_QUESTIONS, ...SURVEY_QUESTION_BANK].filter((q) => !ids.has(q.id));
}

// ------------------------------------------------------------------ frist

function dayKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Svarfrist: { date, daysLeft, passed }. date er tom når fristen ikke er satt. */
export function surveyDeadline(survey, today = new Date()) {
  const s = normalizeSurvey(survey);
  if (!s.closesOn) return { date: '', daysLeft: null, passed: false };
  const [y, m, d] = s.closesOn.split('-').map(Number);
  const due = Date.UTC(y, m - 1, d);
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysLeft = Math.round((due - t) / 86400000);
  return { date: s.closesOn, daysLeft, passed: daysLeft < 0 };
}

/** Standard svarfrist: to uker fra i dag. */
export function defaultDeadline(today = new Date()) {
  return dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14));
}

// ------------------------------------------------------------------ utvikling og eksport

/**
 * Punktene til utviklingen over tid (src/surveys/trend.js), ett per avsluttet undersøkelse
 * med resultat. resultsById: { [surveyId]: surveyResults(...) }.
 */
export function hrTrendPoints(surveys, resultsById = {}, invited = 0, kind = 'arbeidsmiljo') {
  return (surveys || [])
    .map(normalizeSurvey)
    .filter((s) => s.status === 'closed' && resultsById[s.id]?.ready && surveyKind(s) === kind)
    .map((s) => {
      const r = resultsById[s.id];
      const a = surveyAnalysis(r);
      return {
        id: s.id,
        label: s.title.replace(/^(Medarbeiderundersøkelse|Motivasjon og mestring|Pulsmåling)\s*/i, '') || String(s.year),
        date: s.closedAt || s.openedAt || s.createdAt,
        index: a?.index ?? null,
        count: r.count,
        pct: invited ? participation(r.count, invited).pct : null,
        areas: r.areas.map((x) => ({ area: x.area, score: x.score })),
      };
    });
}

/** Resultatet som CSV-rader (src/surveys/csv.js). Bare samlede tall, aldri enkeltsvar. */
export function surveyCsvRows(survey, results, analysis) {
  const s = normalizeSurvey(survey);
  const rows = [[s.title], ['Svar', results?.count ?? 0]];
  if (!results?.ready || !analysis) return rows;
  rows.push(['Totalindeks (0–100)', analysis.index], ['Positive svar (%)', analysis.positive], ['Negative svar (%)', analysis.negative]);
  if (analysis.indexDelta != null) rows.push(['Endring fra forrige', analysis.indexDelta]);
  rows.push([], ['Område', 'Score (0–100)', 'Endring fra forrige', 'Nivå']);
  const level = { good: 'Godt', ok: 'Middels', weak: 'Forbedringsområde' };
  for (const a of analysis.areas) rows.push([a.area, a.score, a.delta, level[a.level] || '']);
  rows.push([], ['Spørsmål', 'Område', 'Snitt (1–5)', 'Score (0–100)', 'Positivt (%)', 'Negativt (%)', 'Antall svar', ...SURVEY_SCALE_LABELS]);
  for (const q of analysis.questions) {
    rows.push([q.text, q.area, q.avg, q.score, q.likert?.positive ?? '', q.likert?.negative ?? '', q.n, ...(q.dist || [])]);
  }
  return rows;
}
