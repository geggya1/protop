/**
 * Møter: datamodell og rene hjelpere.
 *
 * Et møte har en dagsorden (kapitler med punkter), deltakere med rolle og oppmøte,
 * og et referat som bygges av notater, beslutninger og oppfølgingspunkter per punkt.
 * Fast møte hører til en serie og får løpenummer (Møte 1, 2, 3 …). Åpne
 * oppfølgingspunkter følger med til neste møte i serien.
 *
 * Livsløpet speiler fakturaen: utkast → innkalt → pågår → ferdigstilt (låst) → sendt.
 * Avlyst er en egen slutt. «Til referat» er avledet: møtet er holdt, men ikke ferdigstilt.
 */

export const MEETING_STATUSES = [
  { id: 'utkast', label: 'Utkast', tone: 'muted' },
  { id: 'innkalt', label: 'Innkalt', tone: 'info' },
  { id: 'pagar', label: 'Pågår', tone: 'live' },
  { id: 'ferdigstilt', label: 'Ferdigstilt', tone: 'success' },
  { id: 'sendt', label: 'Referat sendt', tone: 'success' },
  { id: 'avlyst', label: 'Avlyst', tone: 'danger' },
];

const STATUS_IDS = new Set(MEETING_STATUSES.map((row) => row.id));

/** Avledet fase til lister og merkelapper. */
export const MEETING_PHASES = {
  utkast: { label: 'Utkast', tone: 'muted' },
  innkalt: { label: 'Innkalt', tone: 'info' },
  idag: { label: 'I dag', tone: 'info' },
  pagar: { label: 'Pågår', tone: 'live' },
  referat: { label: 'Til referat', tone: 'warn' },
  ferdigstilt: { label: 'Ferdigstilt', tone: 'success' },
  sendt: { label: 'Referat sendt', tone: 'success' },
  avlyst: { label: 'Avlyst', tone: 'danger' },
  utenDato: { label: 'Uten dato', tone: 'muted' },
};

export const PARTICIPANT_ROLES = [
  { id: 'leder', label: 'Møteleder', short: 'Leder' },
  { id: 'referent', label: 'Referent', short: 'Referent' },
  { id: 'deltaker', label: 'Deltaker', short: 'Deltaker' },
  { id: 'kopi', label: 'Kopi av referat', short: 'Kopi' },
];

const ROLE_IDS = new Set(PARTICIPANT_ROLES.map((row) => row.id));

export const ATTENDANCE = [
  { id: 'ukjent', label: 'Ikke registrert', short: '–' },
  { id: 'tilstede', label: 'Til stede', short: 'T' },
  { id: 'forfall', label: 'Meldt forfall', short: 'F' },
  { id: 'fravaer', label: 'Ikke møtt', short: 'IM' },
];

const ATTENDANCE_IDS = new Set(ATTENDANCE.map((row) => row.id));

export const VISIBILITY = [
  { id: 'alle', label: 'Alle i bedriften', hint: 'Alle med tilgang til Møter ser møtet og referatet.' },
  { id: 'deltakere', label: 'Bare deltakerne', hint: 'Bare deltakerne og bedriftens administratorer ser møtet.' },
];

export const RECURRENCE = [
  { id: 'none', label: 'Enkeltmøte', short: 'Én gang' },
  { id: 'weekly', label: 'Hver uke', short: 'Ukentlig' },
  { id: 'biweekly', label: 'Annenhver uke', short: 'Hver 2. uke' },
  { id: 'monthly', label: 'Hver måned', short: 'Månedlig' },
  { id: 'quarterly', label: 'Hvert kvartal', short: 'Kvartalsvis' },
];

const RECURRENCE_IDS = new Set(RECURRENCE.map((row) => row.id));

export const WEEKDAYS_SHORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
export const WEEKDAYS_LONG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const MONTHS_SHORT = ['jan', 'feb', 'mars', 'apr', 'mai', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'des'];
export const MONTHS_LONG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

export function text(value) {
  return String(value ?? '').trim();
}

export function createMeetingId(prefix = 'mote') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function intOr(value, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

/* ───────── Dato og tid ───────── */

export function isoDate(value) {
  const raw = text(value);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return '';
}

export function clockTime(value) {
  const raw = text(value).replace('.', ':');
  const m = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function todayOslo(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function dateParts(iso) {
  const m = isoDate(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]) - 1, d: Number(m[3]) };
}

/** Lokal dato uten tidssone-glipp (kl. 12 midt på dagen). */
export function dateFromIso(iso) {
  const p = dateParts(iso);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.mo, p.d, 12));
}

export function isoFromDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(iso, days) {
  const d = dateFromIso(iso);
  if (!d) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return isoFromDate(d);
}

export function addMonths(iso, months) {
  const p = dateParts(iso);
  if (!p) return '';
  const last = new Date(Date.UTC(p.y, p.mo + months + 1, 0, 12)).getUTCDate();
  return isoFromDate(new Date(Date.UTC(p.y, p.mo + months, Math.min(p.d, last), 12)));
}

