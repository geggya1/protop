/**
 * Ren logikk bak ProTop-widgetene på Hjem: uken i timer, prosjekter, teamet,
 * hurtigvalg og «Dagen din». Uten React og Firebase, så node-testene kan lese den.
 */
import { parseHours, formatHours } from '../arbeid/hours.js';

const WEEKDAY_SHORT = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function isoDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Mandag i uken til `date` (lokal tid, kl. 12 så sommertid ikke flytter datoen). */
export function mondayOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const idx = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - idx);
  return d;
}

/** De sju dagene i uken: { key, label, date, isToday, weekend }. */
export function weekDays(today = new Date()) {
  const mon = mondayOf(today);
  const todayKey = isoDay(today);
  return WEEKDAY_SHORT.map((label, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const key = isoDay(d);
    return {
      key, label, date: d.getDate(), isToday: key === todayKey, weekend: i >= 5, past: key < todayKey,
    };
  });
}

/** ISO-ukenummer. */
export function isoWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/** Timer som tekst på norsk: 7,5 t. Hele timer uten desimal. */
export function hoursLabel(value) {
  const n = Math.round(parseHours(value) * 10) / 10;
  if (!n) return '0 t';
  return `${String(n).replace('.', ',')} t`;
}

export { formatHours };

/**
 * Uken i timer for én person.
 * rows: timeføringer ({ date, hours, projectId }). normalDay: normal arbeidsdag i timer.
 */
