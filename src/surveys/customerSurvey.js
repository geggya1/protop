/**
 * Kundeundersøkelse (kundetilfredshet, ISO 9001 punkt 9.1.2).
 *
 * Bedriften lager undersøkelsen under Kunder → Kundeundersøkelse og sender den på e-post til
 * kundene. Kunden svarer uten innlogging på protop.no/svar/{lenke}. All lagring går gjennom
 * serveren (customerService.js), så ingen svar kan leses eller endres fra appen direkte.
 *
 * To typer:
 *  - Navngitt (standard): bedriften ser hvem som svarte, og kan følge opp misfornøyde kunder.
 *  - Anonym: svarene lagres uten kunde, og resultatet vises først når undersøkelsen er avsluttet
 *    og minst CUSTOMER_MIN_ANONYMOUS har svart.
 *
 * Spørsmålstyper: 'nps' (0–10, anbefaling), 'scale' (1–5, fornøydhet) og 'text' (fritekst).
 *
 * Samme motor brukes til evalueringer (kind):
 *  - 'customer': den årlige kundeundersøkelsen (med utvikling over tid).
 *  - 'project': prosjektevaluering, knyttet til et prosjekt (link) og gjerne en avdeling (unit).
 *  - 'bid': tilbudsevaluering, knyttet til et tilbud i Anbud.
 * Spørsmålene hentes fra en mal, som bedriften lager selv eller tar fra BUILTIN_TEMPLATES.
 *
 * Ren JS, brukes av appen, serveren og testene.
 */

export const CUSTOMER_MIN_ANONYMOUS = 3;
export const CUSTOMER_SCALE = [1, 2, 3, 4, 5];
export const CUSTOMER_SCALE_LABELS = ['Svært misfornøyd', 'Misfornøyd', 'Nøytral', 'Fornøyd', 'Svært fornøyd'];
export const NPS_SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const CUSTOMER_TEXT_MAX = 2000;
export const CUSTOMER_MAX_QUESTIONS = 30;
export const CUSTOMER_GOOD_SCORE = 70;
export const CUSTOMER_WEAK_SCORE = 50;
/** Misfornøyde kunder følges opp innen så mange dager etter svaret. */
export const FOLLOW_UP_DAYS = 14;
export const QUESTION_TYPES = [
  { id: 'scale', label: 'Fornøydhet 1–5' },
  { id: 'nps', label: 'Anbefaling 0–10' },
  { id: 'text', label: 'Fritekst' },
];

/** {firma} byttes med bedriftens navn når undersøkelsen vises. */
export const DEFAULT_CUSTOMER_QUESTIONS = [
  { id: 'nps', type: 'nps', area: 'Anbefaling', text: 'Hvor sannsynlig er det at du vil anbefale {firma} til andre?' },
  { id: 'kvalitet', type: 'scale', area: 'Kvalitet', text: 'Hvor fornøyd er du med kvaliteten på arbeidet?' },
  { id: 'fremdrift', type: 'scale', area: 'Fremdrift', text: 'Hvor fornøyd er du med fremdriften og at avtalte frister ble holdt?' },
  { id: 'kommunikasjon', type: 'scale', area: 'Kommunikasjon', text: 'Hvor fornøyd er du med informasjon og kommunikasjon underveis?' },
  { id: 'orden', type: 'scale', area: 'HMS og orden', text: 'Hvor fornøyd er du med orden, rydding og sikkerhet på arbeidsstedet?' },
  { id: 'pris', type: 'scale', area: 'Pris', text: 'Hvor fornøyd er du med prisen i forhold til det som ble levert?' },
  { id: 'oppfolging', type: 'scale', area: 'Oppfølging', text: 'Hvor fornøyd er du med håndteringen av endringer, avvik og reklamasjoner?' },
  { id: 'bedre', type: 'text', area: 'Forbedring', text: 'Hva kunne vi gjort bedre?' },
];

/** Flere spørsmål å velge mellom i redigeringen. */
export const CUSTOMER_QUESTION_BANK = [
  { id: 'kompetanse', type: 'scale', area: 'Kvalitet', text: 'Hvor fornøyd er du med fagkompetansen til dem som utførte arbeidet?' },
  { id: 'tilgjengelig', type: 'scale', area: 'Kommunikasjon', text: 'Hvor fornøyd er du med hvor lett det var å få tak i oss?' },
  { id: 'tilbud', type: 'scale', area: 'Tilbud og avtale', text: 'Hvor fornøyd er du med tilbudet og avtalen (tydelighet, hva som var med)?' },
  { id: 'dokumentasjon', type: 'scale', area: 'Dokumentasjon', text: 'Hvor fornøyd er du med sluttdokumentasjon og FDV?' },
  { id: 'miljo', type: 'scale', area: 'Miljø', text: 'Hvor fornøyd er du med hvordan vi tok hensyn til miljøet (avfall, støy, utslipp)?' },
  { id: 'faktura', type: 'scale', area: 'Pris', text: 'Hvor fornøyd er du med fakturaene (riktige, forståelige og til avtalt tid)?' },
  { id: 'igjen', type: 'scale', area: 'Lojalitet', text: 'Hvor sannsynlig er det at du bruker oss igjen? (1 = lite, 5 = svært)' },
  { id: 'best', type: 'text', area: 'Forbedring', text: 'Hva var det beste med samarbeidet?' },
];

