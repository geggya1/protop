/**
 * Oversikten i Innleie: innleide og eksterne som arbeider hos dere.
 * De har en annen arbeidsgiver. Her står det dere som innleier skal ha kontroll på
 * (lovkrav for innleie, HMS-kort), og hvem som er borte (fraværsbeskjeder).
 * Ren modul – testes uten Firebase.
 */
import { displayName } from '../employees/model.js';
import { hrKindBucket, hrKindLabel } from '../hr/directory.js';
import { HIRED_CATALOG, hiredCells } from '../hr/hired.js';
import { hmsCardAlerts } from '../hr/hmsCard.js';
import { employeeHrBucket } from '../hr/model.js';

function text(value) {
  return String(value ?? '').trim();
}

function dayKey(value) {
  const m = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function addDays(iso, days) {
  const m = dayKey(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days)).toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${dayKey(fromIso)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(toIso)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Fraværstypen innleide bruker i stedet for egenmelding (src/arbeid/absenceCatalog.js). */
export const NOTICE_TYPE = 'fravaersbeskjed';

/**
 * Fraværsrader (én per dag) blir perioder per person: { id, employeeId, fromDate, toDate, note }.
 * Dager med inntil to dagers opphold (helg) slås sammen. Bare for personene i «people».
 */
export function noticesFromAbsences(absences, people) {
  const ids = new Set((people || []).map((row) => row.id));
  const byEmployee = new Map();
  for (const row of absences || []) {
    const id = text(row?.employeeId);
    const date = dayKey(row?.date);
    if (!ids.has(id) || !date || Number(row?.hours) <= 0) continue;
    const list = byEmployee.get(id) || [];
    list.push({ date, note: text(row.description) });
    byEmployee.set(id, list);
  }
  const out = [];
  for (const [employeeId, list] of byEmployee) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    let current = null;
    for (const day of list) {
      if (current && (daysBetween(current.toDate, day.date) ?? 99) <= 3) {
        current.toDate = day.date;
        if (!current.note && day.note) current.note = day.note;
        continue;
      }
      current = { id: `${employeeId}_${day.date}`, employeeId, fromDate: day.date, toDate: day.date, note: day.note };
      out.push(current);
    }
  }
  return out.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}

/** Innleide og eksterne, uten slettede. status: 'active' | 'inactive' | 'all'. */
export function hiredPeople(employees, status = 'active') {
  return (employees || []).filter((row) => {
    if (hrKindBucket(row) !== 'external') return false;
    const bucket = employeeHrBucket(row);
    if (bucket === 'deleted') return false;
    return status === 'all' || bucket === status;
  });
}

/**
 * Fraværsbeskjeder som gjelder i perioden, slått sammen per person.
 * notices: [{ employeeId, fromDate, toDate, note }] (toDate tom = én dag).
 */
export function awayRows(notices, people, { today = '', days = 7 } = {}) {
  const from = dayKey(today) || new Date().toISOString().slice(0, 10);
  const to = addDays(from, Math.max(0, days - 1));
  const byId = new Map((people || []).map((row) => [row.id, row]));
  const out = [];
  for (const raw of notices || []) {
    const employee = byId.get(text(raw?.employeeId));
    if (!employee) continue;
    const start = dayKey(raw.fromDate);
    const end = dayKey(raw.toDate) || start;
    if (!start || end < from || start > to) continue;
    out.push({
      id: text(raw.id) || `${employee.id}_${start}`,
      employee,
      employeeId: employee.id,
      name: displayName(employee),
      fromDate: start,
      toDate: end,
      note: text(raw.note),
      today: start <= from && end >= from,
      startsIn: Math.max(0, daysBetween(from, start) ?? 0),
    });
  }
  return out.sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.name.localeCompare(b.name, 'nb'));
}

/** Alt oversikten trenger. hr er HR-tilstanden (compliance, hmsCards, cases, hmsRequired). */
export function innleieDashboard(employees, hr = {}, { notices = [], today = '', status = 'active' } = {}) {
  const now = dayKey(today) || new Date().toISOString().slice(0, 10);
  const people = hiredPeople(employees, status);
  const rows = people.map((employee) => {
    const kindLabel = hrKindLabel(employee);
    const cells = hiredCells(employee, kindLabel, hr);
    const end = dayKey(employee?.company?.periodTo);
    const endsIn = end ? daysBetween(now, end) : null;
    return {
      employee,
      id: employee.id,
      name: displayName(employee),
      title: text(employee?.company?.title),
      kindLabel,
      cells,
      openCases: (hr.cases || []).filter((row) => row.employeeId === employee.id && row.status !== 'closed').length,
      endDate: end,
      endsIn,
    };
  });

  const lawTotal = rows.reduce((n, row) => n + row.cells.summary.lawTotal, 0);
  const lawOk = rows.reduce((n, row) => n + row.cells.summary.lawOk, 0);
  // Bare lovkrav som er påkrevd for personen telles som mangel.
  const gaps = HIRED_CATALOG
    .filter((cat) => cat.level === 'law')
    .map((cat) => {
      const ids = rows
        .filter((row) => row.cells.summary.lawGapIds.includes(cat.id))
        .map((row) => row.id);
      return { id: cat.id, label: cat.label, short: cat.short, count: ids.length, employeeIds: ids };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  const notApplicable = (hr.compliance || [])
    .filter((row) => row.catalogId === 'inn_hms_card' && row.status === 'na')
    .map((row) => row.employeeId);
  const away = awayRows(notices, people, { today: now, days: 7 });

  return {
    total: rows.length,
    innleid: rows.filter((row) => row.kindLabel === 'Innleid').length,
    ekstern: rows.filter((row) => row.kindLabel !== 'Innleid').length,
    counts: {
      active: hiredPeople(employees, 'active').length,
      inactive: hiredPeople(employees, 'inactive').length,
    },
    rows: rows.sort((a, b) => (
      b.cells.summary.lawMissing - a.cells.summary.lawMissing || a.name.localeCompare(b.name, 'nb')
    )),
    law: { ok: lawOk, total: lawTotal, pct: lawTotal ? Math.round((lawOk / lawTotal) * 100) : 100 },
    peopleWithGaps: rows.filter((row) => row.cells.summary.lawMissing > 0).length,
    gaps,
    away,
    awayToday: away.filter((row) => row.today),
    hms: hmsCardAlerts(people, hr.hmsCards || [], { today: now, notApplicable }),
    endingSoon: rows
      .filter((row) => row.endsIn != null && row.endsIn >= 0 && row.endsIn <= 30)
      .sort((a, b) => a.endsIn - b.endsIn),
  };
}
