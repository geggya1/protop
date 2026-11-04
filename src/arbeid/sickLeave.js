/**
 * Sykefravær etter folketrygdloven og arbeidsmiljøloven.
 * Ren logikk uten Firestore: klient, planlagt jobb og tester bruker samme regler.
 *
 * Kilder (Lovdata-utskrift 05.10.2026):
 * - ftrl § 8-19: arbeidsgiverperioden er 16 kalenderdager. Nytt fravær innen 16 dager
 *   regnes med i samme periode.
 * - ftrl § 8-24: egenmelding krever to måneders arbeid, gjelder tre kalenderdager om
 *   gangen, og arbeidsgiver kan utvide innenfor arbeidsgiverperioden etter drøfting med
 *   tillitsvalgte. Nytt fravær innen 16 dager tar med tidligere dager uten legeerklæring.
 * - ftrl § 8-26: arbeidsgiver kan kreve skriftlig egenerklæring etter muntlig melding.
 * - ftrl § 8-27: etter minst fire fravær uten legeerklæring på 12 måneder kan retten
 *   tas fra arbeidstaker, etter at hen har fått uttale seg. Vurderes på nytt etter seks måneder.
 * - ftrl §§ 9-5 til 9-8: omsorgsdager for sykt barn, egenmelding tre kalenderdager,
 *   fire ukers opptjening, refusjon fra trygden etter dag 10.
 * - aml § 4-6: oppfølgingsplan senest etter fire uker, dialogmøte senest etter sju uker
 *   ved helt fravær, og arbeidsgiver må kunne dokumentere oppfølgingen.
 */

export const SICK_KINDS = ['self', 'doctor', 'child', 'unpaid'];

export const SICK_KIND_LABEL = {
  self: 'Egenmelding',
  doctor: 'Sykmelding',
  child: 'Sykt barn',
  unpaid: 'Sykefravær uten lønn',
};

/** Fraværstypen som lagres på dagene for hver sort. */
export const SICK_KIND_TYPE = {
  self: 'egenmelding',
  doctor: 'syk_melding',
  child: 'sykt_barn',
  unpaid: 'syk_uten',
};

const TYPE_KIND = {
  egenmelding: 'self',
  syk_melding: 'doctor',
  sykdom: 'doctor',
  sykt_barn: 'child',
  syk_uten: 'unpaid',
};

export const SICK_LEAVE_DEFAULTS = {
  selfCertDays: 3,
  extendedSelfCert: false,
  extendedDays: 8,
  extendedDiscussed: false,
  annualCapDays: 0,
  revokeTriggerOccasions: 4,
  minEmploymentMonths: 2,
  employerPeriodDays: 16,
  childCertDays: 3,
  childMinEmploymentDays: 28,
  requireForm: true,
  frequentOccasions: 3,
  denied: [],
};

/**
 * ProTop lanseres 01.01.2027. Sykedager før det krever ikke egenmelding i appen:
 * de er ført eller importert i ettertid og er dokumentert utenfor ProTop.
 */
export const SICK_NOTE_START = '2027-01-01';

