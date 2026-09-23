import { getGreetingPeriod } from './timeGreeting.js';
import { eventOccursOnDate } from './events.js';

export function deskGreetingTitle(date = new Date(), firstName = '') {
  const hour = date.getHours();
  let hello = 'Hei';
  if (hour >= 5 && hour < 11) hello = 'God morgen';
  else if (hour >= 11 && hour < 17) hello = 'God dag';
  else if (hour >= 17 && hour < 22) hello = 'God kveld';
  else hello = 'Hei';
  const name = firstName ? `, ${firstName}` : '';
  return `${hello}${name}`;
}

export function deskGreetingSub(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'La oss gjøre i dag til en super dag.';
  if (hour >= 17) return 'Her er det som gjenstår i kveld.';
  return 'Her er det som skjer i familien nå.';
}

export function deskGreetingEmoji(date = new Date()) {
  const period = getGreetingPeriod(date);
  if (period === 'morning') return '👋';
  if (period === 'evening') return '🌙';
  return '✨';
}

export function familyPulse({
  unread = 0,
  eventsToday = 0,
  tasksLeft = 0,
  choresLeft = 0,
} = {}) {
  if (unread > 0) {
    return {
      tone: 'warn',
      title: unread === 1 ? '1 varsel venter' : `${unread} varsler venter`,
      sub: 'Se hva som er nytt',
    };
  }
  if (tasksLeft === 0 && choresLeft === 0 && eventsToday === 0) {
    return { tone: 'ok', title: 'Du er oppdatert!', sub: 'Alt er i rute akkurat nå' };
  }
  if (tasksLeft === 0 && choresLeft === 0) {
    return {
      tone: 'ok',
      title: 'Oppgavene er unna',
      sub: eventsToday === 1 ? '1 avtale i dag' : `${eventsToday} avtaler i dag`,
    };
  }
  return { tone: 'focus', title: 'Noe å ta tak i i dag', sub: 'Se dagens fokus under' };
}

export function familyOnTrack(kids = []) {
  const withChores = (kids || []).filter((k) => Number(k.todayTotal) > 0);
  if (!kids?.length) {
    return { title: 'Familien', sub: 'Legg til barn for å følge dagen', ok: true };
  }
  if (!withChores.length) {
    return { title: 'Ingen gjøremål i dag', sub: `${kids.length} i familien`, ok: true };
  }
  const behind = withChores.filter((k) => k.todayDone < k.todayTotal);
  if (!behind.length) {
    return { title: 'Alle er i rute', sub: `${withChores.length} barn ferdige`, ok: true };
  }
  if (behind.length === 1) {
    const k = behind[0];
    return {
      title: `${k.name} har igjen`,
      sub: `${k.todayDone}/${k.todayTotal} gjøremål`,
      ok: false,
    };
  }
  return {
    title: `${behind.length} barn har igjen`,
    sub: 'Se familieoversikten',
    ok: false,
  };
}

export function childDayCopy({ remaining = 0, total = 0, done = 0 } = {}) {
  if (!total) {
    return { title: 'Ingen gjøremål i dag', sub: 'Kos deg — eller sjekk kalenderen.' };
  }
  if (remaining === 0) {
    return { title: 'Alle gjøremål er ferdig!', sub: 'Flott jobbet — du er stjerne i dag.' };
  }
  if (remaining === 1) {
    return { title: '1 gjøremål gjenstår', sub: 'Ett løft til, så er dagen i boks.' };
  }
  return {
    title: `${remaining} gjøremål gjenstår`,
    sub: `${done} av ${total} er ferdig. Du fikser dette.`,
  };
}

export function nextEventLine(events = []) {
  const list = (events || []).filter(Boolean);
  if (!list.length) return 'Ingen avtaler i dag';
  const first = list[0];
  const time = first.startTime || first.time || 'Hele dagen';
  const title = first.title || 'Hendelse';
  if (list.length === 1) return `Neste: ${time} ${title}`;
  return `${list.length} avtaler · neste ${time}`;
}