/** Prosjektevaluering: hvordan prosjektet har fungert, sett fra kunden eller en samarbeidspartner. */
export const DEFAULT_PROJECT_QUESTIONS = [
  { id: 'nps', type: 'nps', area: 'Anbefaling', text: 'Hvor sannsynlig er det at du vil anbefale {firma} til andre?' },
  { id: 'resultat', type: 'scale', area: 'Kvalitet', text: 'Hvor fornøyd er du med sluttresultatet i prosjektet?' },
  { id: 'fremdrift', type: 'scale', area: 'Fremdrift', text: 'Hvor fornøyd er du med fremdriften og at avtalte frister ble holdt?' },
  { id: 'prosjektledelse', type: 'scale', area: 'Prosjektledelse', text: 'Hvor fornøyd er du med prosjektledelsen og planleggingen?' },
  { id: 'kommunikasjon', type: 'scale', area: 'Kommunikasjon', text: 'Hvor fornøyd er du med informasjon og kommunikasjon underveis?' },
  { id: 'samarbeid', type: 'scale', area: 'Samarbeid', text: 'Hvor fornøyd er du med samarbeidet og løsningsviljen?' },
  { id: 'endringer', type: 'scale', area: 'Økonomi og endringer', text: 'Hvor fornøyd er du med håndteringen av endringer, tillegg og økonomi?' },
  { id: 'orden', type: 'scale', area: 'HMS og orden', text: 'Hvor fornøyd er du med orden, rydding og sikkerhet i prosjektet?' },
  { id: 'overlevering', type: 'scale', area: 'Dokumentasjon', text: 'Hvor fornøyd er du med overleveringen og sluttdokumentasjonen?' },
  { id: 'bra', type: 'text', area: 'Fritekst', text: 'Hva fungerte best i prosjektet?' },
  { id: 'bedre', type: 'text', area: 'Forbedring', text: 'Hva bør vi gjøre annerledes i neste prosjekt?' },
];

/** Tilbudsevaluering: hvordan oppdragsgiver vurderte tilbudet, vunnet eller tapt. */
export const DEFAULT_BID_QUESTIONS = [
  { id: 'tilbud_tydelig', type: 'scale', area: 'Tilbud og avtale', text: 'Hvor tydelig og komplett var tilbudet fra {firma}?' },
  { id: 'tilbud_pris', type: 'scale', area: 'Pris', text: 'Hvordan vurderte dere prisen sammenlignet med de andre tilbudene?' },
  { id: 'tilbud_losning', type: 'scale', area: 'Kvalitet', text: 'Hvordan vurderte dere løsningen og kompetansen vi beskrev?' },
  { id: 'tilbud_dialog', type: 'scale', area: 'Kommunikasjon', text: 'Hvor fornøyd var dere med dialogen og svarene våre i tilbudsfasen?' },
  { id: 'tilbud_avgjorde', type: 'text', area: 'Fritekst', text: 'Hva avgjorde valget av leverandør?' },
  { id: 'tilbud_bedre', type: 'text', area: 'Forbedring', text: 'Hva kunne gjort tilbudet vårt bedre?' },
];

export const SURVEY_KINDS = [
  { id: 'customer', label: 'Kundeundersøkelse', plural: 'Kundeundersøkelser' },
  { id: 'project', label: 'Prosjektevaluering', plural: 'Prosjektevalueringer' },
  { id: 'bid', label: 'Tilbudsevaluering', plural: 'Tilbudsevalueringer' },
];

/** Hva evalueringen er knyttet til. 'company' er selskapet som helhet. */
export const LINK_TYPES = [
  { id: 'project', label: 'Prosjekt' },
  { id: 'bid', label: 'Tilbud' },
  { id: 'company', label: 'Selskapet' },
];

