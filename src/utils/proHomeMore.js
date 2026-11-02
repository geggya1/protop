/**
 * Ren logikk bak de nye ProTop-widgetene på Hjem: dagsbåndet i «Dagen din», uka i
 * stolper, fokusøkt, nedtelling til fri, mva-regning, fravær i dag, jubileer, anbud,
 * godkjenning av timer og mine RUH. Uten React og Firebase, så node-testene kan lese den.
 */
import { isoDay, weekDays, isoWeekNumber } from './proHome.js';
import { norwegianHolidays } from '../arbeid/holidays.js';

const DAY_NAMES = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const DAY_LONG = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

function minutesOf(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/* ------------------------------------------------------------------ */
/* Dagen din: dagsbånd                                                 */
/* ------------------------------------------------------------------ */

/**
 * Arbeidsdagen som et bånd fra `startHour` til `endHour`. Avtaler med klokkeslett
 * plasseres som blokker (from/to i andel av båndet), «nå» som en strek.
 * Avtaler utenfor arbeidstid utvider båndet, så ingenting faller utenfor.
 */
export function dayRibbon(events = [], { now = new Date(), startHour = 7, endHour = 17, showNow = true } = {}) {
  const timed = [];
  let allDay = 0;
  (events || []).forEach((ev, i) => {
    const s = minutesOf(ev?.time);
    if (s == null) {
      allDay += 1;
      return;
    }
    const e = minutesOf(ev?.end);
    timed.push({
      id: ev.id || `ev-${i}`,
      title: ev.title || 'Avtale',
      start: s,
      end: e != null && e > s ? e : s + 60,
      color: ev.color || null,
      raw: ev.event || ev.raw || null,
    });
  });
  let from = startHour * 60;
  let to = endHour * 60;
  timed.forEach((ev) => {
    from = Math.min(from, Math.floor(ev.start / 60) * 60);
    to = Math.max(to, Math.ceil(ev.end / 60) * 60);
  });
  to = Math.min(to, 24 * 60);
  const span = Math.max(60, to - from);
  const blocks = timed
    .sort((a, b) => a.start - b.start)
    .map((ev) => ({
      ...ev,
      from: clamp((ev.start - from) / span, 0, 1),
      to: clamp((ev.end - from) / span, 0, 1),
    }));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowRatio = showNow && nowMin >= from && nowMin <= to ? (nowMin - from) / span : null;
  // Hver annen time; siste merke bare når det ikke står oppå det forrige.
  const ticks = [];
  const firstHour = Math.ceil(from / 60);
  const lastHour = Math.floor(to / 60);
  const tick = (h) => ({ hour: h, label: String(h).padStart(2, '0'), at: (h * 60 - from) / span });
  for (let h = firstHour; h <= lastHour; h += 2) ticks.push(tick(h));
  if (ticks.length && lastHour - ticks[ticks.length - 1].hour >= 2) ticks.push(tick(lastHour));
  const busyMin = blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
  const freeMin = Math.max(0, span - busyMin);
  return {
    blocks, nowRatio, ticks, allDay, from, to, busyMin, freeMin,
  };
}

/** «3 t 30 min» / «45 min» / «2 t». */
export function durationLabel(min) {
  const n = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m} min`;
  return m ? `${h} t ${m} min` : `${h} t`;
}

/**
 * Én setning om dagen, i stedet for tall i bokser.
 * «To avtaler og 3 t ledig. 1 oppgave har forfalt.»
 */
export function daySentence({
  events = 0, freeMin = 0, openTasks = 0, overdue = 0, focusTomorrow = false,
} = {}) {
  const when = focusTomorrow ? 'i morgen' : 'i dag';
  const parts = [];
  if (!events) parts.push(`Ingen avtaler ${when}`);
  else parts.push(`${events === 1 ? 'Én avtale' : `${events} avtaler`} ${when}`);
  if (events && freeMin >= 30) parts[0] += `, ${durationLabel(freeMin)} ledig`;
  if (overdue) parts.push(`${overdue === 1 ? 'Én oppgave' : `${overdue} oppgaver`} har forfalt`);
  else if (openTasks) parts.push(`${openTasks} ${openTasks === 1 ? 'oppgave' : 'oppgaver'} åpne`);
  return `${parts.join('. ')}.`;
}

/* ------------------------------------------------------------------ */
/* Uka: stolper per ukedag (uten datotall)                             */
/* ------------------------------------------------------------------ */

/**
 * Uka som stolper. Bare ukedagens navn, ingen datotall: det man vil vite er hvor
 * travel hver dag er. Helgen vises bare om den har avtaler.
 */
export function weekBars(counts = {}, today = new Date()) {
  const days = weekDays(today);
  const weekendBusy = days.slice(5).some((d) => Number(counts?.[d.key]) > 0);
  const shown = weekendBusy ? days : days.slice(0, 5);
  const max = Math.max(1, ...shown.map((d) => Number(counts?.[d.key]) || 0));
  const rows = shown.map((d, i) => {
    const n = Number(counts?.[d.key]) || 0;
    return {
      key: d.key,
      label: d.label,
      long: DAY_LONG[days.indexOf(d)] || DAY_LONG[i],
      count: n,
      ratio: n / max,
      isToday: d.isToday,
      past: d.past,
      weekend: d.weekend,
    };
  });
  const total = rows.reduce((sum, d) => sum + d.count, 0);
  const left = rows.filter((d) => !d.past).reduce((sum, d) => sum + d.count, 0);
  const busiest = rows.reduce((best, d) => (d.count > (best?.count || 0) ? d : best), null);
  const freeDays = rows.filter((d) => !d.past && !d.weekend && !d.count).map((d) => d.long.toLowerCase());
  let headline = 'Ingen avtaler denne uka';
  if (total) {
    headline = busiest && busiest.count > 1
      ? `Travlest ${busiest.long.toLowerCase()}`
      : `${total} ${total === 1 ? 'avtale' : 'avtaler'}`;
  }
  let hint = '';
  if (freeDays.length === 1) hint = `${freeDays[0][0].toUpperCase()}${freeDays[0].slice(1)} er ledig`;
  else if (freeDays.length > 1) hint = `${freeDays.length} ledige dager igjen`;
  return {
    days: rows, total, left, week: isoWeekNumber(today), headline, hint,
  };
}

/* ------------------------------------------------------------------ */
/* Fokusøkt                                                            */
/* ------------------------------------------------------------------ */

export const FOCUS_PRESETS = [25, 50, 90];

/**
 * Status for en fokusøkt: { running, done, leftMs, ratio, label }.
 * session: { startedAt (ms), minutes, pausedLeftMs? }.
 */
export function focusState(session, now = Date.now()) {
  if (!session || !session.minutes) {
    return { running: false, paused: false, done: false, leftMs: 0, ratio: 0, label: '' };
  }
  const total = session.minutes * 60000;
  if (session.pausedLeftMs != null) {
    const left = clamp(session.pausedLeftMs, 0, total);
    return {
      running: false, paused: true, done: false, leftMs: left, ratio: 1 - left / total, label: clockLabel(left),
    };
  }
  const left = clamp(session.startedAt + total - now, 0, total);
  return {
    running: left > 0,
    paused: false,
    done: left <= 0,
    leftMs: left,
    ratio: 1 - left / total,
    label: clockLabel(left),
  };
}

/** 25:00 / 4:05 / 1:02:00. */
export function clockLabel(ms) {
  const sec = Math.ceil(Math.max(0, Number(ms) || 0) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/* ------------------------------------------------------------------ */
/* Nedtelling: fri i dag, helg og neste fridag                         */
/* ------------------------------------------------------------------ */

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function relLabel(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d >= 2) return `${d} dager`;
  if (d === 1) return h ? `1 dag ${h} t` : '1 dag';
  if (h) return m && h < 5 ? `${h} t ${m} min` : `${h} t`;
  return `${m} min`;
}

/** Neste røde dag på en hverdag (helligdager i helg teller ikke som ekstra fri). */
export function nextHoliday(today = new Date()) {
  const key = isoDay(today);
  const list = [...norwegianHolidays(today.getFullYear()), ...norwegianHolidays(today.getFullYear() + 1)]
    .filter((h) => h.date > key)
    .filter((h) => {
      const [y, m, d] = h.date.split('-').map(Number);
      const day = new Date(y, m - 1, d).getDay();
      return day !== 0 && day !== 6;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = list[0];
  if (!next) return null;
  const [y, m, d] = next.date.split('-').map(Number);
  const at = new Date(y, m - 1, d);
  const days = Math.round((at - startOfDay(today)) / 86400000);
  return {
    name: next.name, date: next.date, days, weekday: DAY_NAMES[at.getDay()],
  };
}

/**
 * Nedtellingene: { workday, weekend, holiday }.
 * workday: tid til arbeidsdagen er slutt (bare hverdager i arbeidstid).
 * weekend: tid til fredag kl. endHour (eller «Helg nå»).
 */
export function countdowns(now = new Date(), { startHour = 7, endHour = 16 } = {}) {
  const day = now.getDay();
  const weekendNow = day === 6 || day === 0 || (day === 5 && now.getHours() >= endHour);
  let workday = null;
  if (!weekendNow && day >= 1 && day <= 5 && now.getHours() >= startHour && now.getHours() < endHour) {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, 0, 0);
    const total = (endHour - startHour) * 3600000;
    const left = end - now;
    workday = { label: relLabel(left), ratio: clamp(1 - left / total, 0, 1) };
  }
  let weekend;
  if (weekendNow) {
    weekend = { now: true, label: 'Helg nå', ratio: 1 };
  } else {
    const fri = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (5 - day), endHour, 0, 0);
    const monStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1), startHour, 0, 0);
    const left = fri - now;
    weekend = {
      now: false,
      label: relLabel(left),
      ratio: clamp((now - monStart) / (fri - monStart), 0, 1),
    };
  }
  return { workday, weekend, holiday: nextHoliday(now) };
}

/* ------------------------------------------------------------------ */
/* Mva-regner                                                          */
/* ------------------------------------------------------------------ */

export const VAT_RATES = [25, 15, 12, 0];

/** Tall fra tekst: «12 500,50» → 12500.5. */
export function parseAmount(input) {
  const raw = String(input ?? '').replace(/\s|kr/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Eks./inkl. mva: amount tolkes som `mode` ('eks' eller 'inkl'). */
export function vatSplit(amount, rate = 25, mode = 'eks') {
  const a = Math.max(0, Number(amount) || 0);
  const r = Math.max(0, Number(rate) || 0) / 100;
  const net = mode === 'inkl' ? a / (1 + r) : a;
  const gross = mode === 'inkl' ? a : a * (1 + r);
  const round = (n) => Math.round(n * 100) / 100;
  return { net: round(net), vat: round(gross - net), gross: round(gross) };
}

/** 12 500,50 kr (uten desimaler når de er null). */
export function moneyLabel(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const whole = Number.isInteger(v);
  const [int, dec] = Math.abs(v).toFixed(whole ? 0 : 2).split('.');
  const spaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${v < 0 ? '−' : ''}${spaced}${dec ? `,${dec}` : ''} kr`;
}