/** Ny id for en sykefraværssak. Ligger her (uten Firebase) så skjermene kan lage den før lagring. */
export function sickCaseId() {
  return `syk_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export const CASE_STATUSES = ['innmeldt', 'godkjent', 'dokumentasjon', 'avvist'];

export const CASE_STATUS_LABEL = {
  innmeldt: 'Til behandling',
  godkjent: 'Godkjent',
  dokumentasjon: 'Trenger legeerklæring',
  avvist: 'Avvist',
};

export const SELF_DECLARATION = 'Jeg bekrefter at jeg er arbeidsufør på grunn av sykdom eller skade, og at fraværet ikke skyldes andre forhold.';
export const CHILD_DECLARATION = 'Jeg bekrefter at jeg er borte fra arbeidet fordi barnet mitt er sykt, eller fordi den som har tilsynet med barnet er syk.';

function text(value) {
  return String(value ?? '').trim();
}

function bool(value) {
  return value === true;
}

function count(value, fallback, max = 366) {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(max, Math.round(n));
}

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value));
}

function toUtc(iso) {
  const [y, m, d] = text(iso).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms) {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(iso, days) {
  if (!isIsoDate(iso)) return '';
  return fromUtc(toUtc(iso) + Number(days) * 86400000);
}

export function addMonths(iso, months) {
  if (!isIsoDate(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + Number(months), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return fromUtc(target.getTime());
}

/** Antall kalenderdager fra og med a til og med b. */
export function calendarDays(fromIso, toIso) {
  if (!isIsoDate(fromIso) || !isIsoDate(toIso)) return 0;
  return Math.max(0, Math.round((toUtc(toIso) - toUtc(fromIso)) / 86400000) + 1);
}

function weekday(iso) {
  return new Date(toUtc(iso)).getUTCDay();
}

function isWeekendIso(iso) {
  const day = weekday(iso);
  return day === 0 || day === 6;
}

export function todayIso(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function normalizeSickRules(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const d = SICK_LEAVE_DEFAULTS;
  const denied = Array.isArray(src.denied) ? src.denied : [];
  return {
    selfCertDays: d.selfCertDays,
    extendedSelfCert: bool(src.extendedSelfCert),
    // Utvidelse kan bare gis innenfor arbeidsgiverperioden (16 dager).
    extendedDays: Math.max(d.selfCertDays, count(src.extendedDays, d.extendedDays, d.employerPeriodDays)),
    extendedDiscussed: bool(src.extendedDiscussed),
    annualCapDays: count(src.annualCapDays, 0, 366),
    revokeTriggerOccasions: d.revokeTriggerOccasions,
    minEmploymentMonths: d.minEmploymentMonths,
    employerPeriodDays: d.employerPeriodDays,
    childCertDays: d.childCertDays,
    childMinEmploymentDays: d.childMinEmploymentDays,
    requireForm: src.requireForm !== false,
    frequentOccasions: Math.max(2, count(src.frequentOccasions, d.frequentOccasions, 12)),
    denied: denied
      .map((row) => ({
        employeeId: text(row?.employeeId),
        from: text(row?.from).slice(0, 10),
        reason: text(row?.reason).slice(0, 400),
        heardAt: text(row?.heardAt).slice(0, 10),
      }))
      .filter((row) => row.employeeId && isIsoDate(row.from)),
  };
}

/**
 * Ordningen fra IA-avtalen (før 2019): egenmelding i inntil 8 kalenderdager om gangen og
 * 24 kalenderdager per 12 måneder. Mange virksomheter har videreført den. Etter ftrl § 8-24
 * er det arbeidsgivers valg innenfor arbeidsgiverperioden, etter drøfting med tillitsvalgte.
 */
export const IA_SELF_CERT = { extendedSelfCert: true, extendedDays: 8, annualCapDays: 24 };

/** 'law' (tre dager), 'ia' (8 / 24) eller 'custom' (egen utvidelse eller tak). */
export function selfCertScheme(rules) {
  const r = normalizeSickRules(rules);
  if (!r.extendedSelfCert) return r.annualCapDays ? 'custom' : 'law';
  return r.extendedDays === IA_SELF_CERT.extendedDays && r.annualCapDays === IA_SELF_CERT.annualCapDays ? 'ia' : 'custom';
}

/** Lengste egenmelding om gangen. Utvidelse krever drøfting med tillitsvalgte. */
export function selfCertMaxDays(rules) {
  const r = normalizeSickRules(rules);
  return r.extendedSelfCert && r.extendedDiscussed ? r.extendedDays : r.selfCertDays;
}

/** Hva slags sykefravær en fraværstype er, eller '' for annet fravær. */
export function sickKind(typeId, catalog) {
  const id = text(typeId);
  if (TYPE_KIND[id]) return TYPE_KIND[id];
  const list = Array.isArray(catalog) ? catalog : [];
  const row = list.find((item) => text(item?.id) === id);
  if (row?.category === 'Sykdom') return row.paid === false ? 'unpaid' : 'doctor';
  return '';
}

function sickRows(absences, employeeId, catalog) {
  const emp = text(employeeId);
  const byDate = new Map();
  for (const row of Array.isArray(absences) ? absences : []) {
    if (!row || (emp && text(row.employeeId) !== emp)) continue;
    const kind = sickKind(row.type, catalog);
    if (!kind) continue;
    const date = text(row.date);
    if (!isIsoDate(date)) continue;
    const prev = byDate.get(date);
    const hours = (Number(row.hours) || 0) + (prev?.hours || 0);
    const kinds = new Set(prev?.kinds || []);
    kinds.add(kind);
    const ids = [...(prev?.ids || []), text(row.id)].filter(Boolean);
    const caseIds = new Set(prev?.caseIds || []);
    if (text(row.caseId)) caseIds.add(text(row.caseId));
    byDate.set(date, { date, hours, kinds, ids, caseIds, employeeId: text(row.employeeId) });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Dagene mellom a og b er bare helg (fravær fredag og mandag er samme tilfelle). */
function onlyWeekendBetween(prevIso, nextIso) {
  let day = addDays(prevIso, 1);
  while (day && day < nextIso) {
    if (!isWeekendIso(day)) return false;
    day = addDays(day, 1);
  }
  return true;
}

/**
 * Samler sykedager i sammenhengende tilfeller. Sykt barn telles for seg.
 * calendarDays teller helg inne i tilfellet, slik egenmelding regnes i kalenderdager.
 */
export function sickOccasions(absences, employeeId, { catalog, kinds = ['self', 'doctor', 'unpaid'] } = {}) {
  const wanted = new Set(kinds);
  const rows = sickRows(absences, employeeId, catalog)
    .filter((row) => [...row.kinds].some((kind) => wanted.has(kind)));
  const out = [];
  let current = null;
  for (const row of rows) {
    if (current && onlyWeekendBetween(current.end, row.date)) {
      current.end = row.date;
      current.dates.push(row.date);
      row.kinds.forEach((kind) => current.kinds.add(kind));
      current.absenceIds.push(...row.ids);
      row.caseIds.forEach((id) => current.caseIds.add(id));
      current.hours += row.hours;
      continue;
    }
    current = {
      employeeId: row.employeeId,
      start: row.date,
      end: row.date,
      dates: [row.date],
      kinds: new Set(row.kinds),
      absenceIds: [...row.ids],
      caseIds: new Set(row.caseIds),
      hours: row.hours,
    };
    out.push(current);
  }
  return out.map((occ) => ({
    ...occ,
    kinds: [...occ.kinds],
    caseIds: [...occ.caseIds],
    hours: Math.round(occ.hours * 100) / 100,
    workDays: occ.dates.length,
    calendarDays: calendarDays(occ.start, occ.end),
    doctor: occ.kinds.has('doctor'),
    selfOnly: !occ.kinds.has('doctor') && occ.kinds.has('self'),
  }));
}

/**
 * Arbeidsgiverperioder (ftrl § 8-19). Nytt fravær innen 16 dager etter forrige
 * hører til samme periode, og etter en full periode starter ingen ny innen 16 dager.
 */
export function employerPeriods(occasions, rules) {
  const limit = normalizeSickRules(rules).employerPeriodDays;
  const periods = [];
  let current = null;
  for (const occ of [...(occasions || [])].sort((a, b) => a.start.localeCompare(b.start))) {
    const gap = current ? calendarDays(current.lastEnd, occ.start) - 2 : Infinity;
    if (!current || gap >= limit) {
      current = { start: occ.start, lastEnd: occ.end, used: 0, endDate: '', occasions: [] };
      periods.push(current);
    }
    current.occasions.push(occ);
    current.lastEnd = occ.end > current.lastEnd ? occ.end : current.lastEnd;
    if (current.used < limit) {
      const left = limit - current.used;
      const days = occ.calendarDays;
      if (days >= left) {
        current.endDate = addDays(occ.start, left - 1);
        current.used = limit;
      } else {
        current.used += days;
      }
    }
  }
  return periods.map((row) => ({
    start: row.start,
    lastEnd: row.lastEnd,
    used: row.used,
    full: row.used >= limit,
    endDate: row.endDate,
    navFrom: row.endDate ? addDays(row.endDate, 1) : '',
    occasionCount: row.occasions.length,
  }));
}

/** Er egenmelding fratatt for arbeidstakeren på datoen (ftrl § 8-27)? Gjelder i seks måneder. */
export function selfCertDenied(rules, employeeId, at) {
  const r = normalizeSickRules(rules);
  const day = text(at) || todayIso();
  return r.denied.find((row) => row.employeeId === text(employeeId)
    && row.from <= day && addMonths(row.from, 6) > day) || null;
}

/** Status for egenmelding for én ansatt på en dato. */
export function selfCertStatus({ employee, absences, catalog, rules, at } = {}) {
  const r = normalizeSickRules(rules);
  const day = isIsoDate(at) ? at : todayIso();
  const employeeId = text(employee?.id);
  const startedAt = text(employee?.company?.periodFrom).slice(0, 10);
  const eligibleFrom = isIsoDate(startedAt) ? addMonths(startedAt, r.minEmploymentMonths) : '';
  const eligible = eligibleFrom ? day >= eligibleFrom : null;
  const windowStart = addMonths(day, -12);
  const occasions = sickOccasions(absences, employeeId, { catalog, kinds: ['self', 'doctor'] })
    .filter((occ) => occ.end >= windowStart && occ.start <= day);
  const selfOccasions = occasions.filter((occ) => occ.selfOnly);
  const daysUsed = selfOccasions.reduce((sum, occ) => sum + occ.calendarDays, 0);
  const denied = selfCertDenied(r, employeeId, day);
  const max = selfCertMaxDays(r);
  return {
    employeeId,
    at: day,
    eligible,
    eligibleFrom,
    denied,
    maxDaysPerOccasion: max,
    occasionsUsed: selfOccasions.length,
    daysUsed,
    annualCapDays: r.annualCapDays,
    daysLeft: r.annualCapDays ? Math.max(0, r.annualCapDays - daysUsed) : null,
    // ftrl § 8-27 a: arbeidsgiver kan vurdere å ta fra retten, ikke et automatisk tak.
    revokeReview: selfOccasions.length >= r.revokeTriggerOccasions,
    frequent: occasions.length >= r.frequentOccasions,
    occasions,
  };
}

function nbDate(iso) {
  const [y, m, d] = text(iso).split('-');
  return y && m && d ? `${d}.${m}.${y}` : text(iso);
}

/**
 * Tilfellet en ny periode havner i: den nye perioden slått sammen med dager av
 * samme sort rett før og etter (helg mellom regnes som sammenhengende).
 */
export function joinedOccasion(absences, employeeId, fromIso, toIso, kind, catalog) {
  const type = SICK_KIND_TYPE[kind] || 'egenmelding';
  const added = [];
  for (let day = fromIso; day && day <= toIso; day = addDays(day, 1)) {
    added.push({ id: `ny-${day}`, employeeId: text(employeeId), date: day, type, hours: 0 });
  }
  const list = [...(Array.isArray(absences) ? absences : []), ...added];
  const occ = sickOccasions(list, employeeId, { catalog, kinds: [kind] })
    .find((row) => row.start <= fromIso && row.end >= fromIso);
  return occ || { start: fromIso, end: toIso, calendarDays: calendarDays(fromIso, toIso) };
}

/**
 * Sjekk en ny egenmelding før den sendes.
 * Returnerer feil som stopper innsending og varsler som bare vises.
 */
export function validateSickNote({
  kind = 'self',
  fromDate,
  toDate,
  employee,
  absences = [],
  catalog,
  rules,
  confirmed = false,
  childQuota = null,
  ignoreCaseId = '',
} = {}) {
  const errors = [];
  const warnings = [];
  let limitExceeded = false;
  const r = normalizeSickRules(rules);
  const from = text(fromDate);
  const to = text(toDate) || from;
  if (!isIsoDate(from) || !isIsoDate(to)) errors.push('Velg dato for fraværet.');
  else if (to < from) errors.push('Til-dato kan ikke være før fra-dato.');
  const days = calendarDays(from, to);
  const datesOk = !errors.length;
  if ((kind === 'self' || kind === 'child') && !confirmed) {
    errors.push('Du må bekrefte erklæringen før du sender.');
  }
  const rest = (Array.isArray(absences) ? absences : []).filter((row) => !ignoreCaseId || text(row.caseId) !== ignoreCaseId);
  if (kind === 'self' && datesOk) {
    const status = selfCertStatus({ employee, absences: rest, catalog, rules: r, at: from });
    if (status.eligible === false) {
      errors.push(`Egenmelding kan brukes etter to måneders ansettelse (fra ${status.eligibleFrom}). Fraværet må dokumenteres med sykmelding.`);
    }
    if (status.denied) {
      errors.push('Retten til egenmelding er midlertidig fratatt. Fraværet må dokumenteres med sykmelding.');
    }
    // Egenmeldingsdager rett før eller etter (også over helg) er samme tilfelle, og
    // tidligere dager uten legeerklæring innen 16 dager regnes med (ftrl § 8-24).
    const occ = joinedOccasion(rest, employee?.id, from, to, 'self', catalog);
    const chainStart = addDays(occ.start, -r.employerPeriodDays);
    const before = sickOccasions(rest, employee?.id, { catalog, kinds: ['self', 'doctor'] })
      .filter((row) => row.selfOnly && row.end < occ.start && row.end >= chainStart);
    const linked = before.reduce((sum, row) => sum + row.calendarDays, 0);
    const max = status.maxDaysPerOccasion;
    if (occ.calendarDays + linked > max) {
      limitExceeded = true;
      const doctorFrom = addDays(occ.start, Math.max(0, max - linked));
      const sameRun = occ.calendarDays > days;
      errors.push(`Beklager, egenmelding kan bare brukes i ${max} kalenderdager om gangen (folketrygdloven § 8-24). `
        + (linked
          ? `Egenmelding de siste 16 dagene teller med (${linked} ${linked === 1 ? 'dag' : 'dager'}). `
          : '')
        + (sameRun ? `Med dagene rett før og etter blir dette ${occ.calendarDays} kalenderdager sammenhengende${workdaysBetween(occ.start, occ.end) < occ.calendarDays ? ', helg medregnet' : ''}. ` : '')
        + (doctorFrom <= to
          ? `Fra og med ${nbDate(doctorFrom < from ? from : doctorFrom)} må fraværet dokumenteres med sykmelding fra lege.`
          : 'Fraværet må dokumenteres med sykmelding fra lege.'));
    }
    if (status.daysLeft != null && days > status.daysLeft) {
      // Taket er bedriftens egenmeldingsordning (for eksempel IA: 24 dager): dager ut over krever sykmelding.
      limitExceeded = true;
      errors.push(`Bedriften har et tak på ${status.annualCapDays} egenmeldingsdager per 12 måneder, og ${status.daysLeft} ${status.daysLeft === 1 ? 'dag' : 'dager'} er igjen. `
        + (status.daysLeft > 0
          ? `Fra og med ${nbDate(addDays(from, status.daysLeft))} må fraværet dokumenteres med sykmelding fra lege.`
          : 'Fraværet må dokumenteres med sykmelding fra lege.'));
    }
    if (status.occasionsUsed + 1 >= r.revokeTriggerOccasions) {
      warnings.push(`Dette blir egenmelding nummer ${status.occasionsUsed + 1} de siste 12 månedene. Leder kan ta kontakt for en samtale.`);
    }
    if (status.eligible == null) {
      warnings.push('Startdato for ansettelsen mangler, så toumånedersregelen kan ikke sjekkes.');
    }
  }
  if (kind === 'child' && datesOk) {
    // Dager med sykt barn rett før eller etter er samme tilfelle (ftrl § 9-7).
    const occ = joinedOccasion(rest, employee?.id, from, to, 'child', catalog);
    if (occ.calendarDays > r.childCertDays) {
      limitExceeded = true;
      const doctorFrom = addDays(occ.start, r.childCertDays);
      errors.push(`Beklager, egenmelding for sykt barn kan bare brukes i ${r.childCertDays} kalenderdager om gangen (folketrygdloven § 9-7). `
        + (occ.calendarDays > days ? `Med dagene rett før og etter blir dette ${occ.calendarDays} kalenderdager sammenhengende${workdaysBetween(occ.start, occ.end) < occ.calendarDays ? ', helg medregnet' : ''}. ` : '')
        + (doctorFrom <= to
          ? `Fra og med ${nbDate(doctorFrom < from ? from : doctorFrom)} må fraværet dokumenteres med legeerklæring.`
          : 'Fraværet må dokumenteres med legeerklæring.'));
    }
    const startedAt = text(employee?.company?.periodFrom).slice(0, 10);
    if (isIsoDate(startedAt) && from < addDays(startedAt, r.childMinEmploymentDays)) {
      warnings.push('Omsorgspenger fra arbeidsgiver krever at arbeidsforholdet har vart i fire uker.');
    }
    if (childQuota && childQuota.remaining != null && workdaysBetween(from, to) > childQuota.remaining) {
      warnings.push(`Det er ${childQuota.remaining} omsorgsdager igjen i ${childQuota.year}.`);
    }
  }
  if (kind === 'doctor' && !errors.length && days > r.employerPeriodDays) {
    warnings.push('Fraværet går forbi arbeidsgiverperioden. Send inntektsmelding til NAV.');
  }
  if (!errors.length && isIsoDate(from)) {
    const holiday = rest.some((row) => text(row.employeeId) === text(employee?.id)
      && text(row.type) === 'ferie' && text(row.date) >= from && text(row.date) <= to);
    if (holiday) {
      warnings.push(kind === 'doctor'
        ? 'Du har ferie i perioden. Med sykmelding kan du kreve ferien utsatt og få dagene igjen (ferieloven § 9).'
        : 'Du har ferie i perioden. For å få ferien utsatt må fraværet dokumenteres med legeerklæring (ferieloven § 9).');
    }
  }
  return { ok: errors.length === 0, errors, warnings, days, limitExceeded };
}

export function workdaysBetween(fromIso, toIso) {
  if (!isIsoDate(fromIso) || !isIsoDate(toIso) || toIso < fromIso) return 0;
  let n = 0;
  let day = fromIso;
  while (day <= toIso) {
    if (!isWeekendIso(day)) n += 1;
    day = addDays(day, 1);
  }
  return n;
}

/** Omsorgsdager etter ftrl § 9-6, ut fra opplysningene som er lagt inn på den ansatte. */
export function childCareQuota(care = {}, { absences = [], employeeId = '', year, catalog } = {}) {
  const children = count(care?.children, 0, 20);
  const chronic = Math.min(children, count(care?.chronic, 0, 20));
  const alone = bool(care?.alone);
  const y = Number(year) || new Date().getFullYear();
  let total = 0;
  if (children > 0) {
    total = children > 2 ? 15 : 10;
    let extra = chronic * 10;
    if (alone) {
      total *= 2;
      extra *= 2;
    }
    total += extra;
  }
  const used = new Set(sickRows(absences, employeeId, catalog)
    .filter((row) => row.kinds.has('child') && row.date.startsWith(`${y}-`))
    .map((row) => row.date)).size;
  return {
    year: y,
    children,
    chronic,
    alone,
    total,
    used,
    remaining: children > 0 ? Math.max(0, total - used) : null,
    // Arbeidsgiver kan kreve refusjon fra trygden for dager ut over 10 (ftrl § 9-8).
    refundDays: Math.max(0, used - 10),
    unknown: children === 0,
  };
}

/** Normaliser en sykefraværssak (egenmelding, sykt barn eller sykmelding). */
export function normalizeSickCase(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const kind = SICK_KINDS.includes(src.kind) ? src.kind : 'self';
  const fromDate = text(src.fromDate).slice(0, 10);
  const toDate = text(src.toDate).slice(0, 10) || fromDate;
  const percentRaw = Number(src.percent);
  const followUp = src.followUp && typeof src.followUp === 'object' ? src.followUp : {};
  const history = Array.isArray(src.history) ? src.history : [];
  return {
    id: text(src.id),
    employeeId: text(src.employeeId),
    employeeUid: text(src.employeeUid),
    employeeName: text(src.employeeName),
    kind,
    fromDate,
    toDate,
    percent: Number.isFinite(percentRaw) && percentRaw > 0 ? Math.min(100, Math.round(percentRaw)) : 100,
    hoursPerDay: Number(src.hoursPerDay) > 0 ? Math.round(Number(src.hoursPerDay) * 100) / 100 : 0,
    confirmed: bool(src.confirmed),
    declaration: text(src.declaration),
    workRelated: bool(src.workRelated),
    // Ingen diagnose. Bare det arbeidsgiver trenger for å tilrettelegge.
    note: text(src.note).slice(0, 600),
    status: CASE_STATUSES.includes(src.status) ? src.status : 'innmeldt',
    handledBy: text(src.handledBy),
    handledByUid: text(src.handledByUid),
    handledAt: text(src.handledAt),
    handlerNote: text(src.handlerNote).slice(0, 600),
    absenceIds: Array.isArray(src.absenceIds) ? src.absenceIds.map(text).filter(Boolean) : [],
    followUp: {
      planAt: text(followUp.planAt).slice(0, 10),
      planSentAt: text(followUp.planSentAt).slice(0, 10),
      dialogAt: text(followUp.dialogAt).slice(0, 10),
      dialogParticipants: text(followUp.dialogParticipants).slice(0, 400),
      talkAt: text(followUp.talkAt).slice(0, 10),
      navReportAt: text(followUp.navReportAt).slice(0, 10),
      note: text(followUp.note).slice(0, 1200),
      notNeeded: bool(followUp.notNeeded),
    },
    history: history.slice(-50).map((row) => ({
      at: text(row?.at),
      by: text(row?.by).slice(0, 160),
      action: text(row?.action).slice(0, 200),
    })),
    createdAt: text(src.createdAt),
    createdByUid: text(src.createdByUid),
    updatedAt: text(src.updatedAt),
  };
}

/** Dagene saken dekker, med timer fra arbeidsplanen. Helg og røde dager uten timer hoppes over. */
export function caseAbsenceDays(sickCase, hoursForDate) {
  const row = normalizeSickCase(sickCase);
  if (!isIsoDate(row.fromDate) || !isIsoDate(row.toDate) || row.toDate < row.fromDate) return [];
  const out = [];
  let day = row.fromDate;
  while (day <= row.toDate) {
    const planned = typeof hoursForDate === 'function' ? Number(hoursForDate(day)) || 0 : (isWeekendIso(day) ? 0 : 7.5);
    const hours = Math.round(planned * (row.percent / 100) * 100) / 100;
    if (hours > 0) out.push({ date: day, hours });
    day = addDays(day, 1);
  }
  return out;
}

/**
 * Sykedager som mangler skjema, gruppert i tilfeller. Brukes til påminnelsen
 * «Husk egenmelding» med lenke rett til skjemaet. Bare dager fra og med
 * startDate (lanseringen) teller. Eldre fravær krever ikke egenmelding i ettertid.
 */
export function missingSickNotes(absences, cases, employeeId, { catalog, rules, today, startDate = SICK_NOTE_START } = {}) {
  const r = normalizeSickRules(rules);
  if (!r.requireForm) return [];
  const day = isIsoDate(today) ? today : todayIso();
  const start = isIsoDate(startDate) ? startDate : '';
  const covered = new Set();
  for (const row of Array.isArray(cases) ? cases : []) {
    const c = normalizeSickCase(row);
    if (employeeId && c.employeeId !== text(employeeId)) continue;
    if (c.status === 'avvist') continue;
    let d = c.fromDate;
    while (isIsoDate(d) && d <= c.toDate) {
      covered.add(`${c.kind}:${d}`);
      d = addDays(d, 1);
    }
  }
  const out = [];
  for (const kind of ['self', 'child']) {
    const occ = sickOccasions(absences, employeeId, { catalog, kinds: [kind] });
    for (const row of occ) {
      if (row.start > day) continue;
      if (row.caseIds.length) continue;
      const open = row.dates.filter((date) => date >= start && !covered.has(`${kind}:${date}`));
      if (!open.length) continue;
      out.push({ kind, employeeId: row.employeeId, fromDate: open[0], toDate: open[open.length - 1], days: open.length, absenceIds: row.absenceIds });
    }
  }
  return out.sort((a, b) => b.fromDate.localeCompare(a.fromDate));
}

/**
 * Frister for oppfølging av et langvarig fravær (aml § 4-6, ftrl § 8-19).
 * Hver frist har due, done og state: done | overdue | soon | later.
 */
export function followUpDeadlines(sickCase, { today, rules } = {}) {
  const row = normalizeSickCase(sickCase);
  const r = normalizeSickRules(rules);
  const day = isIsoDate(today) ? today : todayIso();
  const start = row.fromDate;
  if (!isIsoDate(start)) return [];
  const length = calendarDays(start, row.toDate);
  const f = row.followUp;
  const items = [];
  function push(id, label, due, done, hint, applies = true) {
    if (!applies) return;
    let state = 'later';
    if (done) state = 'done';
    else if (due < day) state = 'overdue';
    else if (calendarDays(day, due) <= 7) state = 'soon';
    items.push({ id, label, due, done: done || '', hint, state });
  }
  const longCase = row.kind === 'doctor' || row.kind === 'unpaid';
  push('talk', 'Kontakt og samtale om tilrettelegging', addDays(start, 7), f.talkAt,
    'aml § 4-6 (1): tiltak så langt det er mulig.', longCase && length > 3);
  push('nav', 'Inntektsmelding til NAV', addDays(start, r.employerPeriodDays), f.navReportAt,
    'ftrl § 8-19: NAV overtar etter 16 kalenderdager.', longCase && length > r.employerPeriodDays);
  push('plan', 'Oppfølgingsplan utarbeidet og sendt sykmelder', addDays(start, 28), f.planSentAt || f.planAt,
    'aml § 4-6 (3): senest etter fire uker.', longCase && length >= 28 && !f.notNeeded);
  push('dialog', 'Dialogmøte 1 holdt', addDays(start, 49), f.dialogAt,
    'aml § 4-6 (4): senest innen sju uker ved helt fravær.', longCase && length >= 49 && row.percent >= 100 && !f.notNeeded);
  return items;
}

/** Saker med frister som er passert eller nærmer seg, mest presserende først. */
export function followUpQueue(cases, { today, rules } = {}) {
  const rows = [];
  for (const raw of Array.isArray(cases) ? cases : []) {
    const c = normalizeSickCase(raw);
    if (c.status === 'avvist') continue;
    const items = followUpDeadlines(c, { today, rules }).filter((item) => item.state !== 'done');
    if (!items.length) continue;
    const order = { overdue: 0, soon: 1, later: 2 };
    items.sort((a, b) => order[a.state] - order[b.state] || a.due.localeCompare(b.due));
    rows.push({ case: c, next: items[0], items });
  }
  const rank = { overdue: 0, soon: 1, later: 2 };
  return rows.sort((a, b) => rank[a.next.state] - rank[b.next.state] || a.next.due.localeCompare(b.next.due));
}

/**
 * Sykefraværsstatistikk for en periode. Prosent = tapte timer / avtalte timer
 * (samme oppbygging som SSB: tapte dagsverk delt på avtalte dagsverk).
 * plannedHours(employee, iso) gir avtalte timer for dagen.
 */
export function sickLeaveStats({ absences = [], employees = [], fromDate, toDate, plannedHours, catalog, rules } = {}) {
  const from = text(fromDate);
  const to = text(toDate);
  const people = (Array.isArray(employees) ? employees : []).filter((emp) => text(emp?.id));
  const ids = new Set(people.map((emp) => text(emp.id)));
  const totals = { self: 0, doctor: 0, child: 0, unpaid: 0 };
  const months = new Map();
  const perEmployee = new Map();
  for (const row of Array.isArray(absences) ? absences : []) {
    const emp = text(row?.employeeId);
    const date = text(row?.date);
    if (!ids.has(emp) || !isIsoDate(date) || (from && date < from) || (to && date > to)) continue;
    const kind = sickKind(row.type, catalog);
    if (!kind) continue;
    const hours = Number(row.hours) || 0;
    totals[kind] += hours;
    const month = date.slice(0, 7);
    const m = months.get(month) || { month, self: 0, doctor: 0, child: 0, unpaid: 0, planned: 0 };
    m[kind] += hours;
    months.set(month, m);
    const p = perEmployee.get(emp) || { employeeId: emp, self: 0, doctor: 0, child: 0, unpaid: 0 };
    p[kind] += hours;
    perEmployee.set(emp, p);
  }
  let planned = 0;
  if (typeof plannedHours === 'function' && isIsoDate(from) && isIsoDate(to)) {
    for (const emp of people) {
      let day = from;
      while (day <= to) {
        const h = Number(plannedHours(emp, day)) || 0;
        planned += h;
        const m = months.get(day.slice(0, 7)) || { month: day.slice(0, 7), self: 0, doctor: 0, child: 0, unpaid: 0, planned: 0 };
        m.planned += h;
        months.set(day.slice(0, 7), m);
        day = addDays(day, 1);
      }
    }
  }
  const sick = totals.self + totals.doctor + totals.unpaid;
  const pct = (value, base) => (base > 0 ? Math.round((value / base) * 1000) / 10 : 0);
  const occasionRows = people.map((emp) => {
    const status = selfCertStatus({ employee: emp, absences, catalog, rules, at: to || todayIso() });
    const sums = perEmployee.get(text(emp.id)) || { self: 0, doctor: 0, child: 0, unpaid: 0 };
    return {
      employeeId: text(emp.id),
      occasions: status.occasions.length,
      selfOccasions: status.occasionsUsed,
      selfDays: status.daysUsed,
      frequent: status.frequent,
      revokeReview: status.revokeReview,
      hours: Math.round((sums.self + sums.doctor + sums.unpaid) * 100) / 100,
      childHours: Math.round(sums.child * 100) / 100,
    };
  });
  return {
    planned: Math.round(planned * 100) / 100,
    hours: {
      self: Math.round(totals.self * 100) / 100,
      doctor: Math.round(totals.doctor * 100) / 100,
      child: Math.round(totals.child * 100) / 100,
      unpaid: Math.round(totals.unpaid * 100) / 100,
    },
    percent: pct(sick, planned),
    selfPercent: pct(totals.self, planned),
    doctorPercent: pct(totals.doctor + totals.unpaid, planned),
    childPercent: pct(totals.child, planned),
    months: [...months.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({ ...m, percent: pct(m.self + m.doctor + m.unpaid, m.planned) })),
    employees: occasionRows.sort((a, b) => b.occasions - a.occasions || b.hours - a.hours),
  };
}