/** Maler som alltid finnes. Bedriftens egne kommer i tillegg (customerSurveyTemplates). */
export const BUILTIN_TEMPLATES = [
  {
    id: 'std_kunde',
    builtin: true,
    kind: 'customer',
    name: 'Kundeundersøkelse (standard)',
    intro: 'Vi vil gjerne bli bedre, og setter stor pris på at du tar to minutter til å svare. Svarene brukes bare til å forbedre arbeidet vårt.',
    questions: DEFAULT_CUSTOMER_QUESTIONS,
  },
  {
    id: 'std_prosjekt',
    builtin: true,
    kind: 'project',
    name: 'Prosjektevaluering (standard)',
    intro: 'Takk for samarbeidet. Vi evaluerer prosjektene våre for å lære og bli bedre, og setter stor pris på at du tar noen minutter til å svare.',
    questions: DEFAULT_PROJECT_QUESTIONS,
  },
  {
    id: 'std_tilbud',
    builtin: true,
    kind: 'bid',
    name: 'Tilbudsevaluering (standard)',
    intro: 'Takk for at vi fikk gi tilbud. Vi vil gjerne vite hvordan dere vurderte tilbudet vårt, så vi kan bli bedre neste gang.',
    questions: DEFAULT_BID_QUESTIONS,
  },
];

export const CUSTOMER_STATUSES = [
  { id: 'draft', label: 'Utkast' },
  { id: 'open', label: 'Sendt, åpen for svar' },
  { id: 'closed', label: 'Avsluttet' },
];

/** Forslag til tiltak per område. */
export const CUSTOMER_AREA_ADVICE = {
  Anbefaling: 'Ring kundene som ga lav score, finn årsaken og lukk saken. Del det dere lærer på neste personalmøte.',
  Kvalitet: 'Gå gjennom egenkontroll og sjekklister, og registrer feil som avvik med årsak og tiltak.',
  Fremdrift: 'Legg en realistisk fremdriftsplan, varsle kunden tidlig om forsinkelser og avtal ny dato skriftlig.',
  Kommunikasjon: 'Avtal faste oppdateringer med kunden (for eksempel ukentlig), og gi én fast kontaktperson.',
  'HMS og orden': 'Innfør rydding hver dag, og gå vernerunde på arbeidsstedet. Følg opp funn som avvik.',
  Pris: 'Vær tydelig i tilbudet om hva som er med, og avklar endringer og tillegg skriftlig før de utføres.',
  Oppfølging: 'Svar på reklamasjoner innen fast frist, og følg opp til kunden bekrefter at saken er løst.',
  'Tilbud og avtale': 'Bruk en fast tilbudsmal med forbehold og opsjoner, og gå gjennom avtalen med kunden.',
  Dokumentasjon: 'Lag sluttdokumentasjon og FDV fortløpende, og lever den sammen med overleveringen.',
  Miljø: 'Sorter avfall på arbeidsstedet, og vis kunden hvordan dere tar miljøhensyn.',
  Lojalitet: 'Hold kontakt etter overleveringen, for eksempel med en ettårsbefaring.',
  Prosjektledelse: 'Gå gjennom planen i oppstartsmøtet, og hold faste byggemøter med referat og aksjonsliste.',
  Samarbeid: 'Avklar roller og forventninger i oppstarten, og ta opp uenighet tidlig.',
  'Økonomi og endringer': 'Varsle endringer skriftlig med pris før de utføres, og hold en oppdatert endringslogg kunden kan se.',
};

function text(value) {
  return String(value ?? '').trim();
}

function normalizeQuestion(row = {}, i = 0) {
  const type = QUESTION_TYPES.some((t) => t.id === row.type) ? row.type : 'scale';
  return {
    id: text(row.id).replace(/[^a-z0-9_]/gi, '').slice(0, 40) || `q${i + 1}`,
    type,
    area: text(row.area).slice(0, 60) || (type === 'text' ? 'Fritekst' : 'Annet'),
    text: text(row.text).slice(0, 300),
    required: row.required === true,
  };
}

export function normalizeCustomerQuestions(list) {
  const rows = (Array.isArray(list) ? list : []).map(normalizeQuestion).filter((q) => q.text);
  const seen = new Set();
  // Bare ett NPS-spørsmål: det er det som gir NPS-tallet.
  let nps = false;
  return rows.filter((q) => {
    if (seen.has(q.id)) return false;
    if (q.type === 'nps') {
      if (nps) return false;
      nps = true;
    }
    seen.add(q.id);
    return true;
  }).slice(0, CUSTOMER_MAX_QUESTIONS);
}

export function surveyKind(value) {
  return SURVEY_KINDS.some((k) => k.id === value) ? value : 'customer';
}

export function kindLabel(kind, { plural = false } = {}) {
  const k = SURVEY_KINDS.find((x) => x.id === surveyKind(kind));
  return plural ? k.plural : k.label;
}