export function daysBetween(fromIso, toIso) {
  const a = dateFromIso(fromIso);
  const b = dateFromIso(toIso);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export function weekdayOf(iso) {
  const d = dateFromIso(iso);
  return d ? d.getUTCDay() : null;
}

export function minutesOf(clock) {
  const c = clockTime(clock);
  if (!c) return null;
  const [h, m] = c.split(':').map(Number);
  return h * 60 + m;
}

export function clockFromMinutes(total) {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** «tirsdag 11. februar 2025» */
export function longDate(iso) {
  const p = dateParts(iso);
  if (!p) return '';
  const wd = WEEKDAYS_LONG[weekdayOf(iso)];
  return `${wd} ${p.d}. ${MONTHS_LONG[p.mo]} ${p.y}`;
}

/** «11. feb. 2025» */
export function shortDate(iso) {
  const p = dateParts(iso);
  if (!p) return '';
  const mo = MONTHS_SHORT[p.mo];
  return `${p.d}. ${mo}${mo.length <= 3 ? '.' : ''} ${p.y}`;
}

/** «kl. 10.00–11.30» */
export function timeRange(start, end) {
  const s = clockTime(start);
  const e = clockTime(end);
  if (!s) return '';
  const dot = (c) => c.replace(':', '.');
  return e ? `kl. ${dot(s)}–${dot(e)}` : `kl. ${dot(s)}`;
}

export function durationLabel(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (!m) return '0 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} t ${rest} min` : `${h} t`;
}

/** Lengde på møtet i minutter fra start/slutt, eller null. */
export function meetingLength(meeting) {
  const s = minutesOf(meeting?.start);
  const e = minutesOf(meeting?.end);
  if (s == null || e == null) return null;
  return e > s ? e - s : null;
}

/* ───────── Normalisering ───────── */

export function normalizeAction(raw = {}) {
  return {
    id: text(raw.id) || createMeetingId('akt'),
    text: text(raw.text),
    assigneeId: text(raw.assigneeId),
    assigneeName: text(raw.assigneeName),
    due: isoDate(raw.due),
    done: !!raw.done,
    doneAt: text(raw.doneAt),
    /** Møtet punktet først ble registrert i (følger med i serien). */
    originMeetingId: text(raw.originMeetingId),
    originNumber: intOr(raw.originNumber, 0),
    originDate: isoDate(raw.originDate),
    createdAt: text(raw.createdAt),
  };
}

export function normalizeDecision(raw = {}) {
  return {
    id: text(raw.id) || createMeetingId('bes'),
    text: text(raw.text),
  };
}

export function normalizeAttachment(raw = {}) {
  return {
    id: text(raw.id) || createMeetingId('vdl'),
    name: text(raw.name) || 'Vedlegg',
    url: text(raw.url),
    size: Math.max(0, intOr(raw.size, 0)),
  };
}

export function normalizeItem(raw = {}) {
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    id: text(raw.id) || createMeetingId('pkt'),
    title: text(raw.title),
    /** Forberedelse og bakgrunn. Følger med til neste møte i serien. */
    description: String(raw.description ?? '').replace(/\s+$/, ''),
    /** Hva som ble sagt. Nullstilles i neste møte. */
    notes: String(raw.notes ?? '').replace(/\s+$/, ''),
    presenterId: text(raw.presenterId),
    minutes: Math.max(0, Math.min(600, intOr(raw.minutes, 0))),
    decisions: list(raw.decisions).map(normalizeDecision).filter((row) => row.text),
    actions: list(raw.actions).map(normalizeAction).filter((row) => row.text),
    attachments: list(raw.attachments).map(normalizeAttachment).filter((row) => row.url || row.name),
    /** Punktet er hentet fra forrige møte i serien. */
    carried: !!raw.carried,
    done: !!raw.done,
    updatedAt: text(raw.updatedAt),
  };
}

export function normalizeChapter(raw = {}) {
  return {
    id: text(raw.id) || createMeetingId('kap'),
    title: text(raw.title),
    items: (Array.isArray(raw.items) ? raw.items : []).map(normalizeItem),
  };
}

export function normalizeParticipant(raw = {}) {
  return {
    id: text(raw.id) || createMeetingId('dlt'),
    employeeId: text(raw.employeeId),
    uid: text(raw.uid),
    name: text(raw.name) || text(raw.email) || 'Uten navn',
    company: text(raw.company),
    email: text(raw.email).toLowerCase(),
    phone: text(raw.phone),
    title: text(raw.title),
    photoUrl: text(raw.photoUrl),
    role: ROLE_IDS.has(raw.role) ? raw.role : 'deltaker',
    attendance: ATTENDANCE_IDS.has(raw.attendance) ? raw.attendance : 'ukjent',
    /** Innkalles til neste møte i serien. */
    inviteNext: raw.inviteNext !== false,
    external: !!raw.external || (!raw.employeeId && !raw.uid),
  };
}

function normalizeDelivery(raw = {}) {
  return {
    kind: ['referat', 'avlysning'].includes(raw.kind) ? raw.kind : 'innkalling',
    at: text(raw.at),
    by: text(raw.by),
    byName: text(raw.byName),
    to: (Array.isArray(raw.to) ? raw.to : []).map((row) => text(row).toLowerCase()).filter(Boolean),
    channel: text(raw.channel) || 'epost',
    revision: intOr(raw.revision, 0),
  };
}

function normalizeArchived(raw = {}) {
  return {
    revision: intOr(raw.revision, 1),
    name: text(raw.name),
    url: text(raw.url),
    storagePath: text(raw.storagePath),
    size: Math.max(0, intOr(raw.size, 0)),
    at: text(raw.at),
  };
}

function normalizeLogRow(raw = {}) {
  return {
    at: text(raw.at),
    by: text(raw.by),
    byName: text(raw.byName),
    text: text(raw.text),
  };
}

export function normalizeRecurrence(raw = {}) {
  return {
    freq: RECURRENCE_IDS.has(raw?.freq) ? raw.freq : 'none',
    until: isoDate(raw?.until),
  };
}

export function normalizeMeeting(raw = {}) {
  const list = (value) => (Array.isArray(value) ? value : []);
  const status = STATUS_IDS.has(raw.status) ? raw.status : 'utkast';
  const participants = list(raw.participants).map(normalizeParticipant);
  return {
    id: text(raw.id) || createMeetingId(),
    title: text(raw.title) || 'Møte uten tittel',
    typeId: text(raw.typeId) || 'annet',
    templateId: text(raw.templateId),
    source: text(raw.source) || 'blank',
    seriesId: text(raw.seriesId),
    number: Math.max(0, intOr(raw.number, 0)),
    projectId: text(raw.projectId),
    projectName: text(raw.projectName),
    projectNumber: text(raw.projectNumber),
    status,
    date: isoDate(raw.date),
    start: clockTime(raw.start),
    end: clockTime(raw.end),
    location: text(raw.location),
    videoUrl: text(raw.videoUrl),
    purpose: String(raw.purpose ?? '').trim(),
    visibility: raw.visibility === 'deltakere' ? 'deltakere' : 'alle',
    chapters: list(raw.chapters).map(normalizeChapter),
    participants,
    /**
     * Innloggede deltakere og den som opprettet møtet. Firestore-reglene bruker listen:
     * et møte som bare er for deltakerne, kan bare leses av dem og administratorene.
     */
    memberUids: [...new Set([text(raw.createdBy), ...participants.map((p) => p.uid)].filter(Boolean))],
    summary: String(raw.summary ?? '').trim(),
    summarySource: raw.summarySource === 'ai' ? 'ai' : (text(raw.summary) ? 'manuell' : ''),
    nextDate: isoDate(raw.nextDate),
    nextStart: clockTime(raw.nextStart),
    nextLocation: text(raw.nextLocation),
    recurrence: normalizeRecurrence(raw.recurrence),
    /** Møtet ligger i deltakernes kalender i ProTop og holdes oppdatert. */
    calendar: !!raw.calendar,
    startedAt: text(raw.startedAt),
    endedAt: text(raw.endedAt),
    finalizedAt: text(raw.finalizedAt),
    finalizedBy: text(raw.finalizedBy),
    finalizedByName: text(raw.finalizedByName),
    revision: Math.max(0, intOr(raw.revision, 0)),
    reopenReason: text(raw.reopenReason),
    cancelledAt: text(raw.cancelledAt),
    cancelReason: text(raw.cancelReason),
    deliveries: list(raw.deliveries).map(normalizeDelivery),
    /** Arkiverte PDF-er av ferdigstilt referat, én per revisjon. */
    archive: list(raw.archive).map(normalizeArchived).filter((row) => row.url || row.storagePath),
    log: list(raw.log).map(normalizeLogRow).filter((row) => row.text).slice(-80),
    createdAt: text(raw.createdAt),
    createdBy: text(raw.createdBy),
    createdByName: text(raw.createdByName),
    updatedAt: text(raw.updatedAt),
    updatedBy: text(raw.updatedBy),
  };
}

/* ───────── Nummerering og dagsorden ───────── */

export function itemNumber(chapterIndex, itemIndex) {
  return `${chapterIndex + 1}.${itemIndex + 1}`;
}

/** Flat liste over punkter med nummer, i rekkefølge. */
export function flatItems(meeting) {
  const rows = [];
  (meeting?.chapters || []).forEach((chapter, ci) => {
    (chapter.items || []).forEach((item, ii) => {
      rows.push({ chapter, chapterIndex: ci, item, itemIndex: ii, number: itemNumber(ci, ii) });
    });
  });
  return rows;
}

export function findItem(meeting, itemId) {
  return flatItems(meeting).find((row) => row.item.id === itemId) || null;
}

export function agendaMinutes(meeting) {
  return flatItems(meeting).reduce((sum, row) => sum + (row.item.minutes || 0), 0);
}

/** Starttid per punkt ut fra møtestart og varighet: { [itemId]: 'HH:MM' } */
export function itemSchedule(meeting) {
  const start = minutesOf(meeting?.start);
  if (start == null) return {};
  let at = start;
  const out = {};
  for (const row of flatItems(meeting)) {
    out[row.item.id] = clockFromMinutes(at);
    at += row.item.minutes || 0;
  }
  return out;
}

export function agendaStats(meeting) {
  let items = 0;
  let decisions = 0;
  let actions = 0;
  let openActions = 0;
  let withNotes = 0;
  let attachments = 0;
  for (const { item } of flatItems(meeting)) {
    items += 1;
    decisions += item.decisions.length;
    actions += item.actions.length;
    openActions += item.actions.filter((row) => !row.done).length;
    attachments += item.attachments.length;
    if (text(item.notes) || item.decisions.length || item.actions.length) withNotes += 1;
  }
  return { items, decisions, actions, openActions, withNotes, attachments, minutes: agendaMinutes(meeting) };
}

/* ───────── Deltakere ───────── */

export function initials(name) {
  const parts = text(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function roleLabel(id) {
  return PARTICIPANT_ROLES.find((row) => row.id === id)?.label || 'Deltaker';
}

export function attendanceLabel(id) {
  return ATTENDANCE.find((row) => row.id === id)?.label || 'Ikke registrert';
}

export function chairOf(meeting) {
  return (meeting?.participants || []).find((row) => row.role === 'leder') || null;
}

export function secretaryOf(meeting) {
  return (meeting?.participants || []).find((row) => row.role === 'referent') || null;
}

/** Deltakere som får innkalling (ikke kopimottakere). */
export function invitees(meeting) {
  return (meeting?.participants || []).filter((row) => row.role !== 'kopi');
}

/** Alle med e-post som skal ha referatet. */
export function minutesRecipients(meeting) {
  return (meeting?.participants || []).filter((row) => row.email);
}

export function attendanceCounts(meeting) {
  const counts = { ukjent: 0, tilstede: 0, forfall: 0, fravaer: 0 };
  for (const row of invitees(meeting)) counts[row.attendance] = (counts[row.attendance] || 0) + 1;
  return counts;
}

/** Om personen (uid/ansatt-id/e-post) er med i møtet. */
export function isParticipant(meeting, viewer = {}) {
  const uid = text(viewer.uid);
  const emp = text(viewer.employeeId);
  const mail = text(viewer.email).toLowerCase();
  return (meeting?.participants || []).some((row) => (
    (uid && row.uid === uid) || (emp && row.employeeId === emp) || (mail && row.email === mail)
  ));
}

/** Leder, referent eller den som opprettet møtet kan styre det. Admin kan alltid. */
export function canManageMeeting(meeting, viewer = {}) {
  if (viewer.admin) return true;
  if (!meeting) return false;
  const uid = text(viewer.uid);
  if (uid && meeting.createdBy === uid) return true;
  const emp = text(viewer.employeeId);
  const mail = text(viewer.email).toLowerCase();
  return (meeting.participants || []).some((row) => (
    (row.role === 'leder' || row.role === 'referent')
    && ((uid && row.uid === uid) || (emp && row.employeeId === emp) || (mail && row.email === mail))
  ));
}

export function canSeeMeeting(meeting, viewer = {}) {
  if (!meeting) return false;
  if (viewer.admin || meeting.visibility !== 'deltakere') return true;
  return canManageMeeting(meeting, viewer) || isParticipant(meeting, viewer);
}

/* ───────── Status og faser ───────── */

export function statusLabel(id) {
  return MEETING_STATUSES.find((row) => row.id === id)?.label || 'Utkast';
}

export function isLocked(meeting) {
  return ['ferdigstilt', 'sendt', 'avlyst'].includes(meeting?.status);
}

export function isClosed(meeting) {
  return ['ferdigstilt', 'sendt'].includes(meeting?.status);
}

/**
 * Fasen brukeren ser: tar hensyn til dato. Et innkalt møte som er passert uten referat,
 * er «Til referat». Et møte uten dato er «Uten dato» til det får en.
 */
export function meetingPhase(meeting, today = todayOslo()) {
  const m = meeting || {};
  if (m.status === 'avlyst') return 'avlyst';
  if (m.status === 'sendt') return 'sendt';
  if (m.status === 'ferdigstilt') return 'ferdigstilt';
  if (m.status === 'pagar') return m.endedAt ? 'referat' : 'pagar';
  if (!m.date) return m.status === 'utkast' ? 'utkast' : 'utenDato';
  if (m.date < today) return 'referat';
  if (m.date === today) return 'idag';
  return m.status === 'innkalt' ? 'innkalt' : 'utkast';
}

export function phaseInfo(phase) {
  return MEETING_PHASES[phase] || MEETING_PHASES.utkast;
}

/** Steg i tidslinjen øverst i møtet. */
export const LIFECYCLE_STEPS = [
  { id: 'utkast', label: 'Planlegg' },
  { id: 'innkalt', label: 'Innkall' },
  { id: 'pagar', label: 'Gjennomfør' },
  { id: 'ferdigstilt', label: 'Ferdigstill' },
  { id: 'sendt', label: 'Send referat' },
];

/** Steget som står for tur (0–4). 5 når alt er gjort. */
export function lifecycleIndex(meeting) {
  const s = meeting?.status;
  if (s === 'sendt') return 5;
  if (s === 'ferdigstilt') return 4;
  if (s === 'pagar') return meeting.endedAt ? 3 : 2;
  if (s === 'innkalt') return 2;
  return 0;
}

/* ───────── Lister ───────── */

export const LIST_TABS = [
  { id: 'kommende', label: 'Kommende' },
  { id: 'referat', label: 'Til referat' },
  { id: 'avholdte', label: 'Ferdigstilte' },
  { id: 'utenDato', label: 'Uten dato' },
  { id: 'alle', label: 'Alle' },
];

export function inListTab(meeting, tab, today = todayOslo()) {
  const phase = meetingPhase(meeting, today);
  switch (tab) {
    case 'kommende': return ['utkast', 'innkalt', 'idag', 'pagar'].includes(phase) && !!meeting.date;
    case 'referat': return phase === 'referat';
    case 'avholdte': return phase === 'ferdigstilt' || phase === 'sendt';
    case 'utenDato': return !meeting.date && !isLocked(meeting);
    default: return true;
  }
}

export function listCounts(meetings, today = todayOslo()) {
  const out = {};
  for (const tab of LIST_TABS) out[tab.id] = 0;
  for (const m of meetings || []) {
    for (const tab of LIST_TABS) if (inListTab(m, tab.id, today)) out[tab.id] += 1;
  }
  return out;
}

function sortKey(m) {
  return `${m.date || '9999-99-99'} ${m.start || '99:99'}`;
}

/** Kommende stigende, holdte synkende. */
export function sortMeetings(meetings, tab = 'alle') {
  const rows = (meetings || []).slice();
  const asc = tab === 'kommende' || tab === 'utenDato';
  rows.sort((a, b) => {
    const cmp = sortKey(a).localeCompare(sortKey(b));
    if (cmp) return asc ? cmp : -cmp;
    return (b.number || 0) - (a.number || 0);
  });
  if (tab === 'alle') {
    // Uten dato samles nederst.
    return [...rows.filter((m) => m.date), ...rows.filter((m) => !m.date)];
  }
  return rows;
}

export function meetingMatches(meeting, query) {
  const q = text(query).toLowerCase();
  if (!q) return true;
  const hay = [
    meeting.title, meeting.location, meeting.projectName, meeting.projectNumber, meeting.purpose,
    ...(meeting.participants || []).map((p) => `${p.name} ${p.company}`),
    ...flatItems(meeting).map((row) => row.item.title),
  ].join(' ').toLowerCase();
  return q.split(/\s+/).every((part) => hay.includes(part));
}

/** Grupperer etter måned: [{ key, label, meetings }]. Uten dato til slutt. */
export function groupByMonth(meetings) {
  const groups = [];
  const byKey = new Map();
  for (const m of meetings || []) {
    const key = m.date ? m.date.slice(0, 7) : 'uten';
    if (!byKey.has(key)) {
      const p = m.date ? dateParts(m.date) : null;
      const group = {
        key,
        label: p ? `${MONTHS_LONG[p.mo]} ${p.y}` : 'Uten dato',
        meetings: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).meetings.push(m);
  }
  return groups;
}

/** Neste møte for brukeren: i dag eller senere, ikke avlyst/ferdigstilt. */
export function nextMeeting(meetings, today = todayOslo()) {
  return sortMeetings((meetings || []).filter((m) => (
    m.date && m.date >= today && !isLocked(m)
  )), 'kommende')[0] || null;
}

/* ───────── Serier ───────── */

export function seriesMeetings(meetings, seriesId) {
  if (!seriesId) return [];
  return (meetings || [])
    .filter((m) => m.seriesId === seriesId)
    .sort((a, b) => (a.number || 0) - (b.number || 0) || sortKey(a).localeCompare(sortKey(b)));
}

export function nextSeriesNumber(meetings, seriesId) {
  return seriesMeetings(meetings, seriesId).reduce((max, m) => Math.max(max, m.number || 0), 0) + 1;
}

/** Forrige møte i serien (lavere nummer), eller null. */
export function previousInSeries(meetings, meeting) {
  if (!meeting?.seriesId) return null;
  const rows = seriesMeetings(meetings, meeting.seriesId).filter((m) => (
    m.id !== meeting.id && (m.number || 0) < (meeting.number || Infinity) && m.status !== 'avlyst'
  ));
  return rows[rows.length - 1] || null;
}

export function nextRecurrenceDate(recurrence, fromIso) {
  const freq = normalizeRecurrence(recurrence).freq;
  const from = isoDate(fromIso);
  if (!from || freq === 'none') return '';
  if (freq === 'weekly') return addDays(from, 7);
  if (freq === 'biweekly') return addDays(from, 14);
  if (freq === 'monthly') return addMonths(from, 1);
  if (freq === 'quarterly') return addMonths(from, 3);
  return '';
}

export function recurrenceLabel(recurrence, dateIso = '') {
  const freq = normalizeRecurrence(recurrence).freq;
  const row = RECURRENCE.find((r) => r.id === freq);
  if (!row || freq === 'none') return 'Enkeltmøte';
  const wd = weekdayOf(dateIso);
  if ((freq === 'weekly' || freq === 'biweekly') && wd != null) {
    return `${row.label}, ${WEEKDAYS_LONG[wd]}`;
  }
  return row.label;
}

/**
 * Lager neste møte i serien fra det forrige:
 * - samme dagsorden (titler, beskrivelse, varighet), uten notater og beslutninger
 * - åpne oppfølgingspunkter følger med, merket med hvor de kom fra
 * - deltakere som skal innkalles, med oppmøte nullstilt
 */
export function nextMeetingFrom(previous, { date = '', number = 0, at = '', by = '', byName = '' } = {}) {
  const prev = normalizeMeeting(previous);
  const nextDate = isoDate(date) || prev.nextDate || nextRecurrenceDate(prev.recurrence, prev.date);
  const chapters = prev.chapters.map((chapter) => ({
    id: createMeetingId('kap'),
    title: chapter.title,
    items: chapter.items.map((item) => {
      const open = item.actions.filter((a) => !a.done).map((a) => ({
        ...a,
        originMeetingId: a.originMeetingId || prev.id,
        originNumber: a.originNumber || prev.number,
        originDate: a.originDate || prev.date,
      }));
      return normalizeItem({
        id: createMeetingId('pkt'),
        title: item.title,
        description: item.description,
        presenterId: item.presenterId,
        minutes: item.minutes,
        actions: open,
        attachments: item.attachments,
        carried: open.length > 0,
      });
    }),
  }));
  return normalizeMeeting({
    title: prev.title,
    typeId: prev.typeId,
    templateId: prev.templateId,
    source: 'serie',
    seriesId: prev.seriesId,
    number: number || (prev.number ? prev.number + 1 : 0),
    projectId: prev.projectId,
    projectName: prev.projectName,
    projectNumber: prev.projectNumber,
    status: 'utkast',
    date: nextDate,
    start: prev.nextStart || prev.start,
    end: prev.nextStart && prev.start && prev.end
      ? clockFromMinutes(minutesOf(prev.nextStart) + (meetingLength(prev) || 60))
      : prev.end,
    location: prev.nextLocation || prev.location,
    videoUrl: prev.videoUrl,
    purpose: prev.purpose,
    visibility: prev.visibility,
    recurrence: prev.recurrence,
    chapters,
    participants: prev.participants
      .filter((p) => p.inviteNext)
      .map((p) => ({ ...p, id: createMeetingId('dlt'), attendance: 'ukjent' })),
    createdAt: at,
    createdBy: by,
    createdByName: byName,
    log: at ? [{ at, by, byName, text: `Opprettet fra møte ${prev.number || ''}`.trim() }] : [],
  });
}

/* ───────── Oppfølging på tvers av møter ───────── */

/**
 * Alle oppfølgingspunkter, ett per id. Samme punkt kan stå i flere møter i en serie;
 * det nyeste møtet (høyest nummer, senest dato) har gjeldende status.
 */
export function collectActions(meetings, today = todayOslo()) {
  const byId = new Map();
  const ordered = (meetings || [])
    .filter((m) => m.status !== 'avlyst')
    .slice()
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || (a.number || 0) - (b.number || 0));
  for (const meeting of ordered) {
    for (const row of flatItems(meeting)) {
      for (const action of row.item.actions) {
        byId.set(action.id, {
          ...action,
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          meetingNumber: meeting.number,
          meetingDate: meeting.date,
          meetingStatus: meeting.status,
          seriesId: meeting.seriesId,
          projectName: meeting.projectName,
          itemId: row.item.id,
          itemTitle: row.item.title,
          itemNumber: row.number,
          overdue: !action.done && !!action.due && action.due < today,
          dueSoon: !action.done && !!action.due && action.due >= today && (daysBetween(today, action.due) ?? 99) <= 7,
        });
      }
    }
  }
  return [...byId.values()].sort((a, b) => (
    Number(a.done) - Number(b.done)
    || Number(b.overdue) - Number(a.overdue)
    || (a.due || '9999').localeCompare(b.due || '9999')
  ));
}

export function actionCounts(actions) {
  const rows = actions || [];
  return {
    open: rows.filter((a) => !a.done).length,
    overdue: rows.filter((a) => a.overdue).length,
    dueSoon: rows.filter((a) => a.dueSoon).length,
    done: rows.filter((a) => a.done).length,
  };
}

/* ───────── Endringer i dagsorden (rene) ───────── */

function mapItems(meeting, fn) {
  return {
    ...meeting,
    chapters: meeting.chapters.map((chapter) => ({
      ...chapter,
      items: chapter.items.map((item) => fn(item, chapter)),
    })),
  };
}

export function patchItem(meeting, itemId, patch, at = '') {
  return mapItems(meeting, (item) => (
    item.id === itemId ? normalizeItem({ ...item, ...patch, updatedAt: at || item.updatedAt }) : item
  ));
}

export function patchChapter(meeting, chapterId, patch) {
  return {
    ...meeting,
    chapters: meeting.chapters.map((c) => (c.id === chapterId ? normalizeChapter({ ...c, ...patch }) : c)),
  };
}

export function addChapter(meeting, title = 'Nytt kapittel', { withItem = true } = {}) {
  const chapter = normalizeChapter({
    title,
    items: withItem ? [{ title: 'Nytt punkt', minutes: 5 }] : [],
  });
  return { meeting: { ...meeting, chapters: [...meeting.chapters, chapter] }, chapter };
}

export function addItem(meeting, chapterId, input = {}) {
  const item = normalizeItem({ title: 'Nytt punkt', minutes: 5, ...input });
  let target = chapterId;
  let chapters = meeting.chapters;
  if (!chapters.length) {
    const made = normalizeChapter({ title: 'Saker', items: [] });
    chapters = [made];
    target = made.id;
  }
  if (!chapters.some((c) => c.id === target)) target = chapters[chapters.length - 1].id;
  return {
    meeting: {
      ...meeting,
      chapters: chapters.map((c) => (c.id === target ? { ...c, items: [...c.items, item] } : c)),
    },
    item,
  };
}

export function removeItem(meeting, itemId) {
  return {
    ...meeting,
    chapters: meeting.chapters.map((c) => ({ ...c, items: c.items.filter((i) => i.id !== itemId) })),
  };
}

export function removeChapter(meeting, chapterId) {
  return { ...meeting, chapters: meeting.chapters.filter((c) => c.id !== chapterId) };
}

/** Flytter et punkt ett steg opp/ned, også over kapittelgrensen. */
export function moveItem(meeting, itemId, dir) {
  const chapters = meeting.chapters.map((c) => ({ ...c, items: c.items.slice() }));
  const ci = chapters.findIndex((c) => c.items.some((i) => i.id === itemId));
  if (ci < 0) return meeting;
  const ii = chapters[ci].items.findIndex((i) => i.id === itemId);
  const [item] = chapters[ci].items.splice(ii, 1);
  if (dir < 0) {
    if (ii > 0) chapters[ci].items.splice(ii - 1, 0, item);
    else if (ci > 0) chapters[ci - 1].items.push(item);
    else chapters[ci].items.splice(0, 0, item);
  } else if (ii < chapters[ci].items.length) {
    chapters[ci].items.splice(ii + 1, 0, item);
  } else if (ci < chapters.length - 1) {
    chapters[ci + 1].items.unshift(item);
  } else {
    chapters[ci].items.push(item);
  }
  return { ...meeting, chapters };
}

export function moveChapter(meeting, chapterId, dir) {
  const chapters = meeting.chapters.slice();
  const i = chapters.findIndex((c) => c.id === chapterId);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= chapters.length) return meeting;
  [chapters[i], chapters[j]] = [chapters[j], chapters[i]];
  return { ...meeting, chapters };
}

/** Setter oppfølgingspunkt utført/åpent i møtet (alle forekomster av id-en). */
export function setActionDone(meeting, actionId, done, at = '') {
  return mapItems(meeting, (item) => (
    item.actions.some((a) => a.id === actionId)
      ? {
        ...item,
        actions: item.actions.map((a) => (
          a.id === actionId ? { ...a, done: !!done, doneAt: done ? (at || a.doneAt) : '' } : a
        )),
      }
      : item
  ));
}

/** Deltaker sin visning for valg i lister (ansvarlig, presentør). */
export function participantOptions(meeting) {
  return (meeting?.participants || []).map((p) => ({
    id: p.id,
    label: p.name,
    hint: [roleLabel(p.role), p.company].filter(Boolean).join(' · '),
  }));
}

/* ───────── Samtidige endringer ───────── */

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeRows(base = [], local = [], remote = []) {
  const baseById = new Map(base.map((row) => [row.id, row]));
  const localById = new Map(local.map((row) => [row.id, row]));
  const remoteIds = new Set(remote.map((row) => row.id));
  const out = [];
  for (const row of remote) {
    const mine = localById.get(row.id);
    if (!mine) {
      // Fjernet her, eller lagt til et annet sted siden sist.
      if (!baseById.has(row.id)) out.push(row);
      continue;
    }
    out.push(same(mine, baseById.get(row.id)) ? row : mine);
  }
  for (const row of local) {
    if (!baseById.has(row.id) && !remoteIds.has(row.id)) out.push(row);
  }
  return out;
}

function shape(chapters = []) {
  return chapters.map((c) => [c.id, c.items.map((i) => i.id)]);
}

function mergeChapters(base = [], local = [], remote = []) {
  const baseItems = new Map(base.flatMap((c) => c.items).map((i) => [i.id, i]));
  const baseChapters = new Map(base.map((c) => [c.id, c]));
  const localItems = new Map(local.flatMap((c) => c.items).map((i) => [i.id, i]));
  const remoteItems = new Map(remote.flatMap((c) => c.items).map((i) => [i.id, i]));
  const changedHere = (item) => !same(item, baseItems.get(item.id));
  const titleOf = (chapter, other) => {
    const b = baseChapters.get(chapter.id);
    return b && other && chapter.title === b.title ? other.title : chapter.title;
  };
  if (same(shape(local), shape(base))) {
    // Samme oppbygging her: følg den andre sin rekkefølge, men behold egne endringer.
    return remote.map((chapter) => {
      const mine = local.find((c) => c.id === chapter.id);
      return {
        ...chapter,
        title: mine && mine.title !== baseChapters.get(chapter.id)?.title ? mine.title : chapter.title,
        items: chapter.items.map((item) => {
          const own = localItems.get(item.id);
          return own && changedHere(own) ? own : item;
        }),
      };
    });
  }
  // Oppbyggingen er endret her: den vinner, men innhold den andre har endret beholdes.
  const used = new Set();
  const out = local.map((chapter) => {
    const theirs = remote.find((c) => c.id === chapter.id);
    const items = chapter.items
      .filter((item) => changedHere(item) || remoteItems.has(item.id) || !baseItems.has(item.id))
      .map((item) => {
        used.add(item.id);
        return changedHere(item) ? item : (remoteItems.get(item.id) || item);
      });
    return { ...chapter, title: titleOf(chapter, theirs), items };
  });
  for (const chapter of remote) {
    for (const item of chapter.items) {
      if (used.has(item.id) || baseItems.has(item.id)) continue;
      const target = out.find((c) => c.id === chapter.id) || out[out.length - 1];
      if (target) target.items.push(item);
    }
  }
  return out;
}

/**
 * Treveis sammenslåing når to har lagret samme møte. `base` er versjonen
 * endringene her bygger på, `remote` er det som ligger lagret nå.
 * Felt, deltakere og punkter som er endret her vinner. Resten tas fra `remote`.
 */
export function mergeMeetingEdits(base, local, remote) {
  if (!remote) return normalizeMeeting(local);
  if (!base) return normalizeMeeting(local);
  const b = normalizeMeeting(base);
  const l = normalizeMeeting(local);
  const r = normalizeMeeting(remote);
  const out = { ...r };
  for (const key of Object.keys(l)) {
    if (['chapters', 'participants', 'log', 'deliveries', 'archive'].includes(key)) continue;
    if (!same(l[key], b[key])) out[key] = l[key];
  }
  out.participants = mergeRows(b.participants, l.participants, r.participants);
  out.chapters = mergeChapters(b.chapters, l.chapters, r.chapters);
  // Logg og utsendelser bare vokser: ta med nye linjer fra begge.
  const seen = new Set();
  const union = (rows) => rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  out.log = union([...r.log, ...l.log]).sort((x, y) => x.at.localeCompare(y.at)).slice(-80);
  seen.clear();
  out.deliveries = union([...r.deliveries, ...l.deliveries]).sort((x, y) => x.at.localeCompare(y.at));
  seen.clear();
  out.archive = union([...r.archive, ...l.archive]).sort((x, y) => x.revision - y.revision);
  return normalizeMeeting(out);
}

/** Serier ut fra møtene: [{ id, title, count, last, next, recurrence, meetings }]. */
export function seriesOverview(meetings, today = todayOslo()) {
  const map = new Map();
  for (const m of meetings || []) {
    if (!m.seriesId) continue;
    if (!map.has(m.seriesId)) map.set(m.seriesId, []);
    map.get(m.seriesId).push(m);
  }
  return [...map.entries()].map(([id, rows]) => {
    const list = seriesMeetings(rows, id);
    const held = list.filter((m) => m.date && m.date < today && m.status !== 'avlyst');
    const upcoming = list.filter((m) => m.date && m.date >= today && !isLocked(m));
    const latest = list[list.length - 1];
    return {
      id,
      title: latest.title,
      typeId: latest.typeId,
      projectName: latest.projectName,
      recurrence: latest.recurrence,
      count: list.length,
      last: held[held.length - 1] || null,
      next: upcoming[0] || null,
      latest,
      meetings: list,
    };
  }).sort((a, b) => (b.latest.date || '').localeCompare(a.latest.date || ''));
}