/* ------------------------------------------------------------------ */
/* Fravær i dag                                                        */
/* ------------------------------------------------------------------ */

const ABSENCE_LABELS = {
  ferie: 'Ferie',
  syk: 'Syk',
  sykemelding: 'Sykmeldt',
  egenmelding: 'Egenmelding',
  permisjon: 'Permisjon',
  avspasering: 'Avspasering',
  kurs: 'Kurs',
  barnsykdom: 'Barn syk',
  'barn-syk': 'Barn syk',
};

function absenceKind(row) {
  const raw = String(row?.typeLabel || row?.label || row?.type || row?.kind || '').trim();
  const key = raw.toLowerCase();
  if (ABSENCE_LABELS[key]) return ABSENCE_LABELS[key];
  if (/syk|egenm/.test(key)) return 'Syk';
  if (/ferie/.test(key)) return 'Ferie';
  if (/perm/.test(key)) return 'Permisjon';
  return raw ? raw[0].toUpperCase() + raw.slice(1) : 'Borte';
}

/** Personvern: sykdom vises som «Borte» for alle utenom egen rad. */
function visibleKind(kind, own) {
  if (own) return kind;
  return /syk|egenm|barn syk/i.test(kind) ? 'Borte' : kind;
}

function shiftKey(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + delta, 12));
}

