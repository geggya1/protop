/**
 * Ren logikk for Husk dato — bursdager og nedtellinger.
 */

import { calculateAge, parseBirthday, startOfDay, toIsoDate } from './age.js';

export const REMEMBER_KINDS = {
  birthday: 'birthday',
  holiday: 'holiday',
  custom: 'custom',
};

/** Faste årlige merkedager (virtuelle til de legges til i familien). */
export const HOLIDAY_PRESETS = [
  { key: 'jul', title: 'Julaften', month: 12, day: 24, emoji: '🎄' },
  { key: 'nyttar', title: 'Nyttårsaften', month: 12, day: 31, emoji: '🎆' },
  { key: 'nyttarsdag', title: 'Nyttårsdag', month: 1, day: 1, emoji: '🥂' },
  { key: '17mai', title: '17. mai', month: 5, day: 17, emoji: '🇳🇴' },
  { key: '1mai', title: '1. mai', month: 5, day: 1, emoji: '🌷' },
  { key: 'valentine', title: 'Valentinsdagen', month: 2, day: 14, emoji: '❤️' },
  { key: 'kvinnedagen', title: 'Kvinnedagen', month: 3, day: 8, emoji: '💜' },
  { key: 'paske', title: 'Påskedag', month: 4, day: 1, emoji: '🐰', note: 'Omtrentlig — juster datoen' },
  { key: 'sankthans', title: 'Sankthansaften', month: 6, day: 23, emoji: '🔥' },
  { key: 'skolestart', title: 'Skolestart', month: 8, day: 20, emoji: '🎒', note: 'Juster til skolens dato' },
  { key: 'lucia', title: 'Luciadagen', month: 12, day: 13, emoji: '🕯️' },
  { key: 'halloween', title: 'Halloween', month: 10, day: 31, emoji: '🎃' },
  { key: 'mor', title: 'Morsdag', month: 2, day: 9, emoji: '💐', note: 'Andre søndag i februar — juster' },
  { key: 'far', title: 'Farsdag', month: 11, day: 9, emoji: '👔', note: 'Andre søndag i november — juster' },
];

export const EMOJI_CHOICES = [
  '🎂', '🎉', '🎄', '🎆', '❤️', '🎁', '✈️', '🏫', '💍', '🏠', '⚽', '🥳', '⭐', '🇳🇴',
];

export function emptyRememberForm(overrides = {}) {
  const today = startOfDay(new Date());
  const iso = toIsoDate(today);
  return {
    title: '',
    emoji: '🎉',
    dateKey: iso,
    yearly: true,
    kind: REMEMBER_KINDS.custom,
    presetKey: null,
    note: '',
    ...overrides,
  };
}

function safeMonthDay(month, day, year) {
  const m = Math.min(12, Math.max(1, Number(month) || 1));
  let d = Math.min(31, Math.max(1, Number(day) || 1));
  // Rull tilbake ugyldige datoer (f.eks. 31. april / 29. feb).
  for (let i = 0; i < 3; i += 1) {
    const dt = new Date(year, m - 1, d);
    if (dt.getFullYear() === year && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return dt;
    }
    d -= 1;
  }
  return new Date(year, m - 1, 1);
}

export function monthDayFromValue(value) {
  const d = parseBirthday(value);
  if (!d) return null;
  return { month: d.getMonth() + 1, day: d.getDate() };
}

/** Neste forekomst (start of day). null hvis engangsdato er ugyldig. */
export function nextOccurrence(item, now = new Date()) {
  if (!item) return null;
  const today = startOfDay(now);

  if (item.yearly === false) {
    const once = parseBirthday(item.dateKey);
    return once || null;
  }

  let month = Number(item.month);
  let day = Number(item.day);
  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    const md = monthDayFromValue(item.dateKey || item.birthday);
    if (!md) return null;
    month = md.month;
    day = md.day;
  }

  let next = safeMonthDay(month, day, today.getFullYear());
  if (next < today) {
    next = safeMonthDay(month, day, today.getFullYear() + 1);
  }
  return startOfDay(next);
}