/** Kobling til prosjekt, tilbud eller selskapet: { type, id, name, number }. */
export function normalizeSurveyLink(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const type = LINK_TYPES.some((t) => t.id === src.type) ? src.type : '';
  if (!type) return { type: '', id: '', name: '', number: '' };
  return {
    type,
    id: type === 'company' ? '' : text(src.id).slice(0, 120),
    name: text(src.name).slice(0, 160),
    number: text(src.number).slice(0, 40),
  };
}

/** Nivået i organisasjonen (avdeling eller underenhet): { id, name }. */
export function normalizeSurveyUnit(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return { id: text(src.id).slice(0, 80), name: text(src.name).slice(0, 160) };
}

/** Kort tekst for koblingen, for eksempel «Prosjekt 1042 Skole Sola · Bygg». */
export function linkLabel(survey) {
  const link = normalizeSurveyLink(survey?.link);
  const unit = normalizeSurveyUnit(survey?.unit);
  const head = link.type === 'company'
    ? 'Selskapet'
    : link.type
      ? [LINK_TYPES.find((t) => t.id === link.type)?.label, link.number, link.name].filter(Boolean).join(' ')
      : '';
  return [head, unit.name].filter(Boolean).join(' · ');
}

export function newTemplateId(now = new Date()) {
  return `mal_${now.getFullYear()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Mal for undersøkelser og evalueringer. Bedriftens egne lagres i customerSurveyTemplates. */
export function normalizeSurveyTemplate(raw = {}) {
  const kind = surveyKind(raw.kind);
  return {
    id: text(raw.id).slice(0, 80),
    builtin: raw.builtin === true,
    kind,
    name: text(raw.name).slice(0, 120) || kindLabel(kind),
    intro: text(raw.intro).slice(0, 1000),
    anonymous: raw.anonymous === true,
    questions: normalizeCustomerQuestions(raw.questions),
    createdBy: text(raw.createdBy),
    updatedAt: text(raw.updatedAt),
  };
}

/** Innebygde maler først, så bedriftens egne sortert på navn. */
export function templateList(own = []) {
  const mine = (Array.isArray(own) ? own : []).map(normalizeSurveyTemplate).filter((t) => t.id && !t.builtin)
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  return [...BUILTIN_TEMPLATES.map(normalizeSurveyTemplate), ...mine];
}

export function newCustomerSurveyId(now = new Date()) {
  return `ku_${now.getFullYear()}_${Math.random().toString(36).slice(2, 8)}`;
}

function dateOnly(value) {
  const s = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

export function normalizeCustomerSurvey(raw = {}) {
  const status = CUSTOMER_STATUSES.some((s) => s.id === raw.status) ? raw.status : 'draft';
  const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  const summary = raw.summary && typeof raw.summary === 'object' ? raw.summary : null;
  const kind = surveyKind(raw.kind);
  return {
    id: text(raw.id),
    familyId: text(raw.familyId),
    kind,
    link: normalizeSurveyLink(raw.link),
    unit: normalizeSurveyUnit(raw.unit),
    templateId: text(raw.templateId).slice(0, 80),
    title: text(raw.title).slice(0, 120) || kindLabel(kind),
    intro: text(raw.intro).slice(0, 1000),
    status,
    anonymous: raw.anonymous === true,
    year: Number(raw.year) || new Date().getFullYear(),
    questions: normalizeCustomerQuestions(raw.questions),
    closesOn: dateOnly(raw.closesOn),
    companyName: text(raw.companyName).slice(0, 120),
    senderName: text(raw.senderName).slice(0, 120),
    openedAt: text(raw.openedAt),
    closedAt: text(raw.closedAt),
    createdBy: text(raw.createdBy),
    createdAt: text(raw.createdAt),
    stats: {
      recipients: Number(stats.recipients) || 0,
      sent: Number(stats.sent) || 0,
      answered: Number(stats.answered) || 0,
    },
    summary,
  };
}

export function newCustomerSurvey({ year = new Date().getFullYear(), uid = '', now = new Date(), template = null } = {}) {
  const base = template ? normalizeCustomerSurvey(template) : null;
  return normalizeCustomerSurvey({
    id: newCustomerSurveyId(now),
    title: `Kundeundersøkelse ${year}`,
    intro: base?.intro || 'Vi vil gjerne bli bedre, og setter stor pris på at du tar to minutter til å svare. Svarene brukes bare til å forbedre arbeidet vårt.',
    status: 'draft',
    anonymous: base ? base.anonymous : false,
    year,
    // Samme spørsmål som sist gir sammenlignbare tall over tid.
    questions: base?.questions?.length ? base.questions : DEFAULT_CUSTOMER_QUESTIONS,
    createdBy: uid,
    createdAt: now.toISOString(),
  });
}

/**
 * Ny evaluering fra en mal, knyttet til prosjekt, tilbud eller selskapet.
 * link: { type, id, name, number }, unit: { id, name }.
 */
export function newEvaluation({ template, link = null, unit = null, uid = '', now = new Date() } = {}) {
  const t = normalizeSurveyTemplate(template || BUILTIN_TEMPLATES[1]);
  const l = normalizeSurveyLink(link);
  // Koblingen bestemmer typen. Uten prosjekt eller tilbud gjelder malen (kundeundersøkelse blir prosjekt).
  const kind = l.type === 'bid' ? 'bid' : l.type === 'project' ? 'project' : t.kind === 'customer' ? 'project' : t.kind;
  const what = l.type === 'company' ? '' : [l.number, l.name].filter(Boolean).join(' ');
  return normalizeCustomerSurvey({
    id: newCustomerSurveyId(now),
    kind,
    link: l,
    unit,
    templateId: t.id,
    title: `${kindLabel(kind)}${what ? `: ${what}` : ''}`,
    intro: t.intro,
    status: 'draft',
    anonymous: t.anonymous,
    year: now.getFullYear(),
    questions: t.questions,
    createdBy: uid,
    createdAt: now.toISOString(),
  });
}

/** Spørsmålsteksten med bedriftens navn. */
export function questionText(q, companyName = '') {
  return text(q?.text).replace(/\{firma\}/g, text(companyName) || 'oss');
}

/** Minste antall svar før resultatet vises. */
export function customerMinAnswers(survey) {
  return normalizeCustomerSurvey(survey).anonymous ? CUSTOMER_MIN_ANONYMOUS : 1;
}

/**
 * Svaret fra kunden, renset. Gir { answers, texts } eller null når ingenting er besvart
 * eller et påkrevd spørsmål mangler.
 */
export function cleanCustomerAnswer(survey, values = {}, texts = {}) {
  const s = normalizeCustomerSurvey(survey);
  const answers = {};
  const free = {};
  for (const q of s.questions) {
    if (q.type === 'text') {
      const t = text(texts?.[q.id]).slice(0, CUSTOMER_TEXT_MAX);
      if (t) free[q.id] = t;
      else if (q.required) return null;
      continue;
    }
    const raw = values?.[q.id];
    const v = raw === '' || raw == null ? NaN : Number(raw);
    const ok = q.type === 'nps' ? NPS_SCALE.includes(v) : CUSTOMER_SCALE.includes(v);
    if (ok) answers[q.id] = v;
    else if (q.required) return null;
  }
  if (!Object.keys(answers).length && !Object.keys(free).length) return null;
  return { answers, texts: free };
}

/** NPS: andel 9–10 minus andel 0–6, fra −100 til 100. */
export function npsOf(values) {
  const vals = (values || []).map(Number).filter((v) => NPS_SCALE.includes(v));
  const n = vals.length;
  if (!n) return null;
  const promoters = vals.filter((v) => v >= 9).length;
  const detractors = vals.filter((v) => v <= 6).length;
  const passives = n - promoters - detractors;
  return {
    n,
    score: Math.round(((promoters - detractors) / n) * 100),
    promoters,
    passives,
    detractors,
    shares: {
      promoters: Math.round((promoters / n) * 100),
      passives: Math.round((passives / n) * 100),
      detractors: Math.round((detractors / n) * 100),
    },
    dist: NPS_SCALE.map((x) => vals.filter((v) => v === x).length),
  };
}

export function npsLevel(score) {
  if (score == null) return '';
  if (score >= 70) return 'Fremragende';
  if (score >= 50) return 'Svært bra';
  if (score >= 30) return 'Bra';
  if (score >= 0) return 'Greit';
  return 'Svakt';
}

/** Er svaret fra en misfornøyd kunde (NPS 0–6 eller 1–2 på et spørsmål)? */
export function isUnhappy(survey, answer) {
  const s = normalizeCustomerSurvey(survey);
  return s.questions.some((q) => {
    const v = Number(answer?.answers?.[q.id]);
    if (q.type === 'nps') return NPS_SCALE.includes(v) && v <= 6;
    if (q.type === 'scale') return CUSTOMER_SCALE.includes(v) && v <= 2;
    return false;
  });
}

/**
 * Samlet resultat. answers: [{ answers, texts, customerName?, id?, followUp? }].
 * Gir { ready, count, min, nps, index, questions, areas, texts, unhappy }.
 * score er 0–100 (1 → 0, 5 → 100). index er snittet av fornøydhet-spørsmålene.
 */
export function customerResults(survey, answers, { min, now = new Date() } = {}) {
  const s = normalizeCustomerSurvey(survey);
  const need = min ?? customerMinAnswers(s);
  const rows = (Array.isArray(answers) ? answers : []).filter((a) => a && (a.answers || a.texts));
  const count = rows.length;
  const empty = { ready: false, count, min: need, nps: null, index: null, questions: [], areas: [], texts: [], unhappy: [] };
  if (count < need) return empty;
  if (s.anonymous && s.status !== 'closed') return empty;
  const questions = s.questions.map((q) => {
    if (q.type === 'text') {
      const list = rows.map((a) => text(a.texts?.[q.id])).filter(Boolean);
      return { ...q, n: list.length };
    }
    const vals = rows.map((a) => Number(a.answers?.[q.id])).filter((v) => (q.type === 'nps' ? NPS_SCALE : CUSTOMER_SCALE).includes(v));
    const n = vals.length;
    if (!n) return { ...q, n: 0, avg: null, score: null, dist: null };
    const avg = vals.reduce((a, v) => a + v, 0) / n;
    if (q.type === 'nps') {
      return { ...q, n, avg: Math.round(avg * 10) / 10, score: null, nps: npsOf(vals), dist: NPS_SCALE.map((x) => vals.filter((v) => v === x).length) };
    }
    return {
      ...q,
      n,
      avg: Math.round(avg * 10) / 10,
      score: Math.round(((avg - 1) / 4) * 100),
      dist: CUSTOMER_SCALE.map((x) => vals.filter((v) => v === x).length),
    };
  });
  const scored = questions.filter((q) => q.type === 'scale' && q.score != null);
  const byArea = new Map();
  for (const q of scored) {
    if (!byArea.has(q.area)) byArea.set(q.area, []);
    byArea.get(q.area).push(q.score);
  }
  const areas = [...byArea].map(([area, list]) => ({
    area,
    score: Math.round(list.reduce((a, v) => a + v, 0) / list.length),
  })).sort((a, b) => a.score - b.score);
  const npsQ = questions.find((q) => q.type === 'nps' && q.nps);
  const index = scored.length ? Math.round(scored.reduce((a, q) => a + q.score, 0) / scored.length) : null;
  // Fritekst: anonyme svar sorteres alfabetisk, så rekkefølgen ikke avslører hvem som svarte først.
  const texts = questions.filter((q) => q.type === 'text').map((q) => {
    const list = rows
      .map((a) => ({ text: text(a.texts?.[q.id]), customerName: s.anonymous ? '' : text(a.customerName) }))
      .filter((x) => x.text);
    if (s.anonymous) list.sort((a, b) => a.text.localeCompare(b.text, 'nb'));
    return { id: q.id, question: q.text, answers: list };
  }).filter((t) => t.answers.length);
  const unhappy = s.anonymous ? [] : rows.filter((a) => isUnhappy(s, a)).map((a) => ({
    id: text(a.id),
    customerName: text(a.customerName),
    recipientName: text(a.recipientName),
    projectName: text(a.projectName),
    nps: npsQ ? (Number.isFinite(Number(a.answers?.[npsQ.id])) ? Number(a.answers[npsQ.id]) : null) : null,
    low: s.questions.filter((q) => q.type === 'scale' && Number(a.answers?.[q.id]) <= 2 && Number(a.answers?.[q.id]) >= 1).map((q) => q.area),
    submittedAt: text(a.submittedAt),
    followUp: a.followUp || null,
    ...followUpDue(a, now),
  }));
  return { ready: true, count, min: need, nps: npsQ ? npsQ.nps : null, index, questions, areas, texts, unhappy };
}

/**
 * Frist for oppfølging av en misfornøyd kunde: FOLLOW_UP_DAYS etter svaret.
 * Svar: { due: 'YYYY-MM-DD' | '', daysLeft, overdue }.
 */
export function followUpDue(answer, now = new Date()) {
  const at = Date.parse(text(answer?.submittedAt));
  if (!Number.isFinite(at) || answer?.followUp?.done) return { due: '', daysLeft: null, overdue: false };
  const due = new Date(at + FOLLOW_UP_DAYS * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const key = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  return { due: key, daysLeft, overdue: daysLeft < 0 };
}

/** Analyse: styrker, forbedringsområder med tiltak, og utvikling fra forrige. */
export function customerAnalysis(results, previousSummary = null) {
  if (!results?.ready) return null;
  const prevAreas = new Map((previousSummary?.areas || []).map((a) => [a.area, a.score]));
  const d = (now, before) => (now == null || before == null ? null : Math.round(now - before));
  const areas = results.areas.map((a) => ({
    ...a,
    delta: d(a.score, prevAreas.get(a.area)),
    level: a.score >= CUSTOMER_GOOD_SCORE ? 'good' : a.score < CUSTOMER_WEAK_SCORE ? 'weak' : 'ok',
    advice: CUSTOMER_AREA_ADVICE[a.area] || '',
  }));
  const scale = results.questions.filter((q) => q.type === 'scale' && q.score != null).sort((a, b) => b.score - a.score);
  const improve = areas.filter((a) => a.score < CUSTOMER_GOOD_SCORE).sort((a, b) => a.score - b.score);
  if (results.nps && results.nps.score < 0 && !improve.some((a) => a.area === 'Anbefaling')) {
    improve.unshift({ area: 'Anbefaling', score: null, delta: null, level: 'weak', advice: CUSTOMER_AREA_ADVICE.Anbefaling });
  }
  return {
    nps: results.nps,
    npsLevel: npsLevel(results.nps?.score ?? null),
    npsDelta: d(results.nps?.score ?? null, previousSummary?.nps ?? null),
    index: results.index,
    indexDelta: d(results.index, previousSummary?.index ?? null),
    areas,
    strengths: scale.slice(0, 3).filter((q) => q.score >= CUSTOMER_GOOD_SCORE),
    improve,
    unhappyOpen: results.unhappy.filter((u) => !u.followUp?.done).length,
    hasPrevious: !!previousSummary,
  };
}

/** Kort sammendrag som lagres på undersøkelsen når den avsluttes (til utvikling over tid). */
export function customerSummary(results) {
  if (!results?.ready) return { count: results?.count || 0, ready: false };
  return {
    ready: true,
    count: results.count,
    nps: results.nps ? results.nps.score : null,
    index: results.index,
    areas: results.areas.map((a) => ({ area: a.area, score: a.score })),
  };
}

/** Punktene til utviklingen over tid (src/surveys/trend.js). */
export function customerTrendPoints(surveys) {
  return (surveys || [])
    .map(normalizeCustomerSurvey)
    .filter((s) => s.kind === 'customer' && s.status === 'closed' && s.summary?.ready)
    .map((s) => ({
      id: s.id,
      label: s.title.replace(/^Kundeundersøkelse\s*/i, '') || String(s.year),
      date: s.closedAt || s.openedAt || s.createdAt,
      index: s.summary.index,
      nps: s.summary.nps,
      count: s.summary.count,
      pct: s.stats.sent ? Math.min(100, Math.round((s.summary.count / s.stats.sent) * 100)) : null,
      areas: s.summary.areas || [],
    }));
}

/** Forrige avsluttede undersøkelse med resultat, før denne. */
export function previousCustomerSurvey(surveys, survey) {
  const s = normalizeCustomerSurvey(survey);
  const at = s.closedAt || '9999';
  return (surveys || [])
    .map(normalizeCustomerSurvey)
    .filter((x) => x.id !== s.id && x.kind === s.kind && x.status === 'closed' && x.summary?.ready && String(x.closedAt) < at)
    .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)))[0] || null;
}

/** Oppgaveutkast for tiltak på et område. */
export function customerActionDraft(survey, area, { today = new Date() } = {}) {
  const s = normalizeCustomerSurvey(survey);
  const due = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const pad = (n) => String(n).padStart(2, '0');
  return {
    title: `Tiltak etter ${s.title.toLowerCase()}: ${String(area.area).toLowerCase()}`,
    description: [
      area.score != null ? `Området «${area.area}» fikk ${area.score} av 100 i ${s.title}.` : `NPS var negativ i ${s.title}.`,
      area.advice,
      'Avtal tiltak med ansvar og frist, og mål effekten i neste kundeundersøkelse (ISO 9001 punkt 9.1.2 og 10.3).',
    ].filter(Boolean).join('\n'),
    deadline: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`,
  };
}

