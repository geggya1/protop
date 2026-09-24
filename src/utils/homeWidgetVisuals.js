/**
 * Visual helpers for iOS-style home widgets.
 * Pure functions — icon/color mapping, fallbacks, week columns.
 */

function norm(value) {
  return String(value || '').toLowerCase();
}

function matchAny(text, keys) {
  return keys.some((k) => text.includes(k));
}

const GROCERY_RULES = [
  { keys: ['melk', 'milk', 'yoghurt', 'yogurt', 'rømme'], icon: 'water', bg: '#4A90D9', color: '#fff' },
  { keys: ['brød', 'bread', 'loff', 'rundstyk'], icon: 'nutrition', bg: '#C9956A', color: '#fff' },
  { keys: ['banan', 'banana', 'eple', 'frukt', 'pære'], icon: 'nutrition', bg: '#E8C547', color: '#fff' },
  { keys: ['taco', 'lefse', 'pizza', 'burger'], icon: 'fast-food', bg: '#E85D4C', color: '#fff' },
  { keys: ['fisk', 'laks', 'torsk'], icon: 'fish', bg: '#5B8FB8', color: '#fff' },
  { keys: ['kaffe', 'te'], icon: 'cafe', bg: '#6F4E37', color: '#fff' },
  { keys: ['ost', 'smør', 'egg'], icon: 'nutrition', bg: '#F0C040', color: '#5A3A10' },
  { keys: ['salat', 'grønn', 'agurk', 'tomat'], icon: 'leaf', bg: '#5AA86A', color: '#fff' },
  { keys: ['is', 'sjokolade', 'kake'], icon: 'ice-cream', bg: '#E07A9A', color: '#fff' },
];

export function groceryVisual(title) {
  const t = norm(title);
  const hit = GROCERY_RULES.find((r) => matchAny(t, r.keys));
  return hit || { icon: 'basket', bg: '#6B8FBE', color: '#fff' };
}

const EVENT_RULES = [
  { keys: ['fotball', 'ball', 'trening', 'sport'], icon: 'football', bg: '#2F80ED', color: '#fff', bar: '#2F80ED' },
  { keys: ['svøm', 'swim'], icon: 'water', bg: '#2F80ED', color: '#fff', bar: '#2F80ED' },
  { keys: ['turn', 'gym', 'dans'], icon: 'fitness', bg: '#34C759', color: '#fff', bar: '#34C759' },
  { keys: ['lege', 'emt', 'tann', 'helse', 'doktor'], icon: 'medkit', bg: '#E85D4C', color: '#fff', bar: '#E85D4C' },
  { keys: ['lunsj', 'middag', 'frokost', 'mat'], icon: 'restaurant', bg: '#34C759', color: '#fff', bar: '#34C759' },
  { keys: ['kjøre', 'skyss', 'hente', 'bil'], icon: 'car', bg: '#34C759', color: '#fff', bar: '#34C759' },
  { keys: ['skole', 'lekse', 'fag'], icon: 'school', bg: '#2F80ED', color: '#fff', bar: '#5B63A6' },
  { keys: ['møte', 'team', 'foreldre', 'samtale'], icon: 'people', bg: '#8E8E93', color: '#fff', bar: '#5B63A6' },
  { keys: ['kino', 'film'], icon: 'film', bg: '#7C3AED', color: '#fff', bar: '#7C3AED' },
];

export function eventVisual(title, fallbackBar) {
  const t = norm(title);
  const hit = EVENT_RULES.find((r) => matchAny(t, r.keys));
  if (hit) return hit;
  return {
    icon: 'calendar',
    bg: '#5B63A6',
    color: '#fff',
    bar: fallbackBar || '#3B82F6',
  };
}