export function todayProgressPct({
  taskDone = 0,
  taskTotal = 0,
  choreDone = 0,
  choreTotal = 0,
} = {}) {
  const done = Number(taskDone) + Number(choreDone);
  const total = Number(taskTotal) + Number(choreTotal);
  if (total <= 0) return { pct: 100, done: 0, total: 0, empty: true };
  return {
    pct: Math.max(0, Math.min(100, Math.round((done / total) * 100))),
    done,
    total,
    empty: false,
  };
}

/**
 * Det en voksen bør vite på landingssiden — ikke appliste, men signaler.
 */
export function knowToday({
  overdue = 0,
  unread = 0,
  tomorrowTitles = [],
  kidsBehind = [],
  yesterdayWeak = false,
  dinnerMissing = false,
} = {}) {
  const items = [];
  if (overdue > 0) {
    items.push({
      id: 'overdue',
      icon: 'alert-circle',
      tone: 'danger',
      title: overdue === 1 ? '1 forfalt oppgave' : `${overdue} forfalte oppgaver`,
      sub: 'Ta dem først',
    });
  }
  if (unread > 0) {
    items.push({
      id: 'unread',
      icon: 'notifications',
      tone: 'warn',
      title: unread === 1 ? '1 varsel venter' : `${unread} varsler venter`,
      sub: 'Se hva som er nytt',
    });
  }
  if (kidsBehind.length === 1) {
    const k = kidsBehind[0];
    items.push({
      id: 'kid',
      icon: 'star',
      tone: 'focus',
      title: `${k.name} har gjøremål igjen`,
      sub: `${k.todayDone}/${k.todayTotal} ferdig`,
    });
  } else if (kidsBehind.length > 1) {
    items.push({
      id: 'kids',
      icon: 'people',
      tone: 'focus',
      title: `${kidsBehind.length} barn har igjen`,
      sub: kidsBehind.map((k) => k.name).join(', '),
    });
  }
  if (tomorrowTitles.length) {
    items.push({
      id: 'tomorrow',
      icon: 'calendar',
      tone: 'ok',
      title: 'I morgen',
      sub: tomorrowTitles.slice(0, 2).join(' · '),
    });
  }
  if (dinnerMissing) {
    items.push({
      id: 'dinner',
      icon: 'restaurant',
      tone: 'ok',
      title: 'Middag er ikke planlagt',
      sub: 'Planlegg kvelden før ettermiddagen',
    });
  }
  if (yesterdayWeak) {
    items.push({
      id: 'yesterday',
      icon: 'trending-down',
      tone: 'warn',
      title: 'Gårsdagen ble ufullstendig',
      sub: 'En myk start i dag hjelper',
    });
  }
  if (!items.length) {
    items.push({
      id: 'clear',
      icon: 'checkmark-circle',
      tone: 'ok',
      title: 'Ingenting haster',
      sub: 'Du er oppdatert — nyt overskuddet',
    });
  }
  return items.slice(0, 4);
}

export function childTip({ remaining = 0, total = 0 } = {}) {
  if (!total) return 'Kos deg i dag — og sjekk kalenderen om du lurer.';
  if (remaining === 0) return 'Vanen sitter! I morgen blir enda lettere.';
  if (remaining === 1) return 'Ett løft til, så er dagen i boks.';
  return 'Ett og ett gjøremål. Du fikser dette.';
}

export function memberDayStatus({ todayDone = 0, todayTotal = 0, isParent = false } = {}) {
  if (isParent) {
    if (todayTotal > 0 && todayDone >= todayTotal) return 'Klar for dagen';
    if (todayTotal > 0) return `${todayDone}/${todayTotal} oppgaver`;
    return 'Foresatt';
  }
  if (!todayTotal) return 'Ingen gjøremål';
  if (todayDone >= todayTotal) return 'Klar for dagen';
  return `${todayDone}/${todayTotal} gjøremål`;
}

export function taskFocusMeta(task) {
  if (!task) return { label: 'I dag', danger: false };
  if (task._overdue) return { label: task.deadlineTime ? `Frist ${task.deadlineTime}` : 'Forfalt', danger: true };
  if (task.deadlineTime) return { label: `Frist ${task.deadlineTime}`, danger: true };
  if (task.category) return { label: String(task.category), danger: false };
  return { label: 'I dag', danger: false };
}

