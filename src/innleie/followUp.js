/**
 * Oppfølging av innleide og eksterne: trivsel underveis, evaluering av oppdraget og
 * avslutning når de går. Ikke HR: medarbeidersamtaler og sykefravær er arbeidsgiverens
 * (bemanningsforetaket eller leverandøren). Dette er det dere som oppdragsgiver vil vite.
 *
 * Lagres i HR-dokumentet som hr.hiredFollowUps, så det følger samme tilgang, lagring og
 * sletting (retention, per employeeId) som resten av personens mappe.
 * Ren modul – testes uten Firebase.
 */

function text(value) {
  return String(value ?? '').trim();
}

function dayKey(value) {
  const m = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${dayKey(fromIso)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(toIso)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

export const FOLLOWUP_KINDS = [
  {
    id: 'trivsel',
    label: 'Trivsel',
    icon: 'happy-outline',
    hint: 'En kort prat underveis: hvordan har personen det på prosjektet, og er det noe dere bør rette på?',
  },
  {
    id: 'evaluering',
    label: 'Evaluering',
    icon: 'ribbon-outline',
    hint: 'Hvordan oppdraget gikk: kvalitet, samarbeid, HMS og oppmøte. Brukes når dere skal leie inn igjen.',
  },
  {
    id: 'avslutning',
    label: 'Avslutning',
    icon: 'log-out-outline',
    hint: 'Det som skal være gjort når personen går: tilganger, utstyr, adgangskort og timer.',
  },
];

/** Trivsel: én skala, 1 til 5. */
export const TRIVSEL_SCALE = [
  { value: 1, label: 'Dårlig' },
  { value: 2, label: 'Under middels' },
  { value: 3, label: 'Greit' },
  { value: 4, label: 'Bra' },
  { value: 5, label: 'Svært bra' },
];

/** Evaluering: fire punkter, 1 til 5. Snittet er evalueringens poeng. */
export const EVALUATION_CRITERIA = [
  { id: 'kvalitet', label: 'Kvalitet på arbeidet' },
  { id: 'samarbeid', label: 'Samarbeid og kommunikasjon' },
  { id: 'hms', label: 'HMS og sikkerhet' },
  { id: 'oppmote', label: 'Oppmøte og punktlighet' },
];

/** Avslutning: sjekkliste når oppdraget slutter. */
export const EXIT_CHECKS = [
  { id: 'tilganger', label: 'Tilganger i ProTop og andre systemer er fjernet' },
  { id: 'utstyr', label: 'Nøkler, verktøy og utstyr er levert tilbake' },
  { id: 'adgang', label: 'Adgangskort og byggeplasslister er oppdatert' },
  { id: 'timer', label: 'Alle timer er ført og godkjent' },
  { id: 'evaluering', label: 'Oppdraget er evaluert' },
];

const KIND_IDS = FOLLOWUP_KINDS.map((row) => row.id);

function score(value) {
  const n = Math.round(Number(value));
  return n >= 1 && n <= 5 ? n : 0;
}

export function normalizeHiredFollowUp(raw = {}) {
  const kind = KIND_IDS.includes(raw?.kind) ? raw.kind : 'trivsel';
  const ratings = {};
  for (const row of EVALUATION_CRITERIA) {
    const value = score(raw?.ratings?.[row.id]);
    if (value) ratings[row.id] = value;
  }
  const checks = {};
  for (const row of EXIT_CHECKS) {
    if (raw?.checks?.[row.id] === true) checks[row.id] = true;
  }
  return {
    id: text(raw?.id) || `hfu_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    employeeId: text(raw?.employeeId),
    kind,
    date: dayKey(raw?.date),
    score: kind === 'trivsel' ? score(raw?.score) : 0,
    ratings: kind === 'evaluering' ? ratings : {},
    rehire: kind === 'evaluering' && ['yes', 'no', 'maybe'].includes(raw?.rehire) ? raw.rehire : '',
    checks: kind === 'avslutning' ? checks : {},
    note: text(raw?.note).slice(0, 2000),
    byName: text(raw?.byName),
    createdAt: text(raw?.createdAt),
    updatedAt: text(raw?.updatedAt),
  };
}

/** Snittet av evalueringens punkter, med én desimal. 0 når ingen er satt. */
export function evaluationScore(row) {
  const values = Object.values(row?.ratings || {}).map(Number).filter((n) => n >= 1);
  if (!values.length) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export function exitProgress(row) {
  const done = EXIT_CHECKS.filter((check) => row?.checks?.[check.id]).length;
  return { done, total: EXIT_CHECKS.length, complete: done === EXIT_CHECKS.length };
}

/** Hvor ofte trivsel bør tas: hver 30. dag for aktive. */
export const TRIVSEL_INTERVAL_DAYS = 30;

function newest(rows) {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0] || null;
}

/**
 * Status per person. people er innleide og eksterne (hiredPeople), active er om de er aktive.
 * due: 'trivsel' når det er mer enn 30 dager siden sist (eller aldri), 'avslutning' når
 * oppdraget er slutt (deaktivert eller sluttdato passert) og sjekklisten ikke er ferdig.
 */
export function followUpStatus(people, followUps, { today = '' } = {}) {
  const now = dayKey(today) || new Date().toISOString().slice(0, 10);
  const byEmployee = new Map();
  for (const raw of followUps || []) {
    const row = normalizeHiredFollowUp(raw);
    if (!row.employeeId) continue;
    const list = byEmployee.get(row.employeeId) || [];
    list.push(row);
    byEmployee.set(row.employeeId, list);
  }
  return (people || []).map(({ employee, active }) => {
    const rows = byEmployee.get(employee.id) || [];
    const trivsel = newest(rows.filter((row) => row.kind === 'trivsel' && row.score));
    const evaluation = newest(rows.filter((row) => row.kind === 'evaluering'));
    const exit = newest(rows.filter((row) => row.kind === 'avslutning'));
    const end = dayKey(employee?.company?.periodTo);
    const ended = !active || (end && end < now);
    const since = trivsel ? daysBetween(trivsel.date, now) : null;
    let due = '';
    if (ended) {
      if (!exit || !exitProgress(exit).complete) due = 'avslutning';
    } else if (since == null || since > TRIVSEL_INTERVAL_DAYS) {
      due = 'trivsel';
    }
    const history = rows
      .filter((row) => row.kind === 'trivsel' && row.score)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-6)
      .map((row) => ({ date: row.date, score: row.score }));
    return {
      employeeId: employee.id,
      employee,
      active: !!active,
      ended: !!ended,
      trivsel,
      trivselSince: since,
      history,
      evaluation,
      evaluationScore: evaluation ? evaluationScore(evaluation) : 0,
      exit,
      exitProgress: exit ? exitProgress(exit) : { done: 0, total: EXIT_CHECKS.length, complete: false },
      due,
      entries: rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    };
  });
}

/** Tall til oversikten: snitt trivsel (siste per aktiv person), fordeling og hvor mange som venter. */
export function followUpSummary(statusRows) {
  const active = (statusRows || []).filter((row) => row.active && !row.ended);
  const scored = active.filter((row) => row.trivsel);
  const avg = scored.length
    ? Math.round((scored.reduce((n, row) => n + row.trivsel.score, 0) / scored.length) * 10) / 10
    : 0;
  const distribution = TRIVSEL_SCALE.map((step) => ({
    ...step,
    count: scored.filter((row) => row.trivsel.score === step.value).length,
  }));
  const evaluated = (statusRows || []).filter((row) => row.evaluationScore);
  return {
    avg,
    scored: scored.length,
    activeCount: active.length,
    distribution,
    low: scored.filter((row) => row.trivsel.score <= 2),
    dueTrivsel: (statusRows || []).filter((row) => row.due === 'trivsel'),
    dueExit: (statusRows || []).filter((row) => row.due === 'avslutning'),
    evaluationAvg: evaluated.length
      ? Math.round((evaluated.reduce((n, row) => n + row.evaluationScore, 0) / evaluated.length) * 10) / 10
      : 0,
    evaluatedCount: evaluated.length,
  };
}

/**
 * Varighet på oppdraget. En innleid fra bemanningsforetak som har vært sammenhengende
 * innleid i mer enn tre år, har rett til fast ansettelse hos innleier (arbeidsmiljøloven).
 * level: '' | 'watch' (fra 2,5 år) | 'over' (over 3 år). Gjelder bare «innleid».
 */
export function assignmentDuration(employee, { kindLabel = '', today = '' } = {}) {
  const now = dayKey(today) || new Date().toISOString().slice(0, 10);
  const from = dayKey(employee?.company?.periodFrom);
  const to = dayKey(employee?.company?.periodTo);
  if (!from) return { from: '', to, days: null, months: null, level: '' };
  const until = to && to < now ? to : now;
  const days = Math.max(0, daysBetween(from, until) ?? 0);
  const months = Math.floor(days / 30.44);
  let level = '';
  if (String(kindLabel).toLowerCase() === 'innleid') {
    if (days > 365 * 3) level = 'over';
    else if (days >= Math.round(365 * 2.5)) level = 'watch';
  }
  return { from, to, days, months, level };
}

export function durationLabel(months) {
  if (months == null) return '';
  if (months < 1) return 'Under 1 mnd';
  if (months < 12) return `${months} mnd`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} år ${rest} mnd` : `${years} år`;
}
