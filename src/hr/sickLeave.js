/**
 * Frister ved sykefravær (arbeidsmiljøloven § 4-6 og folketrygdloven § 8-7 a), regnet ut fra
 * fraværet som er registrert under Fravær.
 *
 * Et sykefraværstilfelle er sammenhengende sykefravær for én ansatt. Er personen tilbake i mindre
 * enn 16 dager før neste sykefravær, regnes det som samme tilfelle (samme regel som NAV bruker for
 * arbeidsgiverperioden). Fristene regnes fra første fraværsdag.
 *
 * Det HR har gjort (oppfølgingsplan laget, møte holdt, ikke nødvendig) lagres i hr.sickFollowUps.
 * Oppgavene i oppgavemodulen er synlige for flere enn HR, så de har nøytral tittel, uten navn
 * og uten ansatt-id. Navn og detaljer står bare i HR.
 */
import { isParentTaskOpen } from '../utils/parentTasks.js';

export const SICK_SOURCE = 'hr-sick-followup';

/** Fraværstyper som er egen sykdom (ikke sykt barn). */
export const SICK_TYPES = new Set(['syk_melding', 'egenmelding', 'sykdom', 'syk_uten']);

/** Opphold på inntil så mange dager gir samme sykefraværstilfelle. */
export const SAME_CASE_GAP_DAYS = 16;

/** lead: dager før fristen oppgaven lages og fristen vises som «snart». */
export const SICK_MILESTONES = [
  {
    id: 'plan',
    label: 'Oppfølgingsplan',
    days: 28,
    lead: 14,
    law: 'Arbeidsmiljøloven § 4-6 (3)',
    todo: 'Lag oppfølgingsplan sammen med den sykmeldte innen 4 uker, og send den til sykmelder. Trengs ikke når det er åpenbart unødvendig.',
  },
  {
    id: 'dm1',
    label: 'Dialogmøte 1',
    days: 49,
    lead: 14,
    law: 'Arbeidsmiljøloven § 4-6 (4)',
    todo: 'Kall inn til dialogmøte 1 innen 7 uker. Sykmelder deltar om det er ønsket. Trengs ikke når det er åpenbart unødvendig.',
  },
  {
    id: 'dm2',
    label: 'Dialogmøte 2 (NAV)',
    days: 182,
    lead: 28,
    law: 'Folketrygdloven § 8-7 a',
    todo: 'NAV kaller inn til dialogmøte 2 innen 26 uker. Oppdater oppfølgingsplanen og send den til NAV senest en uke før møtet.',
  },
];

const DAY = 86400000;

function text(value) {
  return String(value ?? '').trim();
}

function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(iso));
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY) : null;
}

function isoFromDay(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const n = dayNumber(iso);
  return n == null ? '' : isoFromDay(n + days);
}