export function daysUntil(date, now = new Date()) {
  const target = startOfDay(date);
  if (!target) return null;
  const today = startOfDay(now);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function formatCountdown(days) {
  if (days == null || !Number.isFinite(days)) return '';
  if (days < 0) return `${Math.abs(days)} dager siden`;
  if (days === 0) return 'I dag!';
  if (days === 1) return 'I morgen';
  return `${days} dager`;
}

export function formatNextDateLabel(date, lang = 'nb') {
  const d = startOfDay(date);
  if (!d) return '';
  const locale = lang === 'nb' ? 'nb-NO' : undefined;
  return d.toLocaleDateString(locale || 'nb-NO', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

/** Under tittel: dato + regelmessighet — uten «fyller N år», som blir feil neste år. */
export function formatRememberSubtitle(item) {
  if (!item) return '';
  const date = formatNextDateLabel(item.nextDate);
  if (item.yearly === false) {
    return date || item.note || item.subtitle || '';
  }
  if (date) return `${date} · gjentas hvert år`;
  return 'Gjentas hvert år';
}

export function turningAge(birthday, nextDate) {
  const birth = parseBirthday(birthday);
  const next = startOfDay(nextDate);
  if (!birth || !next) return null;
  const age = next.getFullYear() - birth.getFullYear();
  if (age < 0 || age > 120) return null;
  return age;
}

export function memberBirthdayItems(members = [], now = new Date()) {
  return (members || [])
    .filter((m) => m && m.birthday && parseBirthday(m.birthday))
    .map((m) => {
      const md = monthDayFromValue(m.birthday);
      const first = (m.name || 'Familiemedlem').split(' ')[0];
      const item = {
        id: `member:${m.id || m.docId || m.uid}`,
        source: 'member',
        kind: REMEMBER_KINDS.birthday,
        title: `${first}s bursdag`,
        emoji: '🎂',
        yearly: true,
        month: md.month,
        day: md.day,
        dateKey: toIsoDate(m.birthday),
        birthday: m.birthday,
        memberId: m.id || m.docId || null,
        memberUid: m.uid || null,
        memberName: m.name || first,
        role: m.role || null,
        photoURL: m.photoURL || null,
        avatarId: m.avatarId || null,
        color: m.color || null,
        readOnly: true,
      };
      const next = nextOccurrence(item, now);
      const days = daysUntil(next, now);
      const ageNow = calculateAge(m.birthday, now);
      const turns = turningAge(m.birthday, next);
      return {
        ...item,
        nextDate: next,
        daysUntil: days,
        ageNow,
        turningAge: turns,
        subtitle: formatRememberSubtitle({
          nextDate: next,
          yearly: true,
        }),
      };
    });
}

export function enrichRememberItem(raw, now = new Date()) {
  if (!raw) return null;
  const item = {
    source: raw.source || 'custom',
    kind: raw.kind || REMEMBER_KINDS.custom,
    yearly: raw.yearly !== false,
    emoji: raw.emoji || (raw.kind === REMEMBER_KINDS.birthday ? '🎂' : '🎉'),
    ...raw,
  };
  if ((!item.month || !item.day) && item.dateKey) {
    const md = monthDayFromValue(item.dateKey);
    if (md) {
      item.month = md.month;
      item.day = md.day;
    }
  }
  const next = nextOccurrence(item, now);
  if (!next && item.yearly === false) {
    // Engangsdato i fortiden — vis likevel sortert bakerst.
    const past = parseBirthday(item.dateKey);
    const days = past ? daysUntil(past, now) : null;
    return {
      ...item,
      nextDate: past,
      daysUntil: days,
      subtitle: item.note || formatCountdown(days),
    };
  }
  const days = daysUntil(next, now);
  const nextItem = { ...item, nextDate: next, daysUntil: days };
  let subtitle = formatRememberSubtitle(nextItem);
  if (item.note && item.yearly !== false) {
    subtitle = `${item.note} · ${subtitle}`;
  } else if (item.note && !subtitle) {
    subtitle = item.note;
  }
  return {
    ...nextItem,
    subtitle,
  };
}

export function availableHolidayPresets(customEvents = []) {
  const used = new Set(
    (customEvents || [])
      .map((e) => e.presetKey)
      .filter(Boolean),
  );
  return HOLIDAY_PRESETS.filter((p) => !used.has(p.key));
}

/** Slå sammen bursdager + egne hendelser, sortert etter nærmeste dato. */
export function buildUpcomingList({ members = [], events = [], now = new Date(), filter = 'all' } = {}) {
  const birthdays = memberBirthdayItems(members, now);
  const customs = (events || [])
    .filter((e) => e && e.deleted !== true)
    .map((e) => enrichRememberItem(e, now))
    .filter(Boolean);

  let rows = [...birthdays, ...customs];
  if (filter === 'birthday') {
    rows = rows.filter((r) => r.kind === REMEMBER_KINDS.birthday || r.source === 'member');
  } else if (filter === 'holiday') {
    rows = rows.filter((r) => r.kind === REMEMBER_KINDS.holiday || r.presetKey);
  } else if (filter === 'custom') {
    rows = rows.filter((r) => r.kind === REMEMBER_KINDS.custom && r.source !== 'member' && !r.presetKey);
  }

  rows.sort((a, b) => {
    const da = a.daysUntil;
    const db = b.daysUntil;
    const aPast = da == null || da < 0;
    const bPast = db == null || db < 0;
    if (aPast !== bPast) return aPast ? 1 : -1;
    if (da !== db) return (da ?? 9999) - (db ?? 9999);
    return String(a.title || '').localeCompare(String(b.title || ''), 'nb');
  });

  return rows;
}

export function assertRememberInput(data = {}) {
  const title = String(data.title || '').trim();
  if (!title) throw new Error('Skriv inn en tittel.');
  if (title.length > 60) throw new Error('Tittelen er for lang.');

  const dateKey = toIsoDate(data.dateKey);
  if (!dateKey) throw new Error('Velg en dato.');

  const md = monthDayFromValue(dateKey);
  const yearly = data.yearly !== false;
  const emoji = String(data.emoji || '🎉').trim().slice(0, 8) || '🎉';
  const kind = data.kind === REMEMBER_KINDS.holiday || data.kind === REMEMBER_KINDS.birthday
    ? data.kind
    : REMEMBER_KINDS.custom;
  const note = String(data.note || '').trim().slice(0, 120);
  const presetKey = data.presetKey ? String(data.presetKey).slice(0, 40) : null;

  return {
    title,
    emoji,
    dateKey,
    month: md.month,
    day: md.day,
    yearly,
    kind,
    note,
    presetKey,
  };
}