/** Resultatet som CSV-rader (src/surveys/csv.js). */
export function customerCsvRows(survey, results) {
  const s = normalizeCustomerSurvey(survey);
  const rows = [[s.title], ['Svar', results?.count ?? 0]];
  if (!results?.ready) return rows;
  if (results.nps) rows.push(['NPS', results.nps.score], ['Anbefalere (9–10)', results.nps.promoters], ['Passive (7–8)', results.nps.passives], ['Kritikere (0–6)', results.nps.detractors]);
  if (results.index != null) rows.push(['Tilfredshetsindeks (0–100)', results.index]);
  rows.push([], ['Område', 'Score (0–100)']);
  for (const a of results.areas) rows.push([a.area, a.score]);
  rows.push([], ['Spørsmål', 'Område', 'Snitt', 'Score (0–100)', 'Antall svar', ...CUSTOMER_SCALE_LABELS]);
  for (const q of results.questions) {
    if (q.type === 'text') continue;
    if (q.type === 'nps') rows.push([q.text, q.area, q.avg, q.nps?.score ?? '', q.n]);
    else rows.push([q.text, q.area, q.avg, q.score, q.n, ...(q.dist || [])]);
  }
  for (const t of results.texts) {
    rows.push([], [t.question]);
    for (const a of t.answers) rows.push([a.text, a.customerName || '']);
  }
  return rows;
}

