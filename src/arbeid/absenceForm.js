/**
 * Fraværsskjema for fravær som ikke er sykdom eller ferie: permisjon, «annet fravær med/uten lønn»,
 * legebesøk, seminar o.l. Skjemaet gir leder begrunnelsen og perioden, og kobles til dagene i
 * timelisten med formId. Dager som er ført uten skjema, gir påminnelsen «Husk fraværsskjema».
 *
 * Sykdom har eget skjema (egenmelding/sykmelding, sickLeave.js), ferie har ferieplanen.
 */
import { addAbsence, createId, deleteAbsences } from '../project/engine.js';
import { NOTICE_TYPE_ID, absenceTypeById } from './absenceCatalog.js';
import { addDays, calendarDays, isIsoDate, sickKind, todayIso } from './sickLeave.js';

/** Fraværsdager før denne datoen gir ikke påminnelse (ført før skjemaet fantes). */
export const ABSENCE_FORM_START = '2026-11-01';

/** Lengste periode ett skjema kan dekke. */
export const ABSENCE_FORM_MAX_DAYS = 366;

const FORM_TYPE_CATEGORIES = new Set(['Permisjon', 'Annet fravær']);

// Interntid og reisetid er arbeid som føres som fravær; permittering bestemmer arbeidsgiver.
const NO_FORM_IDS = new Set(['intern_admin', 'intern_smart', 'reise_uten_lonn', 'permittert', NOTICE_TYPE_ID]);
const NO_FORM_LABEL = /interntid|reisetid|permitter/i;

function text(value) {
  return String(value ?? '').trim();
}