function memberIdSet(member) {
  return new Set([member?.id, member?.uid, member?.childId, member?.docId].filter(Boolean));
}

function isExternalEvent(ev) {
  return !!(ev?.connectionId || ev?.private || ev?.readOnly || ev?.sourceLabel);
}

/** Familie-hendelser + Outlook/Google/ICS for én dag, sortert på klokkeslett. */
export function mergeDeskDayEvents(familyEvents = [], externalEvents = [], date) {
  const extra = (externalEvents || []).filter((e) => eventOccursOnDate(e, date));
  const seen = new Set();
  const out = [];
  for (const ev of [...(familyEvents || []), ...extra]) {
    if (!ev) continue;
    if (ev.id) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
    }
    out.push(ev);
  }
  return out.sort((a, b) => String(a.startTime || '00:00').localeCompare(String(b.startTime || '00:00')));
}

export function eventSourceHint(ev) {
  if (!ev) return '';
  if (ev.graphCalendarName && ev.sourceLabel) {
    const label = String(ev.sourceLabel);
    if (!label.toLowerCase().includes(String(ev.graphCalendarName).toLowerCase())) {
      return `${label} · ${ev.graphCalendarName}`;
    }
  }
  if (ev.sourceLabel) return String(ev.sourceLabel);
  if (ev.graphCalendarName) return String(ev.graphCalendarName);
  if (ev.source === 'microsoft') return 'Outlook';
  if (ev.source === 'google') return 'Google';
  if (ev.source === 'ics') return 'ICS';
  if (ev.place) return String(ev.place);
  return '';
}

export function eventsForPerson(events = [], member, { uid } = {}) {
  const ids = memberIdSet(member);
  const isMe = !!(uid && (member?.uid === uid || member?.id === uid));
  return (events || []).filter((ev) => {
    if (!ev) return false;
    if (isExternalEvent(ev)) return isMe;
    const mids = ev.memberIds || [];
    if (!mids.length) return false;
    return mids.some((id) => ids.has(id));
  });
}