const MEAL_SLOTS = [
  { id: 'breakfast', title: 'Frokost', keys: ['frokost', 'breakfast'], icon: 'cafe', bg: '#C9953A', accent: '#E8A317' },
  { id: 'dinner', title: 'Middag', keys: ['middag', 'dinner', 'laks', 'måltid'], icon: 'fish', bg: '#E07A7A', accent: '#E07A7A' },
  { id: 'lunch', title: 'Matpakke', keys: ['matpakke', 'lunsj', 'lunch', 'smørbrød'], icon: 'fast-food', bg: '#3DAA6A', accent: '#3DAA6A' },
];

export function mealVisual(tag, title) {
  const t = norm(`${tag} ${title}`);
  const hit = MEAL_SLOTS.find((s) => matchAny(t, s.keys));
  return hit || MEAL_SLOTS[1];
}

export function mealSlotsFromItems(items = []) {
  const used = new Set();
  const slots = MEAL_SLOTS.map((slot) => {
    const found = items.find((it) => {
      const vis = mealVisual(it.meta || it.tag, it.title);
      return vis.id === slot.id && !used.has(it.id);
    });
    if (found) {
      used.add(found.id);
      return {
        id: found.id,
        title: slot.title,
        meta: found.title || found.meta || 'Planlagt',
        icon: slot.icon,
        bg: slot.bg,
        accent: slot.accent,
      };
    }
    return null;
  }).filter(Boolean);

  if (slots.length) {
    return MEAL_SLOTS.map((slot) => {
      const existing = slots.find((s) => s.title === slot.title);
      return existing || {
        id: slot.id,
        title: slot.title,
        meta: 'Ikke planlagt',
        icon: slot.icon,
        bg: slot.bg,
        accent: slot.accent,
      };
    });
  }
  return FALLBACK_MEALS;
}

const WISH_RULES = [
  { keys: ['fotball', 'ball', 'sport'], icon: 'football', bg: '#34C759' },
  { keys: ['bok', 'les'], icon: 'book', bg: '#2F80ED' },
  { keys: ['spill', 'game', 'leke'], icon: 'game-controller', bg: '#7C3AED' },
  { keys: ['sykkel', 'sparkesykkel'], icon: 'bicycle', bg: '#E85D4C' },
];

export function wishVisual(title) {
  const t = norm(title);
  const hit = WISH_RULES.find((r) => matchAny(t, r.keys));
  return hit || { icon: 'gift', bg: '#E07A9A' };
}

const PEOPLE_TINTS = ['#F3B6C2', '#8EB4F0', '#B9A6F0', '#F0B36A', '#8ED0A4', '#E8A07A'];

export function personTint(index) {
  return PEOPLE_TINTS[index % PEOPLE_TINTS.length];
}

export function initialOf(name) {
  const s = String(name || '').trim();
  return s ? s.slice(0, 1).toUpperCase() : '?';
}

export function firstName(person) {
  return String(person?.name || person?.displayName || '').split(' ')[0] || 'Noen';
}

const WEEK_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre'];

function mondayIndex(date) {
  const d = date instanceof Date ? date : new Date();
  return (d.getDay() + 6) % 7;
}

/**
 * Build Mon–Fri columns. Today/tomorrow get real event hints; other days
 * stay empty unless fallbacks are requested.
 */
export function weekColumns({
  eventsToday = [],
  eventsTomorrow = [],
  now = new Date(),
  useFallback = false,
  dayCount = 5,
} = {}) {
  const todayIdx = mondayIndex(now);
  if (todayIdx > 4 && useFallback) {
    return sliceWeekDays(FALLBACK_WEEK_DAYS, todayIdx, dayCount);
  }

  const all = WEEK_LABELS.map((label, i) => {
    let items = [];
    if (i === todayIdx) {
      items = (eventsToday || []).slice(0, 3).map((ev) => hintFromEvent(ev));
    } else if (i === todayIdx + 1) {
      items = (eventsTomorrow || []).slice(0, 3).map((ev) => hintFromEvent(ev));
    }
    if (!items.length && useFallback) {
      return FALLBACK_WEEK_DAYS[i] || { id: label, label, items: [] };
    }
    return { id: label, label, items };
  });
  return sliceWeekDays(all, todayIdx, dayCount);
}

