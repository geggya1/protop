/**
 * Sammendrag for desktop-hjem-widgets (oppgaver, kalender, handleliste, måltid, notater).
 * Rene funksjoner — ingen Firestore.
 */

function tsMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}

function sortByTime(a, b) {
  return String(a.startTime || '').localeCompare(String(b.startTime || ''));
}

export function eventTimeLabel(ev) {
  if (!ev) return '';
  if (ev.startTime && ev.endTime) return `${ev.startTime}–${ev.endTime}`;
  if (ev.startTime) return ev.startTime;
  return 'Hele dagen';
}

export function summarizeEvents(events, { today = [], tomorrow = [] } = {}) {
  const todayList = (today.length || tomorrow.length)
    ? today
    : (events || []);
  const todaySorted = [...todayList].sort(sortByTime);
  const tomorrowSorted = [...tomorrow].sort(sortByTime);
  const firstToday = todaySorted[0];
  const firstTomorrow = tomorrowSorted[0];

  let headline = 'Ingen hendelser i familien i dag';
  if (todaySorted.length === 1 && firstToday) {
    headline = `I dag: ${eventTimeLabel(firstToday)} ${firstToday.title || 'Hendelse'}`;
  } else if (todaySorted.length > 1 && firstToday) {
    headline = `I dag: ${todaySorted.length} hendelser, først ${eventTimeLabel(firstToday)} ${firstToday.title || ''}`.trim();
  } else if (tomorrowSorted.length && firstTomorrow) {
    headline = `I morgen: ${eventTimeLabel(firstTomorrow)} ${firstTomorrow.title || 'Hendelse'}`;
  }

  const peek = [];
  todaySorted.slice(0, 4).forEach((ev) => {
    peek.push({
      id: ev.id,
      when: 'I dag',
      time: eventTimeLabel(ev),
      title: ev.title || 'Hendelse',
      place: ev.place || '',
      event: ev,
    });
  });
  if (peek.length < 5) {
    tomorrowSorted.slice(0, 5 - peek.length).forEach((ev) => {
      peek.push({
        id: ev.id,
        when: 'I morgen',
        time: eventTimeLabel(ev),
        title: ev.title || 'Hendelse',
        place: ev.place || '',
        event: ev,
      });
    });
  }

  return {
    todayCount: todaySorted.length,
    tomorrowCount: tomorrowSorted.length,
    headline,
    items: peek,
  };
}

export function summarizeTasks(tasks, { limit = 4 } = {}) {
  const open = (tasks || []).filter(Boolean);
  const overdue = open.filter((t) => t._overdue);
  const items = [...open]
    .sort((a, b) => {
      if (!!a._overdue !== !!b._overdue) return a._overdue ? -1 : 1;
      return String(a.deadline || a.dueDate || '').localeCompare(String(b.deadline || b.dueDate || ''));
    })
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      title: t.title || 'Oppgave',
      meta: t._overdue ? 'Forfalt' : (t.deadlineTime ? `Frist ${t.deadlineTime}` : (t.deadline || t.dueDate ? 'I dag' : 'Åpen')),
    }));
  let headline = 'Ingen åpne oppgaver i dag';
  if (open.length === 1) headline = overdue.length ? '1 forfalt oppgave' : '1 åpen oppgave i dag';
  else if (open.length > 1) {
    headline = overdue.length
      ? `${open.length} åpne · ${overdue.length} forfalt`
      : `${open.length} åpne oppgaver i dag`;
  }
  return { count: open.length, overdue: overdue.length, headline, items };
}

export function summarizeMeals(meals, todayKey, { limit = 3 } = {}) {
  const today = (meals || []).filter((m) => m && !m.deleted && m.dateKey === todayKey);
  const items = today.slice(0, limit).map((m) => ({
    id: m.id,
    title: m.title || 'Måltid',
    meta: m.tag || 'Middag',
    imageUrl: m.imageUrl || '',
  }));
  let headline = 'Ingen måltid planlagt i dag';
  if (today.length === 1) headline = today[0].title || 'Ett måltid i dag';
  else if (today.length > 1) headline = `${today.length} måltider i dag`;
  return { count: today.length, headline, items };
}

export function summarizeNotes(notes, { limit = 3 } = {}) {
  const list = [...(notes || [])]
    .sort((a, b) => tsMs(b.updatedAt || b.createdAt) - tsMs(a.updatedAt || a.createdAt))
    .slice(0, limit)
    .map((n) => ({
      id: n.id,
      title: n.title || 'Uten tittel',
      meta: n.summary || (n.body ? String(n.body).replace(/\s+/g, ' ').slice(0, 80) : 'Notat'),
    }));
  let headline = 'Ingen notater ennå';
  if (list.length === 1) headline = 'Siste notat';
  else if (list.length > 1) headline = `${(notes || []).length} notater`;
  return { count: (notes || []).length, headline, items: list };
}

export function summarizeShopping(lists, openByList = {}, { limit = 4 } = {}) {
  const rows = (lists || []).map((list) => ({
    id: list.id,
    title: list.name || 'Handleliste',
    open: Number(openByList[list.id] || 0),
  }));
  const withOpen = rows.filter((r) => r.open > 0);
  const shown = (withOpen.length ? withOpen : rows).slice(0, limit);
  const totalOpen = rows.reduce((sum, r) => sum + r.open, 0);
  let headline = 'Ingen åpne handlevarer';
  if (totalOpen === 1) headline = '1 vare igjen å handle';
  else if (totalOpen > 1) headline = `${totalOpen} varer igjen å handle`;
  else if (rows.length) headline = `${rows.length} ${rows.length === 1 ? 'handleliste' : 'handlelister'}`;
  return {
    count: totalOpen,
    listCount: rows.length,
    headline,
    items: shown.map((r) => ({
      id: r.id,
      title: r.title,
      meta: r.open === 1 ? '1 vare' : `${r.open} varer`,
    })),
  };
}

/**
 * Én linje som samler «siste / neste» på tvers av apper.
 */
export function buildHomeDigest({ events, tasks, meals, notes, shopping } = {}) {
  const bits = [];
  if (events?.todayCount) bits.push(events.headline);
  else if (events?.tomorrowCount) bits.push(events.headline);
  if (tasks?.count) bits.push(tasks.headline);
  if (meals?.count) bits.push(meals.headline);
  if (shopping?.count) bits.push(shopping.headline);
  if (!bits.length && notes?.count) bits.push(notes.headline);
  if (!bits.length) return 'Alt rolig — ingen åpne saker akkurat nå.';
  return bits.slice(0, 3).join(' · ');
}