export function timeKeyFromDate(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Heldag uten klokkeslett, eller hendelse som ikke er ferdig ennå (bruker endTime hvis satt). */
export function isEventStillRelevant(ev, now = new Date()) {
  if (!ev) return false;
  if (!ev.startTime) return true;
  const nowTime = timeKeyFromDate(now);
  const end = ev.endTime || ev.startTime;
  return String(end) >= nowTime;
}

/** Hendelser som gjenstår i dag, sortert som inn — valgfri grense (f.eks. 3 på hjemskjerm). */
export function upcomingDayEvents(events = [], now = new Date(), limit) {
  const list = (events || []).filter((e) => isEventStillRelevant(e, now));
  return typeof limit === 'number' ? list.slice(0, limit) : list;
}

export function nextTimedEvent(events = [], now = new Date()) {
  const list = (events || []).filter(Boolean);
  if (!list.length) return null;
  return list.find((e) => isEventStillRelevant(e, now)) || null;
}

export function memberNextLine(events = [], member, { uid, now } = {}) {
  const next = nextTimedEvent(eventsForPerson(events, member, { uid }), now);
  if (!next) return '';
  const time = next.startTime || 'Heldag';
  const title = next.title || 'Hendelse';
  return `${time}  ${title}`;
}

/** Fra kveld: forhåndsvis i morgen. Ellers: i dag. */
export function homeFocusIsTomorrow(date = new Date()) {
  return date.getHours() >= 17;
}

/** Tekster for hjem-fokus: må matche om timeline viser i dag eller i morgen. */
export function homeFocusCopy(focusTomorrow = false) {
  if (focusTomorrow) {
    return {
      focusLabel: 'I morgen',
      focusEyebrow: 'FOKUS I MORGEN',
      focusCta: 'Se morgendagens plan',
      appointmentsTitle: 'Avtaler i morgen',
      planTitle: 'Morgendagens plan',
      focusSubWithEvent: 'Et viktig punkt i morgen. Her er planene klare.',
      focusSubEmpty: 'Ingen faste avtaler – nyt kvelden.',
      focusTitleEmpty: 'En rolig dag i morgen',
      dayIdle: 'I morgen er ledig',
    };
  }
  return {
    focusLabel: 'I dag',
    focusEyebrow: 'DAGENS FOKUS',
    focusCta: 'Se dagens plan',
    appointmentsTitle: 'Dagens avtaler',
    planTitle: 'Dagens plan',
    focusSubWithEvent: 'Et viktig punkt i dag. Her er dagens planer klare.',
    focusSubEmpty: 'Ingen faste avtaler – nyt dagen.',
    focusTitleEmpty: 'En rolig dag',
    dayIdle: 'Dagen er ledig',
  };
}

/** Morgen < 12, ettermiddag 12–17, kveld ≥ 17. Heldag uten klokkeslett → morgen. */
export function eventDayPeriod(ev) {
  const raw = String(ev?.startTime || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(raw)) return 'morning';
  const hour = Number(raw.slice(0, 2));
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function groupEventsByDayPeriod(events = []) {
  const groups = { morning: [], afternoon: [], evening: [] };
  (events || []).forEach((ev) => {
    if (!ev) return;
    groups[eventDayPeriod(ev)].push(ev);
  });
  return groups;
}

/** «Adelen og Celine» / «Adelen, Celine og Vera». */
export function joinFirstNames(people = []) {
  const names = (people || [])
    .map((p) => String(p?.name || p?.displayName || '').trim().split(/\s+/)[0])
    .filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} og ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}`;
}

/**
 * Kort «Før i morgen» / «Før i dag» fra eksisterende apper (oppgaver, handle, middag).
 * Ingen nye apper — bare sammendrag av det som allerede finnes.
 */
export function buildPrepareFocus({
  focusTomorrow = false,
  openTasks = [],
  shopCount = 0,
  shopLabel = 'Handleliste',
  dinnerMissing = false,
  dinnerTitle = '',
  includeDinner = true,
} = {}) {
  const checklist = [];
  const open = (openTasks || []).filter(Boolean);
  const firstTask = open.find((t) => t?.title);
  checklist.push({
    id: 'tasks',
    done: open.length === 0,
    label: firstTask?.title || 'Oppgaver',
    action: { type: 'tab', tab: 'stars' },
  });

  checklist.push({
    id: 'shop',
    done: Number(shopCount || 0) <= 0,
    label: shopLabel || 'Handleliste',
    action: { type: 'tab', tab: 'more', subView: 'shop' },
  });

  if (includeDinner) {
    checklist.push({
      id: 'dinner',
      done: !dinnerMissing,
      label: dinnerMissing ? 'Planlegg middag' : (dinnerTitle || 'Middag'),
      action: { type: 'tab', tab: 'more', subView: 'meals' },
    });
  }

  const remaining = checklist.filter((c) => !c.done);
  const done = checklist.length - remaining.length;
  const eyebrow = focusTomorrow ? 'Før i morgen' : 'Før i dag';
  let headline = 'Alt er klart';
  if (remaining.length === 1) headline = '1 ting gjenstår';
  else if (remaining.length > 1) headline = `${remaining.length} ting gjenstår`;

  let subLine = focusTomorrow ? 'Klar for i morgen' : 'Dagen er i rute';
  if (remaining.length === 1) subLine = remaining[0].label;
  else if (remaining.length === 2) subLine = `${remaining[0].label} og ${remaining[1].label}`;
  else if (remaining.length > 2) {
    subLine = `${remaining.slice(0, -1).map((r) => r.label).join(', ')} og ${remaining[remaining.length - 1].label}`;
  }

  return {
    eyebrow,
    headline,
    sub: subLine,
    done,
    total: checklist.length,
    remaining,
    primaryAction: remaining[0]?.action || { type: 'tab', tab: 'stars' },
    empty: remaining.length === 0,
  };
}

/** Kort tittel for tidslinje-chip («Fotball trening» → «Fotball»). */
export function timelineEventLabel(ev) {
  const title = String(ev?.title || 'Hendelse').trim();
  if (!title) return 'Hendelse';
  const first = title.split(/\s+/)[0];
  return first.length <= 14 ? first : `${first.slice(0, 13)}…`;
}