function sliceWeekDays(days, todayIdx, dayCount) {
  const n = Math.max(1, Math.min(5, Number(dayCount) || 5));
  if (n >= days.length) return days;
  const start = Math.max(0, Math.min(days.length - n, todayIdx <= 4 ? Math.max(0, todayIdx - 1) : 0));
  return days.slice(start, start + n);
}

function hintFromEvent(ev) {
  const title = ev.title || ev.hint || 'Avtale';
  const vis = eventVisual(title, ev.color);
  return { label: String(title).split(' ')[0], color: vis.bar, icon: vis.icon };
}

export const FALLBACK_SHOP = [
  { id: 's1', title: 'Melk', done: true },
  { id: 's2', title: 'Brød', done: false },
  { id: 's3', title: 'Bananer', done: true },
  { id: 's4', title: 'Tacolefser', done: false },
];

export const FALLBACK_CHAT = [
  { id: 'c1', name: 'Mamma', preview: 'Husk regntøy i morgen', time: '21:08', tint: '#F3B6C2' },
  { id: 'c2', name: 'Pappa', preview: 'Jeg henter kl. 16', time: '20:42', tint: '#8EB4F0' },
  { id: 'c3', name: 'Celine', preview: 'Kan jeg ta med bok?', time: '19:55', tint: '#B9A6F0' },
];

export const FALLBACK_EVENTS = [
  {
    id: 'e1', time: '09:00', end: '10:00', title: 'Teammøte',
    place: 'Møterom 1, Kontoret', color: '#2F80ED',
  },
  {
    id: 'e2', time: '12:00', end: '13:00', title: 'Lunsj med Anna',
    place: 'Baker Hansen, Sentrum', color: '#34C759',
  },
  {
    id: 'e3', time: '15:00', end: '16:30', title: 'Foreldresamtale',
    place: 'Skolen', color: '#7C3AED',
  },
];

export const FALLBACK_TIMELINE = [
  { id: 't1', time: '07:30', title: 'Kjøre til skolen', color: '#34C759' },
  { id: 't2', time: '14:00', title: 'Legetime (EMT)', color: '#E85D4C' },
  { id: 't3', time: '17:30', title: 'Fotballtrening', color: '#2F80ED' },
];

export const FALLBACK_MEALS = [
  { id: 'breakfast', title: 'Frokost', meta: 'Havregrøt', icon: 'cafe', bg: '#C9953A', accent: '#E8A317' },
  { id: 'dinner', title: 'Middag', meta: 'Laks og ris', icon: 'fish', bg: '#E07A7A', accent: '#E07A7A' },
  { id: 'lunch', title: 'Matpakke', meta: 'Smørbrød', icon: 'fast-food', bg: '#3DAA6A', accent: '#3DAA6A' },
];

export const FALLBACK_TASKS = [
  { id: 'k1', title: 'Gå tur med hunden', meta: 'I dag', done: true },
  { id: 'k2', title: 'Gjør lekser', meta: 'I dag', done: true },
  { id: 'k3', title: 'Rydd rommet', meta: 'I dag', done: false },
];

export const FALLBACK_NOTES = [
  { id: 'n1', title: 'Dagens notat', meta: 'Husk gymtøy, lever bibliotekbok og ta med frukt.', highlight: true },
  { id: 'n2', title: 'Handle', meta: 'Melk, brød og yoghurt', highlight: false },
];