export function weekHoursSummary(rows = [], { today = new Date(), normalDay = 7.5 } = {}) {
  const days = weekDays(today);
  const byDay = new Map(days.map((d) => [d.key, 0]));
  const projects = new Map();
  (rows || []).forEach((row) => {
    const key = String(row?.date || '').slice(0, 10);
    if (!byDay.has(key)) return;
    const h = parseHours(row?.hours);
    if (!h) return;
    byDay.set(key, byDay.get(key) + h);
    const pid = String(row?.projectId || '').trim();
    if (pid) projects.set(pid, (projects.get(pid) || 0) + h);
  });
  const norm = Number(normalDay) > 0 ? Number(normalDay) : 7.5;
  const workdays = days.filter((d) => !d.weekend);
  const target = Math.round(norm * workdays.length * 100) / 100;
  const total = Math.round([...byDay.values()].reduce((a, b) => a + b, 0) * 100) / 100;
  const todayRow = days.find((d) => d.isToday);
  const todayHours = todayRow ? Math.round(byDay.get(todayRow.key) * 100) / 100 : 0;
  // Hverdager som er passert uten føring (i dag teller ikke før dagen er over).
  const missing = workdays.filter((d) => d.past && !byDay.get(d.key)).map((d) => d.label);
  const max = Math.max(norm, ...byDay.values());
  return {
    days: days.map((d) => ({
      ...d,
      hours: Math.round(byDay.get(d.key) * 100) / 100,
      ratio: max ? Math.min(1, byDay.get(d.key) / max) : 0,
      full: byDay.get(d.key) >= norm - 0.01,
    })),
    total,
    target,
    todayHours,
    normalDay: norm,
    progress: target ? Math.min(1, total / target) : 0,
    missing,
    topProjectIds: [...projects.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
    week: isoWeekNumber(today),
  };
}

const ACTIVE_PHASES = ['produksjon', 'overlevering', 'planlegging', 'tilbud', 'garanti'];
const PHASE_LABEL = {
  produksjon: 'Pågår',
  overlevering: 'Overlevering',
  planlegging: 'Planlegging',
  tilbud: 'Tilbud',
  garanti: 'Garanti',
  avsluttet: 'Avsluttet',
};

function fold(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Prosjektene som vises på Hjem: de jeg har ført timer på denne uken først,
 * så de jeg leder, så pågående. Avsluttede og slettede vises ikke.
 * phaseOf: (project) => fase (projectPhaseOf).
 */
export function homeProjects(projects = [], {
  phaseOf = (p) => p?.phase || 'planlegging',
  recentIds = [],
  myName = '',
  limit = 4,
} = {}) {
  const me = fold(myName);
  const recent = new Map((recentIds || []).map((id, i) => [String(id), i]));
  const live = (projects || []).filter((p) => p && p.id && p.deleted !== true && p.archived !== true)
    .map((p) => ({ project: p, phase: phaseOf(p) }))
    .filter((row) => row.phase !== 'avsluttet');
  const score = ({ project, phase }) => {
    if (recent.has(String(project.id))) return recent.get(String(project.id));
    if (me && fold(project.manager) && fold(project.manager).includes(me)) return 100;
    const idx = ACTIVE_PHASES.indexOf(phase);
    return 200 + (idx < 0 ? 9 : idx);
  };
  const sorted = live.sort((a, b) => score(a) - score(b)
    || String(a.project.number || '').localeCompare(String(b.project.number || ''), 'nb', { numeric: true }));
  const counts = {};
  live.forEach(({ phase }) => { counts[phase] = (counts[phase] || 0) + 1; });
  return {
    total: live.length,
    running: counts.produksjon || 0,
    counts,
    items: sorted.slice(0, limit).map(({ project, phase }) => ({
      id: project.id,
      number: String(project.number || '').trim(),
      name: String(project.name || 'Prosjekt').trim(),
      place: String(project.place || project.address || project.client || project.customerName || '').trim(),
      phase,
      phaseLabel: PHASE_LABEL[phase] || 'Aktiv',
      mine: recent.has(String(project.id)),
    })),
  };
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

function employeeName(row) {
  const p = row?.person || {};
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
    || String(row?.name || row?.displayName || '').trim()
    || 'Ansatt';
}

/** Er ansettelsen aktiv i dag? */
export function isActiveEmployeeRow(row, todayKey = isoDay(new Date())) {
  if (!row || row.deleted === true || row.archived === true) return false;
  if (row.active === false) return false;
  const end = String(row?.company?.endDate || row?.endDate || '').slice(0, 10);
  if (end && end < todayKey) return false;
  return true;
}

/**
 * Teamet i dag: hvem som har ført timer. todayRows er dagens føringer for hele selskapet
 * (null når personen ikke kan se andres timer, da vises bare teamet).
 */
export function teamToday(employees = [], todayRows = null, { meId = '', todayKey = isoDay(new Date()), limit = 8 } = {}) {
  const active = (employees || []).filter((row) => row?.id && isActiveEmployeeRow(row, todayKey));
  const logged = new Map();
  (todayRows || []).forEach((row) => {
    const id = String(row?.employeeId || '').trim();
    if (!id || String(row?.date || '').slice(0, 10) !== todayKey) return;
    logged.set(id, (logged.get(id) || 0) + parseHours(row?.hours));
  });
  const known = Array.isArray(todayRows);
  const people = active.map((row) => ({
    id: row.id,
    name: employeeName(row),
    initials: initials(employeeName(row)),
    photoURL: row?.person?.photoURL || row?.photoURL || '',
    me: row.id === meId,
    hours: logged.get(row.id) || 0,
    logged: (logged.get(row.id) || 0) > 0,
  }));
  people.sort((a, b) => (Number(b.logged) - Number(a.logged))
    || (Number(b.me) - Number(a.me))
    || a.name.localeCompare(b.name, 'nb'));
  const loggedCount = people.filter((p) => p.logged).length;
  return {
    total: people.length,
    loggedCount,
    known,
    people: people.slice(0, limit),
    more: Math.max(0, people.length - limit),
    headline: known
      ? `${loggedCount} av ${people.length} har ført i dag`
      : `${people.length} ${people.length === 1 ? 'ansatt' : 'ansatte'}`,
  };
}

/**
 * Hurtigvalg på Hjem. Bedrift: arbeid først (timer, avvik, prosjekt). Privat: dagen.
 * modules: { iso, timer } — hva som er slått på.
 */
export function quickActionsFor(board = 'private', { iso = false, mileage = false } = {}) {
  if (board === 'company') {
    const hours = { id: 'hours', icon: 'time', label: 'Før timer', action: { type: 'tab', tab: 'timeliste' } };
    const trip = { id: 'trip', icon: 'car', label: 'Kjøretur', action: { type: 'tab', tab: 'okonomi', subView: 'kjorebok' } };
    const ruh = { id: 'ruh', icon: 'warning', label: 'Meld RUH', action: { type: 'ruh' }, tone: 'warn' };
    const project = { id: 'project', icon: 'business', label: 'Prosjekter', action: { type: 'tab', tab: 'projects' } };
    const task = { id: 'task', icon: 'checkbox', label: 'Ny oppgave', action: { type: 'nav', screen: 'ParentTask' } };
    const event = { id: 'event', icon: 'calendar', label: 'Ny avtale', action: { type: 'nav', screen: 'EventForm' } };
    const list = [hours];
    if (mileage) list.push(trip);
    list.push(iso ? ruh : project, task, event);
    return list.slice(0, 4);
  }
  return [
    { id: 'event', icon: 'calendar', label: 'Ny avtale', action: { type: 'nav', screen: 'EventForm' } },
    { id: 'task', icon: 'checkbox', label: 'Ny oppgave', action: { type: 'nav', screen: 'ParentTask' } },
    { id: 'note', icon: 'document-text', label: 'Nytt notat', action: { type: 'tab', tab: 'notes', mode: 'create' } },
    { id: 'ai', icon: 'sparkles', label: 'Spør AI', action: { type: 'nav', screen: 'AiChat', params: { newChat: true } } },
  ];
}

function minutesOf(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** «om 25 min», «om 2 t 10 min», «nå», «pågår» eller null (heldag / ukjent). */
export function countdownLabel(start, end, now = new Date()) {
  const s = minutesOf(start);
  if (s == null) return null;
  const n = now.getHours() * 60 + now.getMinutes();
  const e = minutesOf(end);
  if (n >= s && e != null && n < e) return 'Pågår nå';
  const diff = s - n;
  if (diff < 0) return null;
  if (diff === 0) return 'Nå';
  if (diff < 60) return `Om ${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `Om ${h} t ${m} min` : `Om ${h} t`;
}

/**
 * «Dagen din»: tre tall og én linje. Ingen tomme 0 av 0-stolper.
 */
export function dayBrief({
  eventsToday = 0, openTasks = 0, overdueTasks = 0, unread = 0, nextTitle = '', nextTime = '', focusTomorrow = false,
} = {}) {
  const stats = [
    {
      id: 'events',
      icon: 'calendar',
      value: eventsToday,
      label: eventsToday === 1 ? 'avtale' : 'avtaler',
      sub: focusTomorrow ? 'i morgen' : 'i dag',
    },
    {
      id: 'tasks',
      icon: 'checkbox',
      value: openTasks,
      label: openTasks === 1 ? 'oppgave' : 'oppgaver',
      sub: overdueTasks ? `${overdueTasks} forfalt` : 'åpne',
      alert: overdueTasks > 0,
    },
    {
      id: 'unread',
      icon: 'notifications',
      value: unread,
      label: unread === 1 ? 'varsel' : 'varsler',
      sub: 'uleste',
    },
  ];
  let line = focusTomorrow ? 'Ingenting i kalenderen i morgen' : 'Ingenting mer i kalenderen i dag';
  if (nextTitle) line = `${nextTime && nextTime !== 'Heldag' ? `${nextTime} · ` : ''}${nextTitle}`;
  const calm = !eventsToday && !openTasks && !unread;
  return { stats, line, calm };
}

/** Antall avtaler per dag i uken: counts er { 'YYYY-MM-DD': n }. */
export function weekLoad(counts = {}, today = new Date()) {
  const days = weekDays(today);
  const max = Math.max(1, ...days.map((d) => Number(counts?.[d.key]) || 0));
  const rows = days.map((d) => {
    const n = Number(counts?.[d.key]) || 0;
    return { ...d, count: n, ratio: n / max };
  });
  const total = rows.reduce((sum, d) => sum + d.count, 0);
  const busiest = rows.reduce((best, d) => (d.count > (best?.count || 0) ? d : best), null);
  return {
    days: rows,
    total,
    week: isoWeekNumber(today),
    headline: total
      ? `${total} ${total === 1 ? 'avtale' : 'avtaler'} denne uken`
      : 'Ingen avtaler denne uken',
    busiest: busiest && busiest.count > 1 ? busiest : null,
  };
}

/** Relativ tid for nyheter: «i dag», «i går», «3 dager siden», ellers dato. */
export function relativeDay(dateKey, today = new Date()) {
  const key = String(dateKey || '').slice(0, 10);
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return '';
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((now - then) / 86400000);
  if (days <= 0) return 'I dag';
  if (days === 1) return 'I går';
  if (days < 7) return `${days} dager siden`;
  return `${d}.${m}.${y}`;
}

/**
 * Kjøreboken min: denne måneden, i år (yrkeskjøring mot 6 000 km-grensen),
 * turer som ikke er sendt, og de siste turene.
 * trips: normaliserte turer (normalizeTrip). mine: Set med mine ansatt-id-er (tom = alle).
 */
export function mileageSummary(trips = [], { mine = null, today = new Date(), limitKm = 6000, recent = 3 } = {}) {
  const todayKey = isoDay(today);
  const monthKey = todayKey.slice(0, 7);
  const yearKey = todayKey.slice(0, 4);
  const own = (trips || []).filter((t) => t && t.date && t.date <= todayKey
    && (!mine || !mine.size || mine.has(String(t.employeeId || ''))));
  const round = (n) => Math.round(n * 10) / 10;
  const month = own.filter((t) => t.date.startsWith(monthKey));
  const yearDuty = own.filter((t) => t.date.startsWith(yearKey) && t.purpose === 'duty');
  const monthKm = round(month.reduce((sum, t) => sum + (Number(t.km) || 0), 0));
  const monthAmount = Math.round(month.reduce((sum, t) => sum + (Number(t.reimbursement) || 0), 0));
  const yearKm = round(yearDuty.reduce((sum, t) => sum + (Number(t.km) || 0), 0));
  const drafts = own.filter((t) => (t.status || 'draft') === 'draft').length;
  const sorted = [...own].sort((a, b) => String(b.date).localeCompare(String(a.date))
    || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const placeShort = (value) => String(value || '').split(',')[0].trim();
  return {
    monthKm,
    monthAmount,
    monthTrips: month.length,
    yearKm,
    limitKm,
    yearRatio: limitKm ? Math.min(1, yearKm / limitKm) : 0,
    overLimit: yearKm >= limitKm,
    drafts,
    total: own.length,
    recent: sorted.slice(0, recent).map((t) => ({
      id: t.id,
      date: t.date,
      km: round(Number(t.km) || 0),
      route: [placeShort(t.from), placeShort(t.to)].filter(Boolean).join(' → ')
        || t.projectName || 'Kjøretur',
      project: t.projectNumber || t.projectName || '',
      draft: (t.status || 'draft') === 'draft',
    })),
  };
}

/** «1 234 km», «12,5 km». */
export function kmLabel(value) {
  const n = Math.round((Number(value) || 0) * 10) / 10;
  const [int, dec] = String(n).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped}${dec ? `,${dec}` : ''} km`;
}

/** «1 092 kr». */
export function krLabel(value) {
  const n = Math.round(Number(value) || 0);
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} kr`;
}