/**
 * Kopi til den som svarte: spørsmålene med svaret, i samme rekkefølge som skjemaet.
 * Gir [{ question, answer }]. Ubesvarte spørsmål står som «Ikke besvart».
 */
export function answerCopyRows(survey, clean) {
  const s = normalizeCustomerSurvey(survey);
  return s.questions.map((q) => {
    let answer = 'Ikke besvart';
    if (q.type === 'text') {
      const t = text(clean?.texts?.[q.id]);
      if (t) answer = t;
    } else {
      const v = Number(clean?.answers?.[q.id]);
      if (q.type === 'nps' && NPS_SCALE.includes(v)) answer = `${v} av 10`;
      if (q.type === 'scale' && CUSTOMER_SCALE.includes(v)) answer = `${v} av 5 (${CUSTOMER_SCALE_LABELS[v - 1].toLowerCase()})`;
    }
    return { question: questionText(q, s.companyName), answer };
  });
}

/** E-posten delvis skjult, til svarsiden: «p***@novaform.no». */
export function maskEmail(value) {
  const e = text(value).toLowerCase();
  const at = e.indexOf('@');
  if (at < 1) return '';
  return `${e[0]}***${e.slice(at)}`;
}

/**
 * Evalueringer (ikke den årlige kundeundersøkelsen), nyeste først.
 * filter: { kind?, linkType?, linkId?, unitId? }. Brukes i prosjektet, i oversikten og i tilbudsarbeid.
 */
