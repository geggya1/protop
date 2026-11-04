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

const FORM_CATEGORIES = new Set(['Permisjon', 'Annet fravær']);

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
  if (!FORM_CATEGORIES.has(row.category)) return false;
  return !NO_FORM_LABEL.test(row.label);
}

export function absenceFormId() {
  return createId('fsk');
}

/** Sjekker skjemaet før det føres. Returnerer feilmeldinger (tom liste = ok). */
export function validateAbsenceForm(form = {}) {
  const errors = [];
  if (!text(form.type)) errors.push('Velg fraværstype.');
  if (!isIsoDate(form.fromDate)) errors.push('Velg fra-dato.');
  const toDate = text(form.toDate) || text(form.fromDate);
  if (isIsoDate(form.fromDate) && (!isIsoDate(toDate) || toDate < form.fromDate)) {
    errors.push('Til-dato kan ikke være før fra-dato.');
  } else if (calendarDays(form.fromDate, toDate) > ABSENCE_FORM_MAX_DAYS) {
    errors.push('Perioden kan være høyst ett år.');
  }
  if (!text(form.reason)) errors.push('Skriv en kort begrunnelse.');
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
