/**
 * Pedagogisk hjem for barn: dagsrytme, neste steg og oppmuntring.
 * Rene funksjoner — ingen Firestore.
 */

import { profileAge } from './age.js';
import { isDoneOn } from './todoStatus.js';
import { eventTimeLabel } from './homeWidgets.js';
import { homeFocusCopy, homeFocusIsTomorrow, upcomingDayEvents } from './deskHome.js';

const MINUTES_DAY = 24 * 60;

export function parseHm(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

export function formatHm(minutes) {
  const m = ((Number(minutes) % MINUTES_DAY) + MINUTES_DAY) % MINUTES_DAY;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function minutesOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function formatChildTimeRange(ev) {
  return eventTimeLabel(ev) || 'Hele dagen';
}

const KIND_RULES = [
  { id: 'swim', re: /svøm|badetøy|basseng/ },
  { id: 'sport', re: /fotball|håndball|handball|trening|idrett|kamp|gym|ski|korps/ },
  { id: 'school', re: /skole|sfo|barnehage|lekse|undervis/ },
  { id: 'music', re: /musikk|piano|gitar|kor\b|øving|instrument/ },
  { id: 'health', re: /tann|lege|helse|vaksine/ },
  { id: 'fun', re: /bursdag|fest|kino|leke|venn/ },
];

export function eventKind(ev) {
  const t = `${ev?.title || ''} ${ev?.place || ''} ${ev?.description || ''}`.toLowerCase();
  for (const rule of KIND_RULES) {
    if (rule.re.test(t)) return rule.id;
  }
  return 'default';
}

export function eventVisual(kind) {
  const map = {
    swim: { art: 'bottle', tint: '#e0f2fe', accent: '#0284c7' },
    sport: { art: 'sport', tint: '#ede9fe', accent: '#7c3aed' },
    school: { art: 'school', tint: '#dbeafe', accent: '#2563eb' },
    music: { art: 'book', tint: '#fce7f3', accent: '#db2777' },
    health: { art: 'star', tint: '#ffedd5', accent: '#ea580c' },
    fun: { art: 'star', tint: '#fef3c7', accent: '#d97706' },
    default: { art: 'backpack', tint: '#eef2ff', accent: '#4f46e5' },
  };
  return map[kind] || map.default;
}

export function taskArtName(task) {
  if (!task) return 'star';
  if (isLekserTask(task)) return 'homework';
  const title = String(task.title || '').toLowerCase();
  if (/lese|bok/.test(title)) return 'book';
  if (/sekk|pack|skole/.test(title)) return 'backpack';
  return 'star';
}

export function shortcutArtName(appId, period = 'school') {
  if (appId === 'skole') return period === 'afterSchool' ? 'schoolAfter' : 'school';
  if (appId === 'books' || appId === 'lekser') return 'books';
  if (appId === 'wishes') return 'wishes';
  if (appId === 'all' || appId === 'apps') return 'apps';
  if (appId === 'chores' || appId === 'stars') return 'star';
  if (appId === 'plan') return 'school';
  if (appId === 'games') return 'sport';
  return 'star';
}

/** 3D app-ikoner på barnehjem — kun moduler som manglet eget ikon. */
export function childAppArtName(appId, period = 'school') {
  const map = {
    stars: 'appTasks',
    chores: 'appChores',
    plan: 'appPlan',
    chat: 'appChat',
    notes: 'appNotes',
    documents: 'appDocuments',
    games: 'appGames',
    scratchMap: 'appTravel',
    reiseplanlegger: 'appTravel',
    familyTree: 'appFamilyTree',
    rememberDates: 'appRememberDates',
    activities: 'appActivities',
    location: 'appLocation',
    wishes: 'appWishes',
    skole: period === 'afterSchool' ? 'schoolAfter' : 'school',
    books: 'books',
    lekser: 'appLekser',
    leksehjelp: 'appLeksehjelp',
    mattehjelp: 'appMattehjelp',
    'week-plan': 'appWeekPlan',
    klassen: 'school',
  };
  return map[appId] || null;
}

/** Fullført / fremgang på gjøremål-seksjonen. */
export function childHomeProgressArtName() {
  return 'appProgress';
}

/** Ukepenger-linjen under gjøremål. */
export function childHomeWeekMoneyArtName() {
  return 'appPiggyBank';
}

/** Skoledag mandag–fredag 07:00–15:00 (klokke, uten alder/kalender). */
export function childHomePeriod(date = new Date()) {
  const day = date.getDay();
  const weekday = day >= 1 && day <= 5;
  const min = minutesOfDay(date);
  if (weekday && min >= 7 * 60 && min < 15 * 60) return 'school';
  if (weekday && min >= 15 * 60) return 'afterSchool';
  if (weekday) return 'morning';
  return 'weekend';
}

export function isWeekend(date = new Date()) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Norsk skoleår: august–juni. Juli er sommerferie. */
export function isSchoolYearMonth(date = new Date()) {
  return date.getMonth() !== 6;
}

export function isPreschoolAge(child, date = new Date()) {
  const age = profileAge(child, date);
  return age != null && age < 6;
}

export function childGenderTone(child) {
  const g = String(child?.gender || '').toLowerCase();
  if (g === 'female' || g === 'jente' || g === 'girl' || g === 'kvinne') return 'girl';
  if (g === 'male' || g === 'gutt' || g === 'boy' || g === 'mann') return 'boy';
  return 'neutral';
}

export function leisureKindFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/fotball|håndball|handball|trening|idrett|kamp|\bgym\b|ski|svøm|badetøy|basseng|fotballsko/.test(t)) {
    return 'sport';
  }
  if (/musikk|piano|gitar|kor\b|øving|instrument|tegn|male|kunst|akvarell|hobby|maling|\bdans\b/.test(t)) {
    return 'hobby';
  }
  if (/lek\b|leke|lekeplass|park\b|sparkesykkel|sykkel|utelek|uteleik/.test(t)) {
    return 'play';
  }
  return null;
}