export function evaluationsFor(surveys, filter = {}) {
  const at = (s) => String(s.closedAt || s.openedAt || s.createdAt);
  return (surveys || [])
    .map(normalizeCustomerSurvey)
    .filter((s) => s.kind !== 'customer')
    .filter((s) => !filter.kind || s.kind === filter.kind)
    .filter((s) => !filter.linkType || s.link.type === filter.linkType)
    .filter((s) => !filter.linkId || s.link.id === filter.linkId)
    .filter((s) => !filter.unitId || s.unit.id === filter.unitId)
    .sort((a, b) => at(b).localeCompare(at(a)));
}

/** Snitt av avsluttede evalueringer med resultat: { count, index, nps } (til referanser i tilbud). */
export function evaluationAverage(surveys) {
  const done = (surveys || []).map(normalizeCustomerSurvey).filter((s) => s.status === 'closed' && s.summary?.ready);
  const avg = (list) => (list.length ? Math.round(list.reduce((a, v) => a + v, 0) / list.length) : null);
  return {
    count: done.length,
    index: avg(done.map((s) => s.summary.index).filter((v) => v != null)),
    nps: avg(done.map((s) => s.summary.nps).filter((v) => v != null)),
  };
}

/**
 * Tekst til tilbud og kvalifikasjon: hva kundene sier om prosjektene, med tall og periode.
 * Tom tekst når ingen evaluering har resultat ennå.
 */
export function evaluationReferenceText(surveys, companyName = '') {
  const done = (surveys || []).map(normalizeCustomerSurvey).filter((s) => s.status === 'closed' && s.summary?.ready);
  const avg = evaluationAverage(done);
  if (!avg.count) return '';
  const years = done.map((s) => Number(String(s.closedAt).slice(0, 4))).filter(Boolean);
  const from = Math.min(...years);
  const to = Math.max(...years);
  const period = years.length ? (from === to ? ` i ${from}` : ` i ${from}–${to}`) : '';
  const answers = done.reduce((a, s) => a + (Number(s.summary.count) || 0), 0);
  const who = text(companyName) || 'Vi';
  const parts = [
    `${who} evaluerer prosjektene sammen med kunden etter overlevering.`,
    `${avg.count} ${avg.count === 1 ? 'evaluering' : 'evalueringer'}${period} med ${answers} svar gir`,
  ];
  const nums = [
    avg.index != null ? `en tilfredshet på ${avg.index} av 100` : '',
    avg.nps != null ? `NPS ${avg.nps}` : '',
  ].filter(Boolean).join(' og ');
  return `${parts.join(' ')} ${nums || 'resultat i ProTop'}.`;
}