/**
 * Hvem som er borte i dag. rows: fraværsrader, én per dag ({ employeeId, date, type }).
 * Siste dag i rekken (påfølgende dager med fravær, helg hoppes over) gir «tilbake …».
 * Fraværsårsak (syk) vises ikke for andre enn en selv.
 */
export function awayToday(rows = [], employees = [], { todayKey = isoDay(new Date()), meId = '' } = {}) {
  const byId = new Map((employees || []).map((e) => [String(e?.id || ''), e]));
  const days = new Map();
  (rows || []).forEach((row) => {
    if (!row || row.deleted) return;
    const id = String(row.employeeId || '');
    const date = String(row.date || '').slice(0, 10);
    if (!id || !date) return;
    if (!days.has(id)) days.set(id, new Map());
    days.get(id).set(date, row);
  });
  const people = [];
  days.forEach((dates, id) => {
    const row = dates.get(todayKey);
    if (!row) return;
    let last = todayKey;
    for (let i = 0; i < 60; i += 1) {
      let next = shiftKey(last, 1);
      const [y, m, d] = next.split('-').map(Number);
      const wd = new Date(y, m - 1, d).getDay();
      if (wd === 6) next = shiftKey(next, 2);
      else if (wd === 0) next = shiftKey(next, 1);
      if (!dates.has(next)) break;
      last = next;
    }
    const emp = byId.get(id);
    const name = emp ? employeeName(emp) : String(row.employeeName || 'Ansatt');
    const own = !!meId && id === meId;
    people.push({
      id,
      name,
      initials: initialsOf(name),
      kind: visibleKind(absenceKind(row), own),
      back: backLabel(last, todayKey),
      me: own,
    });
  });
  people.sort((a, b) => (a.me === b.me ? a.name.localeCompare(b.name, 'nb') : (a.me ? -1 : 1)));
  return { people, count: people.length };
}