function isWeekend(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

/** Sammenhengende: samme dag, neste dag, eller bare helgedager imellom. */
function onlyWeekendBetween(lastDate, date) {
  if (date <= lastDate) return true;
  for (let day = addDays(lastDate, 1); day < date; day = addDays(day, 1)) {
    if (!isWeekend(day)) return false;
  }
  return true;
}

/** Om fraværstypen skal ha fraværsskjema. */
export function needsAbsenceForm(typeId, catalog) {
  const id = text(typeId);
  if (!id || NO_FORM_IDS.has(id)) return false;
  if (sickKind(id, catalog)) return false;
  const row = absenceTypeById(id, catalog);
  if (!FORM_TYPE_CATEGORIES.has(row.category)) return false;
  return !NO_FORM_LABEL.test(row.label);
}

const DETAIL_KEYS = ['childName', 'childDate', 'percent', 'relation', 'person', 'occasion', 'education', 'organ', 'holiday'];

/** Bare feltene kategorien spør om, trimmet. Ingen andre opplysninger lagres. */
export function cleanFormDetails(category, details = {}) {
  const cat = formCategory(category);
  const fields = new Set(cat?.fields || []);
  const allowed = {
    childName: fields.has('child'),
    childDate: fields.has('childDate'),
    percent: fields.has('percent'),
    relation: fields.has('relation'),
    person: fields.has('person'),
    occasion: fields.has('occasion'),
    education: fields.has('education'),
    organ: fields.has('organ'),
    holiday: fields.has('holiday'),
  };
  const out = {};
  for (const key of DETAIL_KEYS) {
    if (!allowed[key]) continue;
    const value = key === 'percent' ? Number(details?.[key] || 100) : text(details?.[key]).slice(0, 120);
    if (value !== '' && value != null) out[key] = value;
  }
  return out;
}

/** Kort linje om skjemaet for leder og oversikter. */
export function formSummary(row = {}) {
  const cat = formCategory(row.formCategory);
  const d = row.formDetails && typeof row.formDetails === 'object' ? row.formDetails : {};
  const parts = [];
  if (cat) parts.push(cat.label);
  if (d.occasion) parts.push(OCCASIONS.find((o) => o.id === d.occasion)?.label || d.occasion);
  if (d.relation) parts.push(RELATIONS.find((r) => r.id === d.relation)?.label || d.relation);
  if (d.person) parts.push(d.person);
  if (d.childName) parts.push(`barn: ${d.childName}`);
  if (d.education) parts.push(d.education);
  if (d.organ) parts.push(d.organ);
  if (d.holiday) parts.push(d.holiday);
  if (d.percent && d.percent < 100) parts.push(`${d.percent} %`);
  if (text(row.formReason)) parts.push(text(row.formReason));
  return parts.join(' · ');
}

export function absenceFormId() {
  return createId('fsk');
}

/**
 * Grunnlag for fraværet. Lovfestede permisjoner etter arbeidsmiljøloven kapittel 12
 * (og trossamfunnsloven § 18), pluss velferdspermisjon, kurs og legetime etter avtale.
 * fields: hvilke opplysninger skjemaet spør om. quota: lovens dager per kalenderår.
 * notice: varslingsplikt etter aml. § 12-7 (gjelder §§ 12-2 til 12-6).
 */
export const FORM_CATEGORIES = [
  {
    id: 'foreldre',
    label: 'Foreldrepermisjon / svangerskapspermisjon',
    law: 'aml. §§ 12-2, 12-4 og 12-5',
    fields: ['child', 'childDate', 'percent'],
    notice: true,
    info: 'Foreldrepermisjon inntil 12 måneder per forelder. Foreldrepenger søkes hos NAV.',
  },
  {
    id: 'omsorg_fodsel',
    label: 'Omsorgspermisjon ved fødsel eller adopsjon',
    law: 'aml. § 12-3',
    fields: ['child', 'childDate'],
    notice: true,
    maxDays: 14,
    info: 'To uker i forbindelse med fødsel eller omsorgsovertakelse. Lønn etter avtale.',
  },
  {
    id: 'svangerskapskontroll',
    label: 'Svangerskapskontroll',
    law: 'aml. § 12-1',
    fields: [],
    info: 'Fri med lønn når kontrollen ikke kan tas utenom arbeidstiden.',
  },
  {
    id: 'ammefri',
    label: 'Ammefri',
    law: 'aml. § 12-8',
    fields: ['child', 'childDate'],
    info: 'Lønnet inntil én time per dag (ved minst 7 timers arbeidsdag) til barnet er ett år.',
  },
  {
    id: 'pleie_barn',
    label: 'Pleie av alvorlig sykt barn / barn på sykehus',
    law: 'aml. § 12-9',
    fields: ['child'],
    docs: true,
    info: 'Pleiepenger søkes hos NAV. Vanlig sykt barn meldes som egenmelding for sykt barn.',
  },
  {
    id: 'naerstaende',
    label: 'Omsorg for nærstående',
    law: 'aml. § 12-10 andre ledd',
    fields: ['relation', 'person'],
    quota: 10,
    info: 'Inntil 10 dager per kalenderår for nødvendig omsorg for foreldre, ektefelle, samboer eller partner, eller funksjonshemmet / kronisk sykt barn over 18 år. Uten lønn etter loven.',
  },
  {
    id: 'livets_sluttfase',
    label: 'Pleie av nærstående i livets sluttfase',
    law: 'aml. § 12-10 første ledd',
    fields: ['relation', 'person'],
    maxDays: 60,
    docs: true,
    info: 'Inntil 60 dager per nærstående. Pleiepenger søkes hos NAV.',
  },
  {
    id: 'utdanning',
    label: 'Utdanningspermisjon',
    law: 'aml. § 12-11',
    fields: ['education'],
    info: 'Krever minst tre år i arbeidslivet og to år hos arbeidsgiveren. Søknaden skal være skriftlig og si hva utdanningen gjelder, hvor lenge den varer og om du har fått opptak.',
  },
  {
    id: 'militaer',
    label: 'Militærtjeneste / sivilforsvar',
    law: 'aml. § 12-12',
    fields: ['organ'],
    info: 'Gjelder pliktig tjeneste og frivillig tjeneste etter loven. Legg ved innkallingen ved behov.',
  },
  {
    id: 'verv',
    label: 'Offentlig verv',
    law: 'aml. § 12-13',
    fields: ['organ'],
    info: 'Fri så langt det trengs for lovbestemt møteplikt i offentlige organer.',
  },
  {
    id: 'religios',
    label: 'Religiøs høytid',
    law: 'aml. § 12-15 / trossamfunnsloven § 18',
    fields: ['holiday'],
    quota: 2,
    noticeDays: 14,
    info: 'Inntil to selvvalgte dager per år. Varsles senest 14 dager før. Lønn trekkes ikke, men arbeidsgiver kan kreve at tiden tas igjen.',
  },
  {
    id: 'velferd',
    label: 'Velferdspermisjon',
    law: 'Tariffavtale eller avtale med arbeidsgiver',
    fields: ['occasion', 'relation'],
    info: 'For eksempel begravelse, flytting, eget bryllup, barnehage- eller skolestart. Om dagen er med lønn, følger av avtalen.',
  },
  {
    id: 'kurs',
    label: 'Kurs / seminar',
    law: 'Avtale med arbeidsgiver',
    fields: ['education'],
    info: '',
  },
  {
    id: 'lege',
    label: 'Lege, tannlege eller behandling',
    law: 'Avtale med arbeidsgiver',
    fields: [],
    health: true,
    info: 'Ikke skriv diagnose eller andre helseopplysninger.',
  },
  {
    id: 'annet',
    label: 'Annet',
    law: '',
    fields: [],
    reasonRequired: true,
    info: '',
  },
];

const CATEGORY_BY_ID = new Map(FORM_CATEGORIES.map((row) => [row.id, row]));

export function formCategory(id) {
  return CATEGORY_BY_ID.get(text(id)) || null;
}

export const RELATIONS = [
  { id: 'forelder', label: 'Forelder' },
  { id: 'partner', label: 'Ektefelle, samboer eller partner' },
  { id: 'barn', label: 'Barn' },
  { id: 'sosken', label: 'Søsken' },
  { id: 'besteforelder', label: 'Besteforelder / barnebarn' },
  { id: 'svigerfamilie', label: 'Svigerfamilie' },
  { id: 'annen', label: 'Annen nærstående' },
];

export const OCCASIONS = [
  { id: 'begravelse', label: 'Begravelse / dødsfall' },
  { id: 'flytting', label: 'Flytting' },
  { id: 'bryllup', label: 'Eget bryllup / partnerskap' },
  { id: 'barnehage', label: 'Tilvenning barnehage / første skoledag' },
  { id: 'annet', label: 'Annet' },
];

/** Hvilken kategori skjemaet starter med, ut fra fraværstypen. */
export function defaultFormCategory(typeId, catalog) {
  const id = text(typeId);
  if (id === 'foreldre') return 'foreldre';
  if (id === 'seminar_med' || id === 'seminar_uten') return 'kurs';
  if (id === 'lege_med' || id === 'lege_uten') return 'lege';
  const row = absenceTypeById(id, catalog);
  if (/foreldre|svangerskap/i.test(row.label)) return 'foreldre';
  if (/velferd/i.test(row.label)) return 'velferd';
  if (/seminar|kurs/i.test(row.label)) return 'kurs';
  if (/lege|tannlege/i.test(row.label)) return 'lege';
  return '';
}

function daysBetween(a, b) {
  if (!isIsoDate(a) || !isIsoDate(b)) return 0;
  return calendarDays(a, b) - 1;
}

/** Dager med samme kategori i kalenderåret, fra andre skjema enn dette. */
export function categoryDaysUsed(absences, { employeeId, category, year, excludeFormId = '' } = {}) {
  const dates = new Set();
  for (const row of Array.isArray(absences) ? absences : []) {
    if (!row || text(row.employeeId) !== text(employeeId)) continue;
    if (text(row.formCategory) !== text(category)) continue;
    if (excludeFormId && text(row.formId) === text(excludeFormId)) continue;
    if (!(Number(row.hours) > 0)) continue;
    const date = text(row.date);
    if (date.slice(0, 4) === String(year)) dates.add(date);
  }
  return dates.size;
}

/**
 * Varsler etter loven som ikke stopper skjemaet: for sent varslet (aml. § 12-7,
 * trossamfunnsloven § 18), kvoten brukt opp, eller perioden lengre enn loven gir rett til.
 */
export function formWarnings(form = {}, { today, usedDays = 0, workDays = 0 } = {}) {
  const cat = formCategory(form.category);
  if (!cat) return [];
  const day = isIsoDate(today) ? today : todayIso();
  const toDate = text(form.toDate) || text(form.fromDate);
  const length = calendarDays(form.fromDate, toDate);
  const lead = daysBetween(day, form.fromDate);
  const out = [];
  if (cat.notice && isIsoDate(form.fromDate) && form.fromDate >= day) {
    const need = length > 365 ? 84 : length > 84 ? 28 : length > 14 ? 7 : 0;
    if (need && lead < need) {
      out.push(`Permisjon på over ${length > 365 ? 'ett år' : length > 84 ? '12 uker' : 'to uker'} skal varsles senest ${need === 7 ? 'én uke' : `${need / 7} uker`} før (aml. § 12-7).`);
    }
  }
  if (cat.noticeDays && isIsoDate(form.fromDate) && lead < cat.noticeDays) {
    out.push(`Skal varsles senest ${cat.noticeDays} dager før. Arbeidsgiver kan likevel innvilge.`);
  }
  if (cat.quota && usedDays + workDays > cat.quota) {
    out.push(`Loven gir inntil ${cat.quota} dager per år. Med dette skjemaet er ${usedDays + workDays} dager brukt. Resten må avtales med arbeidsgiver.`);
  }
  if (cat.maxDays && length > cat.maxDays) {
    out.push(`Loven gir inntil ${cat.maxDays} dager. Utover det må det avtales med arbeidsgiver.`);
  }
  return out;
}

/** Sjekker skjemaet før det føres. Returnerer feilmeldinger (tom liste = ok). */
export function validateAbsenceForm(form = {}) {
  const errors = [];
  if (!text(form.type)) errors.push('Velg fraværstype.');
  const cat = formCategory(form.category);
  if (!cat) errors.push('Velg hva fraværet gjelder.');
  const details = form.details && typeof form.details === 'object' ? form.details : {};
  const fields = cat?.fields || [];
  if (fields.includes('child') && !text(details.childName)) errors.push('Skriv barnets fornavn.');
  if (fields.includes('childDate') && !isIsoDate(details.childDate)) errors.push('Velg fødselsdato, termin eller dato for omsorgsovertakelse.');
  if (fields.includes('relation') && cat?.id !== 'velferd' && !text(details.relation)) errors.push('Velg hvem det gjelder.');
  if (fields.includes('occasion') && !text(details.occasion)) errors.push('Velg anledning.');
  if (fields.includes('education') && !text(details.education)) errors.push(cat?.id === 'kurs' ? 'Skriv navn på kurset eller seminaret.' : 'Skriv utdanning og studiested.');
  if (fields.includes('organ') && !text(details.organ)) errors.push(cat?.id === 'verv' ? 'Skriv vervet og organet.' : 'Skriv hvilken tjeneste det gjelder.');
  if (fields.includes('holiday') && !text(details.holiday)) errors.push('Skriv hvilken høytid det gjelder.');
  if (fields.includes('percent')) {
    const pct = Number(details.percent || 100);
    if (!(pct > 0 && pct <= 100)) errors.push('Permisjonsgraden må være mellom 1 og 100 %.');
  }
  if (form.confirmed === false) errors.push('Bekreft at opplysningene er riktige.');
  if (!isIsoDate(form.fromDate)) errors.push('Velg fra-dato.');
  const toDate = text(form.toDate) || text(form.fromDate);
  if (isIsoDate(form.fromDate) && (!isIsoDate(toDate) || toDate < form.fromDate)) {
    errors.push('Til-dato kan ikke være før fra-dato.');
  } else if (calendarDays(form.fromDate, toDate) > ABSENCE_FORM_MAX_DAYS) {
    errors.push('Perioden kan være høyst ett år.');
  }
  if ((!cat || cat.reasonRequired || text(details.occasion) === 'annet') && !text(form.reason)) errors.push('Skriv en kort begrunnelse.');
  return errors;
}

/**
 * Fører skjemaet i timelisten: én fraværsrad per arbeidsdag i perioden, merket med formId.
 * Dager som allerede er ført med samme type, beholder timene og kobles til skjemaet.
 * Dager som ikke lenger er med i perioden (skjemaet er endret), fjernes.
 */
export function applyAbsenceForm(state, form, { hoursForDate, createdByUid = '', now = new Date() } = {}) {
  const errors = validateAbsenceForm(form);
  if (errors.length) return { ok: false, state, error: errors.join(' '), absenceIds: [] };
  const employeeId = text(form.employeeId);
  if (!employeeId) return { ok: false, state, error: 'Velg medarbeider.', absenceIds: [] };
  const id = text(form.id) || absenceFormId();
  const type = text(form.type);
  const fromDate = form.fromDate;
  const toDate = text(form.toDate) || fromDate;
  const reason = text(form.reason);
  const note = text(form.note);
  const category = text(form.category);
  const details = cleanFormDetails(category, form.details);
  const formAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const hoursOf = typeof hoursForDate === 'function' ? hoursForDate : () => 0;

  const absences = Array.isArray(state.absences) ? state.absences : [];
  const mine = absences.filter((a) => text(a.employeeId) === employeeId);

  let next = state;
  const stale = mine
    .filter((a) => text(a.formId) === id && (text(a.date) < fromDate || text(a.date) > toDate || text(a.type) !== type))
    .map((a) => a.id);
  if (stale.length) {
    const removed = deleteAbsences(next, stale);
    if (removed.ok) next = removed.state;
  }

  const ids = [];
  const failed = [];
  for (let day = fromDate; day && day <= toDate; day = addDays(day, 1)) {
    const existing = mine.find((a) => text(a.date) === day && text(a.formId) === id && text(a.type) === type)
      || mine.find((a) => text(a.date) === day && text(a.type) === type && !text(a.formId));
    const hours = existing ? Number(existing.hours) : hoursOf(day);
    if (!(hours > 0)) continue;
    const result = addAbsence(next, {
      id: existing?.id || '',
      employeeId,
      employeeName: text(form.employeeName) || existing?.employeeName,
      date: day,
      hours,
      type,
      description: note || existing?.description || '',
      formId: id,
      formReason: reason,
      formCategory: category,
      formDetails: details,
      formAt,
      createdByUid: existing?.createdByUid || createdByUid,
    });
    if (!result.ok) {
      failed.push(`${day}: ${result.error}`);
      continue;
    }
    next = result.state;
    const saved = (next.absences || []).find((a) => text(a.employeeId) === employeeId && text(a.date) === day && text(a.formId) === id);
    if (saved) ids.push(saved.id);
  }
  if (!ids.length) {
    return { ok: false, state, error: failed[0] || 'Ingen arbeidsdager i perioden.', absenceIds: [] };
  }
  return { ok: true, state: next, error: failed.join(' '), absenceIds: ids, formId: id };
}

/** Skjemaet slik det står på dagene i timelisten (for å åpne og endre det). */
export function absenceFormFromRows(absences, formId) {
  const id = text(formId);
  if (!id) return null;
  const rows = (Array.isArray(absences) ? absences : []).filter((a) => text(a.formId) === id);
  if (!rows.length) return null;
  const dates = rows.map((a) => text(a.date)).sort();
  const first = rows[0];
  return {
    id,
    employeeId: text(first.employeeId),
    type: text(first.type),
    fromDate: dates[0],
    toDate: dates[dates.length - 1],
    reason: text(first.formReason),
    category: text(first.formCategory),
    details: first.formDetails && typeof first.formDetails === 'object' ? { ...first.formDetails } : {},
    confirmed: true,
    note: text(first.description),
    formAt: text(first.formAt),
    days: rows.length,
  };
}

/**
 * Fravær som er ført uten fraværsskjema, samlet i sammenhengende perioder per type
 * (helg og røde dager imellom bryter ikke perioden).
 */
export function missingAbsenceForms(absences, employeeId, { catalog, startDate = ABSENCE_FORM_START, today } = {}) {
  const emp = text(employeeId);
  const start = isIsoDate(startDate) ? startDate : '';
  const byType = new Map();
  for (const row of Array.isArray(absences) ? absences : []) {
    if (!row || (emp && text(row.employeeId) !== emp)) continue;
    if (text(row.formId) || !(Number(row.hours) > 0)) continue;
    const date = text(row.date);
    if (!isIsoDate(date) || (start && date < start)) continue;
    if (!needsAbsenceForm(row.type, catalog)) continue;
    const type = text(row.type);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(row);
  }
  const out = [];
  for (const [type, rows] of byType) {
    rows.sort((a, b) => text(a.date).localeCompare(text(b.date)));
    let current = null;
    for (const row of rows) {
      const date = text(row.date);
      if (current && onlyWeekendBetween(current.toDate, date)) {
        if (date > current.toDate) current.toDate = date;
        current.absenceIds.push(row.id);
        current.days += 1;
        continue;
      }
      current = { type, employeeId: text(row.employeeId), fromDate: date, toDate: date, days: 1, absenceIds: [row.id] };
      out.push(current);
    }
  }
  const day = isIsoDate(today) ? today : todayIso();
  // Det som har startet først, så det som kommer.
  return out.sort((a, b) => {
    const pa = a.fromDate <= day ? 0 : 1;
    const pb = b.fromDate <= day ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return pa === 0 ? b.fromDate.localeCompare(a.fromDate) : a.fromDate.localeCompare(b.fromDate);
  });
}