function leisureFromEventKind(kind) {
  if (kind === 'sport' || kind === 'swim') return 'sport';
  if (kind === 'music') return 'hobby';
  if (kind === 'fun') return 'play';
  return null;
}

export function detectLeisureActivity({ events = [], tasks = [], date = new Date() } = {}) {
  const scored = [];
  for (const ev of events || []) {
    const fromText = leisureKindFromText(`${ev?.title || ''} ${ev?.place || ''} ${ev?.description || ''}`);
    const kind = fromText || leisureFromEventKind(eventKind(ev));
    if (!kind) continue;
    const phase = eventPhase(ev, date);
    let score = 1;
    if (phase === 'now') score = 5;
    else if (phase === 'upcoming') score = 4;
    else if (phase === 'allday') score = 2;
    else score = 0;
    if (score > 0) scored.push({ kind, score });
  }
  for (const task of tasks || []) {
    const kind = leisureKindFromText(`${task?.title || ''} ${task?.category || ''} ${task?.description || ''}`);
    if (!kind) continue;
    scored.push({ kind, score: 3 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.kind || null;
}

function schoolBanner(child) {
  return childGenderTone(child) === 'girl' ? 'heroSchoolLavender' : 'heroSchoolNavy';
}

function afternoonDefaultSlot(child) {
  if (isPreschoolAge(child)) return 'play';
  if (childGenderTone(child) === 'boy') return 'sport';
  return 'play';
}

function eveningDefaultSlot(child) {
  if (childGenderTone(child) === 'girl') return 'hobbies';
  return 'home';
}

const HERO_COPY = {
  kindergarten: { kicker: 'Barnehagedagen', title: 'Barnehage', banner: 'heroKindergarten' },
  school: { kicker: 'Skoledagen er i gang', title: 'Skoledagen' },
  morning: { kicker: 'Snart starter skoledagen', title: 'Morgen', banner: 'heroHome' },
  play: { kicker: 'Tid for lek', title: 'Lek og fritid', banner: 'heroPlay' },
  sport: { kicker: 'Tid for aktivitet', title: 'Fritid', banner: 'heroSport' },
  hobbies: { kicker: 'Tid for fritid', title: 'Fritid', banner: 'heroHobbies' },
  home: { kicker: 'Hjemme for i dag', title: 'Hjemme', banner: 'heroHome' },
  bedtime: { kicker: 'Koselig kveld', title: 'Kveld', banner: 'heroBedtime' },
};

/**
 * Velg heading-banner ut fra klokke, ukedag, skoleår, alder, kjønn og dagens gjøremål.
 */
export function pickChildHeroTheme({
  date = new Date(),
  child = null,
  events = [],
  tasks = [],
} = {}) {
  const min = minutesOfDay(date);
  const weekend = isWeekend(date);
  const schoolYear = isSchoolYearMonth(date);
  const preschool = isPreschoolAge(child, date);
  const activity = detectLeisureActivity({ events, tasks, date });
  const night = min >= 20 * 60 || min < 6 * 60;
  const morning = min >= 6 * 60 && min < 7 * 60;
  const schoolHours = min >= 7 * 60 && min < 15 * 60;
  const afternoon = min >= 15 * 60 && min < 18 * 60;
  const evening = min >= 18 * 60 && min < 20 * 60;

  let slot;
  const activitySlot = activity === 'hobby' ? 'hobbies' : activity;
  if (night) {
    slot = 'bedtime';
  } else if (!weekend && schoolYear && schoolHours) {
    slot = preschool ? 'kindergarten' : 'school';
  } else if (!weekend && schoolYear && morning && !preschool) {
    slot = 'morning';
  } else if (afternoon || ((weekend || !schoolYear) && schoolHours)) {
    slot = activitySlot || ((weekend || !schoolYear) ? 'play' : afternoonDefaultSlot(child));
  } else if (evening) {
    slot = activitySlot || eveningDefaultSlot(child);
  } else if (morning) {
    slot = 'home';
  } else {
    slot = activitySlot || afternoonDefaultSlot(child);
  }

  const copy = HERO_COPY[slot] || HERO_COPY.play;
  const banner = slot === 'school' ? schoolBanner(child) : copy.banner;
  let kicker = copy.kicker;
  let title = copy.title;
  if (weekend && slot !== 'bedtime') {
    title = 'Helg';
    if (slot === 'play' && !activity) kicker = 'Helgen din';
  }

  let period = 'afterSchool';
  if (slot === 'school' || slot === 'kindergarten') period = 'school';
  else if (weekend) period = 'weekend';
  else if (morning || slot === 'morning') period = 'morning';

  return { slot, banner, kicker, title, period };
}

export function eventPhase(ev, now = new Date()) {
  if (!ev) return 'upcoming';
  if (!ev.startTime) return 'allday';
  const nowMin = minutesOfDay(now);
  const start = parseHm(ev.startTime);
  if (start == null) return 'allday';
  const end = parseHm(ev.endTime);
  const endMin = end == null ? start + 60 : (end < start ? start : end);
  if (endMin < nowMin) return 'past';
  if (start <= nowMin && nowMin <= endMin) return 'now';
  return 'upcoming';
}

export function leaveMinutesBefore(kind) {
  if (kind === 'sport' || kind === 'swim') return 20;
  if (kind === 'school') return 15;
  return 10;
}

/** Klokkeslett barnet bør dra — vises til hendelsen starter. */
export function eventLeaveTime(ev, now = new Date()) {
  const start = parseHm(ev?.startTime);
  if (start == null) return null;
  const kind = eventKind(ev);
  const leave = start - leaveMinutesBefore(kind);
  if (leave < 0) return null;
  const nowMin = minutesOfDay(now);
  if (nowMin >= start) return null;
  return formatHm(leave);
}

export function eventReminder(ev) {
  const desc = String(ev?.description || ev?.notes || '').trim();
  if (desc) {
    const first = desc.split(/[\n.]/)[0].trim();
    if (first) return first.length > 88 ? `${first.slice(0, 85)}…` : first;
  }
  const kind = eventKind(ev);
  if (kind === 'sport') return 'Husk drikkeflaske og treningssko';
  if (kind === 'swim') return 'Husk badetøy og håndkle';
  if (kind === 'school') return 'Husk matpakke og drikkeflaske';
  if (kind === 'music') return 'Husk noter og instrument';
  return null;
}

export function minutesUntilStart(ev, now = new Date()) {
  const start = parseHm(ev?.startTime);
  if (start == null) return null;
  return start - minutesOfDay(now);
}

export function relativeEventLabel(ev, now = new Date()) {
  const phase = eventPhase(ev, now);
  if (phase === 'past') return 'Ferdig';
  if (phase === 'now') return 'Nå';
  const mins = minutesUntilStart(ev, now);
  if (mins == null) return 'I dag';
  if (mins <= 0) return 'Nå';
  if (mins < 60) return `Om ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return 'Om 1 time';
  return `Om ${hours} timer`;
}

export function eventSubline(ev, now = new Date()) {
  const bits = [];
  if (ev?.place) bits.push(String(ev.place).trim());
  const leave = eventLeaveTime(ev, now);
  if (leave) bits.push(`dra kl. ${leave}`);
  return bits.filter(Boolean).join(' · ');
}

/**
 * Tidslinje for dagen: ferdige først, deretter nå/neste uthevet.
 */
export function buildChildDayTimeline(events = [], now = new Date(), { limit = 6 } = {}) {
  const list = [...(events || [])].filter(Boolean);
  const decorated = list.map((ev) => {
    const kind = eventKind(ev);
    const phase = eventPhase(ev, now);
    return {
      event: ev,
      kind,
      phase,
      visual: eventVisual(kind),
      timeLabel: formatChildTimeRange(ev),
      statusLabel: relativeEventLabel(ev, now),
      subline: eventSubline(ev, now),
      reminder: (phase === 'upcoming' || (phase === 'now' && kind !== 'school'))
        ? eventReminder(ev)
        : null,
      focus: false,
    };
  });

  const focus = decorated.find((row) => row.phase === 'now')
    || decorated.find((row) => row.phase === 'upcoming')
    || decorated.find((row) => row.phase === 'allday')
    || null;
  if (focus) focus.focus = true;

  return decorated.slice(0, Math.max(1, limit));
}

export function childGreetingKicker(date = new Date(), ctx = {}) {
  return pickChildHeroTheme({ date, ...ctx }).kicker;
}

export function childShellTitle(date = new Date(), ctx = {}) {
  return pickChildHeroTheme({ date, ...ctx }).title;
}

export function childHeroArtName(date = new Date(), ctx = {}) {
  return pickChildHeroTheme({ date, ...ctx }).banner;
}

export function childDayProgressCopy({ done = 0, total = 0 } = {}) {
  const d = Math.max(0, Number(done) || 0);
  const n = Math.max(0, Number(total) || 0);
  if (!n) {
    return { headline: 'Ingen gjøremål i dag', cheer: 'Kos deg — dagen er din!' };
  }
  const headline = `${d} av ${n} ferdig`;
  if (d >= n) return { headline, cheer: 'Supert — alt er ferdig!' };
  if (d === 0) return { headline, cheer: 'Du klarer dette!' };
  return { headline, cheer: 'Du er godt i gang!' };
}

function firstLine(text) {
  return String(text || '')
    .split(/\n/)
    .map((line) => line.replace(/^\d+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim())
    .find(Boolean) || '';
}

export function taskSteps(task) {
  const desc = String(task?.description || task?.notes || '').trim();
  if (!desc) return [];
  const lines = desc
    .split(/\n/)
    .map((line) => line.replace(/^\d+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
  return lines.length > 1 ? lines : [];
}

export function taskFirstStep(task) {
  const fromDesc = firstLine(task?.description || task?.notes);
  if (fromDesc) return fromDesc.endsWith('.') ? fromDesc : `${fromDesc}.`;
  const title = String(task?.title || '').toLowerCase();
  const cat = String(task?.category || '').toLowerCase();
  if (cat === 'lekser' || /lekse/.test(title)) return 'Finn frem bøkene og velg én oppgave.';
  if (/lese|bok/.test(title)) return 'Finn boka og les i rolig tempo.';
  if (/sekk|pack/.test(title)) return 'Legg i bøker, matpakke og drikkeflaske.';
  if (/tenner|pusse/.test(title)) return 'Puss i to minutter — overalt.';
  if (/seng/.test(title)) return 'Rett på dynen og plassér puten.';
  return 'Trykk Start når du er klar.';
}

export function taskDurationHint(task) {
  const blob = `${task?.description || ''} ${task?.title || ''}`;
  const m = blob.match(/(\d{1,3})\s*(min(?:utt(?:er)?)?)/i);
  if (m) return `${m[1]} minutter`;
  const title = String(task?.title || '').toLowerCase();
  if (/lese|bok/.test(title)) return '15 minutter';
  return '';
}

export function taskDoneCaption(task) {
  const title = String(task?.title || '').toLowerCase();
  if (/sekk|pack/.test(title)) return 'Ferdig – klar for i morgen!';
  if (/lekse/.test(title) || String(task?.category || '').toLowerCase() === 'lekser') {
    return 'Ferdig – bra jobba med leksene!';
  }
  return 'Ferdig – digg jobba!';
}

export function isLekserTask(task) {
  if (!task) return false;
  if (String(task.category || '').toLowerCase() === 'lekser') return true;
  return /lekse/.test(String(task.title || '').toLowerCase());
}

export function featuredTaskTone(task, done) {
  if (done) return { backgroundColor: '#ecfdf5', borderColor: '#86efac' };
  if (isLekserTask(task)) return { backgroundColor: '#fff7ed', borderColor: '#fdba74' };
  const title = String(task?.title || '').toLowerCase();
  if (/lese|bok/.test(title)) return { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' };
  return { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' };
}

function taskWeight(task, todayKey) {
  if (isDoneOn(task, todayKey)) return 80;
  if (isLekserTask(task)) return 0;
  if (/lese|bok/.test(String(task?.title || '').toLowerCase())) return 1;
  return 2;
}

export function sortChildDayTasks(tasks = [], todayKey) {
  return [...(tasks || [])].sort((a, b) => {
    const wa = taskWeight(a, todayKey);
    const wb = taskWeight(b, todayKey);
    if (wa !== wb) return wa - wb;
    return String(a?.title || '').localeCompare(String(b?.title || ''), 'nb');
  });
}

/** Gjenstående øverst, utkvitterte under — for barnehjem-widget. */
export function partitionChildDayTasks(tasks = [], todayKey) {
  const sorted = sortChildDayTasks(tasks, todayKey);
  const open = [];
  const done = [];
  sorted.forEach((task) => {
    if (isDoneOn(task, todayKey)) done.push(task);
    else open.push(task);
  });
  return { open, done, sorted };
}

/** Timed clock events — heldag / 00:00 / allDay must not block «i morgen». */
export function isTimedChildEvent(ev) {
  if (!ev) return false;
  if (ev.allDay === true || ev.isAllDay === true) return false;
  const raw = String(ev.startTime || ev.time || '').trim();
  if (!raw) return false;
  if (/^heldag/i.test(raw) || /^hele\s*dagen/i.test(raw)) return false;
  if (raw === '00:00' || raw.startsWith('00:00')) return false;
  return /^\d{1,2}:\d{2}/.test(raw);
}

/**
 * Barnehjem-timeline: kveld → i morgen (som voksen), eller
 * dagens plan tom → fyll med morgendagens hendelser.
 *
 * Heldag uten klokkeslett blokkerer ikke fallback til i morgen — barna skal
 * se neste timed avtale (f.eks. trening) når resten av dagen er «tom».
 */
export function childTimelineFocus({
  eventsToday = [],
  eventsTomorrow = [],
  now = new Date(),
} = {}) {
  const clock = now instanceof Date ? now : new Date(now);
  const upcomingToday = upcomingDayEvents(eventsToday || [], clock);
  const timedUpcomingToday = upcomingToday.filter(isTimedChildEvent);
  const tomorrowList = [...(eventsTomorrow || [])]
    .filter(Boolean)
    .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
  const evening = homeFocusIsTomorrow(clock);
  const todayTimedEmpty = timedUpcomingToday.length === 0;
  const todayFullyEmpty = upcomingToday.length === 0;
  const tomorrowHas = tomorrowList.length > 0;
  const focusTomorrow = evening || (todayTimedEmpty && tomorrowHas);

  let upcoming;
  if (focusTomorrow) {
    upcoming = tomorrowList;
  } else if (todayFullyEmpty && tomorrowHas) {
    // Safety net — same outcome as focusTomorrow when timed-empty.
    upcoming = tomorrowList;
  } else {
    upcoming = upcomingToday;
  }

  const copy = homeFocusCopy(focusTomorrow);
  return {
    focusTomorrow,
    upcoming,
    source: focusTomorrow ? (eventsTomorrow || []) : (eventsToday || []),
    focusCopy: {
      ...copy,
      // Child chrome uses shorter labels than the adult desk.
      appointmentsTitle: focusTomorrow ? 'Avtaler i morgen' : 'I dag',
    },
  };
}

export function pickFeaturedTask(tasks = [], todayKey) {
  const sorted = sortChildDayTasks(tasks, todayKey);
  return sorted.find((t) => !isDoneOn(t, todayKey)) || null;
}

export const DEFAULT_CHILD_SHORTCUT_IDS = ['skole', 'books', 'wishes'];

export function childHomeShortcutIds(apps = []) {
  const ids = (apps || []).map((a) => a?.id).filter(Boolean);
  const allowed = new Set(ids);
  const picked = DEFAULT_CHILD_SHORTCUT_IDS.filter((id) => allowed.has(id));
  for (const id of ids) {
    if (picked.length >= 3) break;
    if (id === 'chat' || picked.includes(id)) continue;
    picked.push(id);
  }
  return picked;
}

export function childShortcutAccent(appId) {
  const map = {
    stars: { tint: '#dbeafe', accent: '#2563eb', ion: 'checkbox' },
    chores: { tint: '#fef3c7', accent: '#d97706', ion: 'star' },
    skole: { tint: '#dbeafe', accent: '#2563eb', ion: 'school' },
    books: { tint: '#ede9fe', accent: '#7c3aed', ion: 'library' },
    wishes: { tint: '#ffedd5', accent: '#ea580c', ion: 'gift' },
    plan: { tint: '#e0f2fe', accent: '#0284c7', ion: 'calendar' },
    chat: { tint: '#fce7f3', accent: '#db2777', ion: 'chatbubbles' },
    notes: { tint: '#ffedd5', accent: '#ea580c', ion: 'document-text' },
    games: { tint: '#fce7f3', accent: '#db2777', ion: 'game-controller' },
    lekser: { tint: '#ffedd5', accent: '#c2410c', ion: 'book' },
    leksehjelp: { tint: '#fef3c7', accent: '#d97706', ion: 'bulb' },
    mattehjelp: { tint: '#edf5ff', accent: '#245fef', ion: 'game-controller' },
    scratchMap: { tint: '#d1fae5', accent: '#059669', ion: 'earth' },
    reiseplanlegger: { tint: '#ccfbf1', accent: '#0d9488', ion: 'airplane' },
    familyTree: { tint: '#e0e7ff', accent: '#4f46e5', ion: 'git-network' },
    rememberDates: { tint: '#fce7f3', accent: '#be185d', ion: 'alarm' },
    activities: { tint: '#dcfce7', accent: '#16a34a', ion: 'fitness' },
    location: { tint: '#cffafe', accent: '#0891b2', ion: 'navigate' },
    documents: { tint: '#e2e8f0', accent: '#475569', ion: 'folder-open' },
    all: { tint: '#d1fae5', accent: '#059669', ion: 'apps' },
  };
  return map[appId] || { tint: '#eef2ff', accent: '#4f46e5', ion: 'grid' };
}

export function childShortcutLabel(app) {
  if (!app) return '';
  const map = {
    skole: 'Skole',
    books: 'Bokhylla',
    wishes: 'Ønsker',
    chores: 'Gjøremål',
    plan: 'Kalender',
    games: 'FamilieSpill',
    lekser: 'Lekser',
    rememberDates: 'Husk dato',
  };
  return map[app.id] || app.label || '';
}

/**
 * Kort «hva skjer i morgen»-oversikt for barnehjem — så barna kan forberede seg.
 * Rene data: events/tasks for i morgen + forberedelseshint fra avtaler.
 */
export function buildChildTomorrowOverview({
  events = [],
  tasks = [],
  dateLabel = '',
  eventLimit = 4,
  taskLimit = 3,
} = {}) {
  const eventRows = [...(events || [])]
    .filter(Boolean)
    .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')))
    .slice(0, Math.max(1, eventLimit))
    .map((ev) => {
      const kind = eventKind(ev);
      return {
        id: ev.id || `${ev.title}-${ev.startTime || 'all'}`,
        time: String(ev.startTime || '').slice(0, 5) || 'Heldag',
        title: ev.title || 'Avtale',
        place: ev.place || ev.location || '',
        color: ev.color || eventVisual(kind).accent,
        reminder: eventReminder(ev),
        kind,
        raw: ev,
      };
    });

  const taskRows = [...(tasks || [])]
    .filter(Boolean)
    .slice(0, Math.max(1, taskLimit))
    .map((task) => ({
      id: task.id,
      title: task.title || task.name || 'Gjøremål',
      raw: task,
    }));

  const eventCount = (events || []).length;
  const taskCount = (tasks || []).length;
  const empty = eventCount === 0 && taskCount === 0;
  const prepHints = eventRows
    .map((row) => row.reminder)
    .filter(Boolean)
    .slice(0, 2);

  let summary;
  if (empty) {
    summary = 'Ingenting planlagt i morgen — kos deg!';
  } else if (eventCount && taskCount) {
    summary = `${eventCount} avtale${eventCount === 1 ? '' : 'r'} og ${taskCount} gjøremål`;
  } else if (eventCount) {
    summary = `${eventCount} avtale${eventCount === 1 ? '' : 'r'} i morgen`;
  } else {
    summary = `${taskCount} gjøremål i morgen`;
  }

  return {
    title: 'Hva skjer i morgen?',
    dateLabel: dateLabel || '',
    summary,
    empty,
    eventCount,
    taskCount,
    events: eventRows,
    tasks: taskRows,
    prepHints,
  };
}