/** Første arbeidsdag etter siste fraværsdag: «Tilbake i morgen», «Tilbake mandag», «Til 14.11.». */
function backLabel(toKey, todayKey) {
  const [y, m, d] = toKey.split('-').map(Number);
  const back = new Date(y, m - 1, d + 1, 12);
  if (back.getDay() === 6) back.setDate(back.getDate() + 2);
  else if (back.getDay() === 0) back.setDate(back.getDate() + 1);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const days = Math.round((Date.UTC(back.getFullYear(), back.getMonth(), back.getDate()) - Date.UTC(ty, tm - 1, td)) / 86400000);
  if (days === 1) return 'Tilbake i morgen';
  if (days <= 7) return `Tilbake ${DAY_NAMES[back.getDay()]}`;
  return `Til ${d}.${m}.`;
}

export function employeeName(emp) {
  const p = emp?.person || {};
  const full = [p.firstName, p.lastName].filter(Boolean).join(' ')
    || emp?.name || emp?.displayName || '';
  return String(full).trim() || 'Ansatt';
}

export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return `${parts[0][0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Jubileer og nye i bedriften                                         */
/* ------------------------------------------------------------------ */

/**
 * Fra ansattdatoen (company.periodFrom): runde år i bedriften de neste `days` dagene,
 * og dem som har begynt siste `newDays` dager. Fødselsdato brukes ikke (personvern).
 */
export function celebrations(employees = [], { today = new Date(), days = 45, newDays = 30, limit = 6 } = {}) {
  const todayStart = startOfDay(today);
  const out = [];
  (employees || []).forEach((emp) => {
    const fromKey = String(emp?.company?.periodFrom || emp?.periodFrom || '').slice(0, 10);
    const toKey = String(emp?.company?.periodTo || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey)) return;
    if (toKey && toKey < isoDay(today)) return;
    const [y, m, d] = fromKey.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    const name = employeeName(emp);
    const since = Math.round((todayStart - start) / 86400000);
    if (since >= 0 && since <= newDays) {
      out.push({
        id: `${emp.id}-new`,
        kind: 'new',
        name,
        initials: initialsOf(name),
        inDays: -since,
        label: since === 0 ? 'Begynner i dag' : `Ny siden ${d}.${m}.`,
        short: since === 0 ? 'Ny i dag' : 'Ny',
      });
      return;
    }
    if (since < 0 && since >= -newDays) {
      out.push({
        id: `${emp.id}-soon`,
        kind: 'new',
        name,
        initials: initialsOf(name),
        inDays: -since,
        label: `Begynner ${d}.${m}.`,
        short: `Fra ${d}.${m}.`,
      });
      return;
    }
    let years = today.getFullYear() - y;
    let next = new Date(today.getFullYear(), m - 1, d);
    if (next < todayStart) {
      next = new Date(today.getFullYear() + 1, m - 1, d);
      years += 1;
    }
    const inDays = Math.round((next - todayStart) / 86400000);
    if (years < 1 || inDays > days) return;
    out.push({
      id: `${emp.id}-${years}`,
      kind: 'anniversary',
      name,
      initials: initialsOf(name),
      years,
      round: years % 5 === 0,
      inDays,
      label: `${years} år i bedriften${inDays === 0 ? ' i dag' : (inDays === 1 ? ' i morgen' : ` om ${inDays} dager`)}`,
      short: `${years} år${inDays === 0 ? ' i dag' : (inDays === 1 ? ' i morgen' : ` om ${inDays} d`)}`,
    });
  });
  out.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name, 'nb'));
  return { items: out.slice(0, limit), total: out.length };
}

/* ------------------------------------------------------------------ */
/* Anbud                                                               */
/* ------------------------------------------------------------------ */

function deadlineKey(notice) {
  return String(notice?.dossier?.submissionDeadline || notice?.deadline || '').slice(0, 10);
}

function daysUntil(key, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - startOfDay(today)) / 86400000);
}

/**
 * Anbudene på Hjem: nye treff siste uke som ikke er vurdert, og fristene for
 * konkurranser man vurderer eller jobber med (nærmeste først).
 */
export function tenderPeek(state, { today = new Date(), limit = 3, newDays = 7 } = {}) {
  const notices = Array.isArray(state?.notices) ? state.notices : [];
  const todayKey = isoDay(today);
  const since = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - newDays));
  const fresh = notices.filter((n) => {
    const decision = n?.decision || 'ubestemt';
    const pub = String(n?.publishedAt || '').slice(0, 10);
    const dl = deadlineKey(n);
    return decision === 'ubestemt' && pub >= since && (!dl || dl >= todayKey);
  });
  const active = notices
    .filter((n) => ['aktuell', 'tilbud'].includes(String(n?.decision || '')))
    .map((n) => ({ n, dl: deadlineKey(n) }))
    .filter((row) => row.dl && row.dl >= todayKey);
  const freshRows = fresh.map((n) => ({ n, dl: deadlineKey(n) }));
  const rows = [...active, ...freshRows]
    .sort((a, b) => (a.dl || '9999').localeCompare(b.dl || '9999'))
    .slice(0, limit)
    .map(({ n, dl }) => {
      const left = daysUntil(dl, today);
      return {
        id: n.id,
        title: n.title || 'Kunngjøring',
        buyer: n.buyer || '',
        deadline: dl,
        left,
        urgent: left != null && left <= 3,
        status: n.decision === 'tilbud' ? 'Tilbud' : (n.decision === 'aktuell' ? 'Aktuell' : 'Ny'),
        leftLabel: left == null ? 'Ingen frist' : (left === 0 ? 'Frist i dag' : (left === 1 ? 'Frist i morgen' : `${left} dager`)),
      };
    });
  return { rows, fresh: fresh.length, following: active.length };
}

/* ------------------------------------------------------------------ */
/* Godkjenning av timer (ledere)                                       */
/* ------------------------------------------------------------------ */

/**
 * Timer som venter på godkjenning: alt som er ført, men ikke godkjent eller låst.
 * Gruppert per ansatt, flest timer først.
 */
export function approvalSummary(rows = [], employees = [], { limit = 4 } = {}) {
  const byId = new Map((employees || []).map((e) => [String(e?.id || ''), e]));
  const per = new Map();
  let hours = 0;
  (rows || []).forEach((row) => {
    const status = String(row?.status || '');
    if (status === 'godkjent' || status === 'låst' || status === 'planlagt' || row?.deleted) return;
    const h = Number(String(row?.hours ?? '').replace(',', '.')) || 0;
    if (h <= 0) return;
    const id = String(row.employeeId || '');
    if (!id) return;
    hours += h;
    const cur = per.get(id) || { id, hours: 0, entries: 0 };
    cur.hours += h;
    cur.entries += 1;
    per.set(id, cur);
  });
  const people = [...per.values()]
    .sort((a, b) => b.hours - a.hours)
    .map((p) => {
      const emp = byId.get(p.id);
      const name = emp ? employeeName(emp) : 'Ansatt';
      return { ...p, hours: Math.round(p.hours * 10) / 10, name, initials: initialsOf(name) };
    });
  return {
    people: people.slice(0, limit),
    more: Math.max(0, people.length - limit),
    count: people.length,
    hours: Math.round(hours * 10) / 10,
  };
}

/* ------------------------------------------------------------------ */
/* Mine RUH og avvik                                                   */
/* ------------------------------------------------------------------ */

const CLOSED = new Set(['lukket', 'kansellert']);
const STATE_LABEL = {
  registrert: 'Meldt',
  triage: 'Vurderes',
  vurdert: 'Vurdert',
  apen: 'Tiltak',
  tiltak: 'Tiltak',
  til_verifisering: 'Kontrolleres',
  returnert: 'Returnert',
  verifisert: 'Kontrollert',
  effektkontroll: 'Effektkontroll',
  lukket: 'Lukket',
  kansellert: 'Avsluttet',
};

/** Egne meldinger (avvik og RUH): åpne først, nyeste øverst. */
export function myReportsSummary(reports = [], { limit = 3 } = {}) {
  const list = (reports || []).filter(Boolean).map((r) => {
    const state = String(r.state || 'registrert');
    return {
      id: r.id,
      number: r.number || '',
      title: String(r.title || 'Melding').split('\n')[0].slice(0, 90),
      open: !CLOSED.has(state),
      state,
      statusLabel: STATE_LABEL[state] || 'Meldt',
      date: String(r.reportedAt || r.occurredAt || '').slice(0, 10),
    };
  });
  list.sort((a, b) => (a.open === b.open ? String(b.date).localeCompare(String(a.date)) : (a.open ? -1 : 1)));
  return {
    items: list.slice(0, limit),
    open: list.filter((r) => r.open).length,
    total: list.length,
  };
}
