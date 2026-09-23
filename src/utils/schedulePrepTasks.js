/** Huskeoppgaver kvelden før / om morgenen for gym, svømming o.l. */

export const PREP_RULES = [
  {
    id: 'gym',
    match: /kroppsøving|kroppsoving|\bgym\b|gym\/|gymtøy|idrett|gymnastikk/i,
    eveningTitle: 'Husk gymtøy',
    eveningDesc: 'Legg frem gymtøy kvelden før kroppsøving.',
    morningTitle: 'Pakk gymtøy',
    morningDesc: 'Husk å ha gymtøy i sekken i dag.',
  },
  {
    id: 'swim',
    match: /svøm|svom|badetøy|bading|basseng/i,
    eveningTitle: 'Husk svømmetøy',
    eveningDesc: 'Legg frem svømmetøy og håndkle kvelden før.',
    morningTitle: 'Pakk svømmetøy',
    morningDesc: 'Husk svømmetøy og håndkle i sekken i dag.',
  },
];

const DAY_TO_JS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const JS_TO_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS = {
  mon: 'mandag', tue: 'tirsdag', wed: 'onsdag', thu: 'torsdag', fri: 'fredag', sat: 'lørdag', sun: 'søndag',
};

function previousDayKey(day) {
  const js = DAY_TO_JS[day];
  if (js == null) return null;
  return JS_TO_DAY[(js + 6) % 7];
}

function suggestionBlob(item) {
  return `${item?.title || ''} ${item?.subject || ''} ${item?.description || ''}`;
}

function alreadyHasPrep(suggestions, { title, daysOfWeek, when, sourceDay }) {
  const needle = String(title || '').toLowerCase().slice(0, 12);
  if (!needle) return false;
  return (suggestions || []).some((s) => {
    if (s?.kind && s.kind !== 'todo') return false;
    const t = String(s?.title || '').toLowerCase();
    if (!t.includes(needle)) return false;
    if (when && s.prepWhen && s.prepWhen !== when) return false;
    if (sourceDay && s.sourceDay && s.sourceDay !== sourceDay) return false;
    if (daysOfWeek?.length && Array.isArray(s.daysOfWeek) && s.daysOfWeek.length) {
      return daysOfWeek.some((d) => s.daysOfWeek.includes(d));
    }
    // AI kan returnere generisk «Husk gymtøy» uten dag — ikke blokker uke-spesifikke forslag.
    if (!s.sourceDay && !(s.daysOfWeek?.length) && !s.day) return false;
    return true;
  });
}

function nextDateKeyForJsDay(jsDay, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 8; i += 1) {
    if (d.getDay() === jsDay) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function buildPrepTodo({
  id, title, description, daysOfWeek, dateHint, sourceDay, when,
}) {
  return {
    id,
    selected: false,
    kind: 'todo',
    title,
    description,
    confidence: 0.82,
    type: 'weekly',
    daysOfWeek,
    day: JS_TO_DAY[daysOfWeek[0]] || null,
    time: null,
    endTime: null,
    subject: null,
    dateHint,
    category: 'gjøremål',
    points: 5,
    prepTask: true,
    prepWhen: when,
    sourceDay,
  };
}

/**
 * Lag valgfrie huskeoppgaver (kveld før / morgen) ut fra timeplan-fag.
 * Returnerer kun nye todos som ikke allerede finnes i suggestions.
 */
export function buildPrepTaskSuggestions(suggestions = []) {
  const slots = (suggestions || []).filter((s) => (
    (s?.kind === 'schedule_slot' || s?.kind === 'event')
    && (s?.day || (Array.isArray(s?.daysOfWeek) && s.daysOfWeek.length))
  ));
  const extra = [];
  const seen = new Set();

  slots.forEach((slot) => {
    const blob = suggestionBlob(slot);
    const day = slot.day
      || (slot.daysOfWeek?.length ? JS_TO_DAY[slot.daysOfWeek[0]] : null);
    if (!day || DAY_TO_JS[day] == null) return;

    PREP_RULES.forEach((rule) => {
      if (!rule.match.test(blob)) return;
      const key = `${rule.id}:${day}`;
      if (seen.has(key)) return;
      seen.add(key);

      const prev = previousDayKey(day);
      const lessonJs = DAY_TO_JS[day];
      const prevJs = DAY_TO_JS[prev];
      const dayLabel = DAY_LABELS[day] || day;

      const eveDays = prevJs != null ? [prevJs] : [];
      if (!alreadyHasPrep(suggestions.concat(extra), {
        title: rule.eveningTitle,
        daysOfWeek: eveDays,
        when: 'evening',
        sourceDay: day,
      })) {
        extra.push(buildPrepTodo({
          id: `prep-${rule.id}-eve-${day}`,
          title: rule.eveningTitle,
          description: `${rule.eveningDesc} (${dayLabel})`,
          daysOfWeek: eveDays,
          dateHint: nextDateKeyForJsDay(prevJs),
          sourceDay: day,
          when: 'evening',
        }));
      }
      if (!alreadyHasPrep(suggestions.concat(extra), {
        title: rule.morningTitle,
        daysOfWeek: [lessonJs],
        when: 'morning',
        sourceDay: day,
      })) {
        extra.push(buildPrepTodo({
          id: `prep-${rule.id}-morn-${day}`,
          title: rule.morningTitle,
          description: `${rule.morningDesc} (${dayLabel})`,
          daysOfWeek: [lessonJs],
          dateHint: nextDateKeyForJsDay(lessonJs),
          sourceDay: day,
          when: 'morning',
        }));
      }
    });
  });

  return extra;
}

export function mergePrepTaskSuggestions(suggestions = []) {
  const extra = buildPrepTaskSuggestions(suggestions);
  if (!extra.length) return suggestions;
  return [...suggestions, ...extra];
}

export function partitionImportSuggestions(suggestions = []) {
  const prep = [];
  const slots = [];
  const rest = [];
  (suggestions || []).forEach((s) => {
    if (s?.prepTask || s?.prepWhen) prep.push(s);
    else if (s?.kind === 'schedule_slot') slots.push(s);
    else rest.push(s);
  });
  return { prep, slots, rest };
}

const WEEKDAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const WEEKDAY_GROUP_LABELS = {
  mon: 'Mandag',
  tue: 'Tirsdag',
  wed: 'Onsdag',
  thu: 'Torsdag',
  fri: 'Fredag',
  sat: 'Lørdag',
  sun: 'Søndag',
};

function slotTimeMinutes(time) {
  const m = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 9999;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Grupper timeplan-forslag dag for dag, sortert etter klokkeslett innen hver dag. */
export function groupScheduleSlotsByDay(slots = []) {
  const byDay = new Map();
  (slots || []).forEach((slot) => {
    const day = slot?.day || 'mon';
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(slot);
  });
  return WEEKDAY_ORDER
    .filter((day) => byDay.has(day))
    .map((day) => ({
      day,
      label: WEEKDAY_GROUP_LABELS[day] || day,
      items: byDay.get(day).sort(
        (a, b) => slotTimeMinutes(a.time) - slotTimeMinutes(b.time)
          || slotTimeMinutes(a.endTime) - slotTimeMinutes(b.endTime)
          || String(a.title || '').localeCompare(String(b.title || ''), 'nb'),
      ),
    }));
}