export const FALLBACK_WEEK_DAYS = [
  { id: 'Man', label: 'Man', items: [
    { label: 'Skole', color: '#34C759' },
    { label: 'Trening', color: '#E85D4C' },
    { label: 'Middag', color: '#E8A317' },
  ] },
  { id: 'Tir', label: 'Tir', items: [
    { label: 'Jobb', color: '#2F80ED' },
    { label: 'Legetime', color: '#E85D4C' },
  ] },
  { id: 'Ons', label: 'Ons', items: [
    { label: 'Skole', color: '#34C759' },
    { label: 'Foreldremøte', color: '#7C3AED' },
    { label: 'Middag', color: '#E8A317' },
  ] },
  { id: 'Tor', label: 'Tor', items: [
    { label: 'Jobb', color: '#2F80ED' },
    { label: 'Trening', color: '#E85D4C' },
  ] },
  { id: 'Fre', label: 'Fre', items: [
    { label: 'Skole', color: '#34C759' },
    { label: 'Middag', color: '#E8A317' },
  ] },
];

export const FALLBACK_DATES = [
  { id: 'd1', title: 'Mamma bursdag', meta: 'Om 2 dager', icon: 'gift', bg: '#F3B6C2' },
  { id: 'd2', title: 'Foreldremøte', meta: 'Torsdag 18:00', icon: 'people', bg: '#8EB4F0' },
];

export const FALLBACK_ACTIVITIES = [
  { id: 'a1', time: '17:00', title: 'Fotballtrening', meta: '17:00 i dag' },
  { id: 'a2', time: '18:30', title: 'Svømming', meta: 'Fredag 18:30' },
];

export const FALLBACK_WISHES = [
  { id: 'w1', title: 'Fotball', meta: 'Ønsket av Lucas' },
  { id: 'w2', title: 'Ny bok', meta: 'Lagt til i dag' },
];

export const FALLBACK_BOOKS = [
  { id: 'b1', title: 'Dagens bok', meta: 'Mysteriet i skogen', icon: 'book', bg: '#2F80ED' },
  { id: 'b2', title: 'Lest i dag', meta: 'Mål 20 min', progress: '18 min', icon: null, bg: null },
  { id: 'b3', title: 'Neste', meta: 'Fortsett kapittel 4', icon: 'document-text', bg: '#7C3AED' },
];

export const FALLBACK_TRIPS = [
  { id: 'tr1', title: 'Danmark', meta: 'Avreise fredag', icon: 'map', bg: '#2F80ED' },
  { id: 'tr2', title: 'Pakkeliste', meta: '6 av 8 ting klare', icon: 'checkbox', bg: '#7C3AED' },
];

export const FALLBACK_SCHOOL = [
  { id: 'sc1', time: '08:15–09:00', title: 'Norsk', meta: '', icon: 'book', bg: '#16a34a' },
  { id: 'sc2', time: '09:15–10:00', title: 'Matematikk', meta: '', icon: 'calculator', bg: '#2563eb' },
  { id: 'sc3', time: '11:30–12:15', title: 'Kroppsøving', meta: '', icon: 'walk', bg: '#0d9488' },
];

export const FALLBACK_HOMEWORK = [
  { id: 'h1', time: '15 min', title: 'Matte', meta: 'Brøk og prosent', icon: 'calculator', bg: '#2F80ED' },
  { id: 'h2', title: 'Lesing', meta: '2 sider igjen', icon: 'book', bg: '#7C3AED' },
];

/**
 * Use catalog fallbacks only in the public preview (`demo: true`).
 * Live homes keep an empty list so we never invent family data.
 */
export function withFallback(list, fallback, { demo = false } = {}) {
  if (Array.isArray(list) && list.length) return list;
  return demo ? fallback : [];
}

/**
 * Coerce place/location fields to a safe React text string.
 * Profiles and events often store `{ label, lat, lng, placeId, source }`.
 */
export function placeText(value) {
  if (value == null || value === false) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  if (typeof value !== 'object') return '';
  const label = value.label ?? value.name ?? value.shortName ?? value.title ?? value.address;
  if (label == null || typeof label === 'object') return '';
  return String(label).trim();
}

export function progressPct(done, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}