function todayIso(today) {
  if (typeof today === 'string' && dayNumber(today) != null) return today.slice(0, 10);
  const d = today instanceof Date ? today : new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO-dato fra fraværsraden («dd.mm.åååå» fra import godtas). */
function rowDate(row) {
  const raw = text(row?.date);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

function isSick(row) {
  return SICK_TYPES.has(text(row?.type)) && text(row?.status) !== 'avslått';
}

/**
 * Sykefraværstilfeller per ansatt: { key, employeeId, start, end, days }.
 * days er antall registrerte fraværsdager i tilfellet.
 */
export function sickCases(absences, { gapDays = SAME_CASE_GAP_DAYS } = {}) {
  const byEmployee = new Map();
  for (const row of Array.isArray(absences) ? absences : []) {
    if (!isSick(row)) continue;
    const emp = text(row.employeeId);
    const date = rowDate(row);
    if (!emp || !date) continue;
    if (!byEmployee.has(emp)) byEmployee.set(emp, new Set());
    byEmployee.get(emp).add(date);
  }
  const out = [];
  for (const [employeeId, set] of byEmployee) {
    const dates = [...set].sort();
    let current = null;
    for (const date of dates) {
      const n = dayNumber(date);
      // Opphold: dager uten fravær mellom forrige og denne. 16 dager i arbeid = samme tilfelle.
      if (current && n - dayNumber(current.end) - 1 <= gapDays) {
        current.end = date;
        current.days += 1;
        continue;
      }
      current = { employeeId, start: date, end: date, days: 1 };
      out.push(current);
    }
  }
  return out.map((row) => ({ ...row, key: caseKey(row.employeeId, row.start) }))
    .sort((a, b) => b.start.localeCompare(a.start) || a.employeeId.localeCompare(b.employeeId));
}

export function caseKey(employeeId, start) {
  return `${text(employeeId)}_${text(start).slice(0, 10)}`;
}

export function normalizeSickFollowUp(row = {}) {
  const marks = {};
  const src = row.marks && typeof row.marks === 'object' ? row.marks : {};
  for (const m of SICK_MILESTONES) {
    const v = src[m.id];
    if (!v || typeof v !== 'object') continue;
    const status = v.status === 'na' ? 'na' : v.status === 'done' ? 'done' : '';
    if (!status) continue;
    marks[m.id] = { status, date: text(v.date).slice(0, 10), by: text(v.by) };
  }
  return {
    id: text(row.id) || caseKey(row.employeeId, row.start),
    employeeId: text(row.employeeId),
    start: text(row.start).slice(0, 10),
    marks,
    note: text(row.note).slice(0, 2000),
    updatedAt: text(row.updatedAt) || new Date().toISOString(),
  };
}

/** Siste sykedag minst så nær i dag regnes som pågående (helg og registrering dagen etter). */
const ACTIVE_DAYS = 3;

/**
 * Status for én frist i et tilfelle:
 *   done / na   HR har markert den
 *   unknown     tilfellet startet før fraværet som er hentet, så fristen kan ikke regnes ut
 *   paused      personen er tilbake i arbeid før fristen (kan bli syk igjen innen 16 dager)
 *   notNeeded   personen har vært tilbake i mer enn 16 dager
 *   overdue     fristen er passert mens personen var syk
 *   soon        innen lead dager, og personen er syk nå
 *   later       senere
 */
export function milestoneStatus(milestone, sickCase, followUp, today) {
  const mark = followUp?.marks?.[milestone.id];
  if (mark?.status) return mark.status;
  if (sickCase.truncated) return 'unknown';
  const due = dayNumber(addDays(sickCase.start, milestone.days));
  const t = dayNumber(today);
  const end = dayNumber(sickCase.end);
  const back = t - end;
  const active = end >= t - ACTIVE_DAYS;
  if (t > due) {
    if (end < due) return back > SAME_CASE_GAP_DAYS ? 'notNeeded' : 'paused';
    return back > SAME_CASE_GAP_DAYS ? 'notNeeded' : 'overdue';
  }
  if (t >= due - milestone.lead) {
    if (active) return 'soon';
    return back > SAME_CASE_GAP_DAYS ? 'notNeeded' : 'paused';
  }
  return 'later';
}

/**
 * Tilfeller HR skal følge opp nå: pågår og har vart minst 14 dager, eller har en frist som er
 * snart eller passert. Hver rad har fristene med dato og status.
 */
export function sickFollowUpRows(absences, followUps, {
  today = new Date(), employees = [], all = false, windowStart = '',
} = {}) {
  const t = todayIso(today);
  const saved = (followUps || []).map((row) => normalizeSickFollowUp(row));
  const byKey = new Map(saved.map((n) => [n.id, n]));
  // Registreres en tidligere sykedag i ettertid, flytter starten seg. Markeringene følger da med:
  // et lagret tilfelle for samme person med start innenfor dette tilfellet hører til det.
  const followUpFor = (c) => byKey.get(c.key)
    || saved.find((f) => f.employeeId === c.employeeId && f.start >= c.start && f.start <= c.end)
    || null;
  const names = new Map((employees || []).map((e) => [text(e?.id), e]));
  const rows = [];
  for (const sickCase of sickCases(absences)) {
    if (sickCase.start > t) continue;
    // Tilfellet kan ha startet før fraværet som er hentet: da er starten (og fristene) ukjent.
    if (windowStart && dayNumber(sickCase.start) - dayNumber(windowStart) <= SAME_CASE_GAP_DAYS) sickCase.truncated = true;
    const followUp = followUpFor(sickCase);
    const lastDay = sickCase.end < t ? sickCase.end : t;
    const length = dayNumber(lastDay) - dayNumber(sickCase.start) + 1;
    const milestones = SICK_MILESTONES.map((m) => ({
      ...m,
      due: addDays(sickCase.start, m.days),
      status: milestoneStatus(m, sickCase, followUp, t),
      mark: followUp?.marks?.[m.id] || null,
    }));
    const open = milestones.some((m) => ['overdue', 'soon'].includes(m.status));
    const ongoing = dayNumber(sickCase.end) >= dayNumber(t) - SAME_CASE_GAP_DAYS;
    // all: alle tilfeller (til oppgavene, så oppgaver for avsluttede tilfeller også lukkes).
    if (!all && !open && !(ongoing && length >= 14)) continue;
    rows.push({
      ...sickCase,
      ongoing,
      length,
      employee: names.get(sickCase.employeeId) || null,
      followUp,
      // Oppgavene følger det lagrede tilfellet, så id-en ikke endres når starten flytter seg.
      taskKey: followUp ? caseKey(followUp.employeeId, followUp.start) : sickCase.key,
      milestones,
      next: milestones.find((m) => ['overdue', 'soon', 'later'].includes(m.status)) || null,
    });
  }
  const rank = (row) => {
    if (row.milestones.some((m) => m.status === 'overdue')) return 0;
    if (row.milestones.some((m) => m.status === 'soon')) return 1;
    return 2;
  };
  return rows.sort((a, b) => rank(a) - rank(b) || a.start.localeCompare(b.start));
}

/** Marker en frist som gjort, ikke nødvendig, eller fjern markeringen (status ''). */
export function markSickMilestone(list, sickCase, milestoneId, status, { by = '', today = new Date() } = {}) {
  const rows = (Array.isArray(list) ? list : []).map((row) => normalizeSickFollowUp(row));
  const key = sickCase.followUp?.id || caseKey(sickCase.employeeId, sickCase.start);
  const idx = rows.findIndex((row) => row.id === key);
  const base = idx >= 0 ? rows[idx] : normalizeSickFollowUp({ employeeId: sickCase.employeeId, start: sickCase.start });
  const marks = { ...base.marks };
  if (status === 'done' || status === 'na') marks[milestoneId] = { status, date: todayIso(today), by: text(by) };
  else delete marks[milestoneId];
  const next = { ...base, marks, updatedAt: new Date().toISOString() };
  if (idx >= 0) rows[idx] = next;
  else rows.unshift(next);
  return rows;
}

function fnv(value, seed) {
  let h = seed >>> 0;
  for (const ch of String(value)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Hemmelig nøkkel for oppgave-id-ene, lagret i HR (hr.settings.sickSalt), som bare HR leser. */
export function newSickSalt() {
  const bytes = new Uint8Array(16);
  const c = globalThis.crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stabil id for oppgaven, uten ansatt-id i klartekst. Oppgaver kan leses av hele bedriften, og
 * ansattlisten også, så id-en blandes med en hemmelig nøkkel som bare HR har. Uten nøkkelen kan
 * ingen regne seg fram til hvem oppgaven gjelder.
 */
export function sickTaskId(row, milestoneId, salt = '') {
  const key = `${text(salt)}|${row.taskKey || caseKey(row.employeeId, row.start)}`;
  return `sick_${fnv(key, 0x811c9dc5)}${fnv(key, 0x050c5d1f)}_${milestoneId}`;
}

/** Oppgaven til HR. Ingen navn eller ansatt-id: oppgaver kan ses av flere enn HR. */
export function sickTask(milestone, { uid = '', today = new Date() } = {}) {
  return {
    title: `Frist i sykefraværsoppfølging: ${milestone.label.toLowerCase()}`,
    description: `${milestone.todo}\nGrunnlag: ${milestone.law}.\nHvem det gjelder, står under HR → Oppfølging → Sykefravær. Marker fristen der når den er gjort, så lukkes oppgaven.`,
    deadline: milestone.due,
    deadlineTime: null,
    participants: [],
    assignedTo: text(uid) || null,
    attachments: [],
    done: false,
    active: true,
    deleted: false,
    type: 'task',
    completedDates: [],
    createdBy: text(uid) || null,
    startKey: todayIso(today),
    order: 0,
    source: SICK_SOURCE,
  };
}

/**
 * Hva som skal gjøres med oppgavene nå. rows: alle tilfeller (sickFollowUpRows med all: true).
 *   create  [{ id, milestone }] for frister som er snart eller passert, uten oppgave
 *   close   åpne oppgaver der fristen er markert eller ikke lenger trengs
 *   stale   åpne oppgaver som ikke hører til noe tilfelle (fraværet er endret eller slettet, eller
 *           tilfellet startet før fraværet som er hentet). Lukkes med closedReason 'stale'.
 *   reopen  oppgaver lukket som 'stale' der fristen likevel er snart eller passert
 * Kall bare med fullstendig lastet fravær (loadAbsences strict).
 */
export function sickTaskPlan(rows, tasks, { salt = '' } = {}) {
  const byId = new Map((Array.isArray(tasks) ? tasks : []).filter((t) => t?.id).map((t) => [t.id, t]));
  const open = (task) => task && task.deleted !== true && isParentTaskOpen(task);
  const create = [];
  const close = [];
  const reopen = [];
  const keep = new Set();
  for (const row of rows || []) {
    for (const m of row.milestones) {
      const id = sickTaskId(row, m.id, salt);
      const task = byId.get(id);
      if (['soon', 'overdue'].includes(m.status)) {
        keep.add(id);
        if (!task) create.push({ id, milestone: m });
        // Lukket fordi den så utdatert ut (f.eks. etter et ufullstendig fravær), men fristen gjelder:
        // åpnes igjen. En oppgave noen har krysset av selv, står.
        else if (!open(task) && task.closedReason === 'stale') reopen.push(task);
      } else if (['paused', 'later'].includes(m.status)) {
        // Frist som kan komme tilbake: oppgaven står.
        keep.add(id);
      } else if (['done', 'na', 'notNeeded'].includes(m.status) && open(task)) {
        close.push(task);
      }
      // unknown: ikke beholdt, så en åpen oppgave lukkes som utdatert (stale) under.
    }
  }
  const closing = new Set(close.map((t) => t.id));
  const stale = [];
  for (const task of byId.values()) {
    if (task.source === SICK_SOURCE && open(task) && !keep.has(task.id) && !closing.has(task.id)) stale.push(task);
  }
  return { create, close, stale, reopen };
}
