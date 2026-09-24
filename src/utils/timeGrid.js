/** Tidslinje-hjelpere for Outlook-lignende uke-/dagsvisning. */

export function parseTimeToMinutes(str) {
  const raw = String(str || '').trim();
  const m = raw.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToTime(total) {
  const day = 24 * 60;
  let m = Math.round(Number(total) || 0) % day;
  if (m < 0) m += day;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function snapMinutes(min, step = 30) {
  return Math.round(min / step) * step;
}

/** Heldag når startTime mangler (matcher EventForm). */
export function isAllDayEvent(ev) {
  return !parseTimeToMinutes(ev?.startTime);
}

export function eventStartEndMinutes(ev) {
  const start = parseTimeToMinutes(ev?.startTime);
  if (start == null) return null;
  let end = parseTimeToMinutes(ev?.endTime);
  if (end == null || end <= start) end = Math.min(24 * 60, start + 60);
  return { start, end };
}

/**
 * Kolonne-layout for overlappende timed events.
 * Returnerer { event, start, end, col, colCount }.
 */
export function layoutTimedEvents(events) {
  const items = (events || [])
    .map((event) => {
      const span = eventStartEndMinutes(event);
      if (!span) return null;
      return { event, start: span.start, end: span.end };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end || String(a.event.id).localeCompare(String(b.event.id)));

  const clusters = [];
  let cur = [];
  let curEnd = -1;
  for (const it of items) {
    if (!cur.length || it.start < curEnd) {
      cur.push(it);
      curEnd = Math.max(curEnd, it.end);
    } else {
      clusters.push(cur);
      cur = [it];
      curEnd = it.end;
    }
  }
  if (cur.length) clusters.push(cur);

  const out = [];
  for (const cluster of clusters) {
    const colEnds = [];
    for (const it of cluster) {
      let col = colEnds.findIndex((end) => end <= it.start);
      if (col < 0) {
        col = colEnds.length;
        colEnds.push(it.end);
      } else {
        colEnds[col] = it.end;
      }
      it.col = col;
    }
    const colCount = colEnds.length;
    for (const it of cluster) out.push({ ...it, colCount });
  }
  return out;
}

export function visibleHourRange(events, { minStart = 7, minEnd = 21 } = {}) {
  let start = minStart;
  let end = minEnd;
  for (const ev of events || []) {
    const span = eventStartEndMinutes(ev);
    if (!span) continue;
    start = Math.min(start, Math.floor(span.start / 60));
    end = Math.max(end, Math.ceil(span.end / 60));
  }
  start = Math.max(0, Math.min(23, start));
  end = Math.min(24, Math.max(start + 1, end));
  return { startHour: start, endHour: end };
}

export const HIDDEN_CALENDAR_LAYERS_KEY = 'weekplan.hiddenCalendarLayers.v1';

export function hiddenCalendarStorageKey(uid) {
  return `${HIDDEN_CALENDAR_LAYERS_KEY}.${uid || 'anon'}`;
}

export function calendarIdOf(ev, familyId) {
  if (ev?.connectionId) {
    const cal = ev.graphCalendarId || 'primary';
    return `ext:${ev.connectionId}:${cal}`;
  }
  if (ev?.private || ev?.readOnly) {
    return `ext:${ev.sourceLabel || ev.source || 'ekstern'}`;
  }
  if (ev?.crossPlatform) {
    return `plat:${ev.familyId || ev.sourceLabel || 'other'}`;
  }
  return `fam:${ev?.familyId || familyId || 'family'}`;
}

/** Personlag under familiekalenderen (`mem:uid`). */
export function memberLayerId(memberId) {
  if (!memberId) return null;
  return `mem:${String(memberId)}`;
}

/** Parent connection id for an external calendar layer (`ext:connId`). */
export function calendarConnectionLayerId(connectionId) {
  if (!connectionId) return null;
  return `ext:${connectionId}`;
}

/** Child layer for a specific Graph/Google sub-calendar. */
export function calendarSubLayerId(connectionId, graphCalendarId) {
  if (!connectionId) return null;
  return `ext:${connectionId}:${graphCalendarId || 'primary'}`;
}

/**
 * True when the event's layer (or its parent connection) is hidden.
 * Parent `ext:connId` hides all `ext:connId:*` children.
 * For family events with memberIds: hide when every assigned member layer is off.
 */
export function isCalendarLayerHidden(ev, hiddenCals, familyId) {
  if (!hiddenCals || !hiddenCals.size) return false;
  const layerId = calendarIdOf(ev, familyId);
  if (hiddenCals.has(layerId)) return true;
  if (ev?.connectionId) {
    const parent = calendarConnectionLayerId(ev.connectionId);
    if (parent && hiddenCals.has(parent)) return true;
  }
  // Legacy flat id without sub-calendar
  if (ev?.connectionId && hiddenCals.has(`ext:${ev.connectionId}`)) return true;

  // Personfilter: kun familie-/plattform-hendelser med eksplisitte deltakere
  if (layerId.startsWith('fam:') || layerId.startsWith('plat:')) {
    const ids = Array.isArray(ev?.memberIds) ? ev.memberIds.filter(Boolean) : [];
    if (ids.length > 0) {
      const allMembersHidden = ids.every((id) => hiddenCals.has(memberLayerId(id)));
      if (allMembersHidden) return true;
    }
  }
  return false;
}

export function icsHostFromUrl(url) {
  try {
    return new URL(String(url || '')).hostname.replace(/^www\./i, '') || '';
  } catch {
    return '';
  }
}

export function icsDisplayLabel(conn) {
  const host = String(conn?.icsHost || '').trim();
  const label = String(conn?.label || '').trim();
  const generic = !label || /^ics(-kalender)?$/i.test(label);
  if (host && generic) return `ICS · ${host}`;
  if (label && !generic) return label;
  if (host) return `ICS · ${host}`;
  return 'ICS';
}

/** Disambiguate two ICS feeds that would otherwise share the same name. */
export function icsSidebarLabel(conn, siblings = []) {
  const base = icsDisplayLabel(conn);
  const clashes = (siblings || []).some(
    (other) => other?.id && other.id !== conn?.id && icsDisplayLabel(other) === base,
  );
  if (!clashes) return base;
  if (typeof conn?.lastSyncCount === 'number') return `${base} · ${conn.lastSyncCount}`;
  return base;
}

/** Display label for an Outlook/Google connection (prefer email). */
export function connectionDisplayLabel(conn, fallback = 'Outlook') {
  if (!conn) return fallback;
  const email = String(conn.email || '').trim();
  if (email) return email;
  const label = String(conn.label || '').trim();
  if (label) {
    const stripped = label.replace(/^(Outlook|Google)\s*[·•\-–:]\s*/i, '').trim();
    if (stripped && stripped.toLowerCase() !== 'outlook' && stripped.toLowerCase() !== 'google') {
      return stripped;
    }
    if (stripped) return stripped;
    return label;
  }
  return fallback;
}

const FALLBACK_RGB = { r: 37, g: 99, b: 235 };

function parseHexRgb(hex) {
  const raw = String(hex || '').replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(full, 16);
  if (!full || Number.isNaN(n) || full.length !== 6) return { ...FALLBACK_RGB };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function mixRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

export function hexToRgba(hex, alpha = 1) {
  const { r, g, b } = parseHexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Hvit tekst på mørke kalenderfarger, mørk blekk på lyse. */
export function contrastingTextColor(hex) {
  const { r, g, b } = parseHexRgb(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#0f172a' : '#ffffff';
}

const EVENT_INK = '#1a2744';
const WHITE = { r: 255, g: 255, b: 255 };

/**
 * Dus kalenderflate: lys bakgrunn i kildefargen, mørk tekst.
 * Brukes både på møtebokser og fargeruten i «Mine kalendere».
 */
export function calendarEventSurface(hex) {
  const parsed = parseHexRgb(hex);
  const bg = rgbToHex(mixRgb(parsed, WHITE, 0.78));
  const border = rgbToHex(mixRgb(parsed, WHITE, 0.48));
  const accent = rgbToHex(parsed);
  return { bg, ink: EVENT_INK, border, accent };
}

export function formatWeekRangeNo(weekDays, months) {
  if (!weekDays?.length) return '';
  const a = weekDays[0];
  const b = weekDays[weekDays.length - 1];
  const monthB = String(months[b.getMonth()] || '').toLowerCase();
  const year = b.getFullYear();
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} - ${b.getDate()}. ${monthB} ${year}`;
  }
  const monthA = String(months[a.getMonth()] || '').toLowerCase();
  if (a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}. ${monthA} - ${b.getDate()}. ${monthB} ${year}`;
  }
  return `${a.getDate()}. ${monthA} ${a.getFullYear()} - ${b.getDate()}. ${monthB} ${year}`;
}
