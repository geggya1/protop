/**
 * Stabile, distinkte farger for eksterne kalenderlag (Outlook/Google/ICS).
 * Samme connection + underkalender → samme farge hver gang.
 *
 * Unngå merkevare-blå (#2563eb / Outlook #0078d4) — den er forbeholdt knapper.
 */

export const FAMILY_CALENDAR_COLOR = '#5b6b82';

export const EXTERNAL_CALENDAR_COLORS = [
  '#0f766e', // teal
  '#c2410c', // terracotta
  '#6d28d9', // violet
  '#be185d', // pink
  '#a16207', // gold
  '#b91c1c', // red
  '#047857', // green
  '#4338ca', // indigo
  '#0e7490', // cyan
  '#a21caf', // fuchsia
  '#4d7c0f', // olive
  '#9a3412', // rust
  '#7e22ce', // purple
  '#115e59', // dark teal
  '#9d174d', // rose
  '#3f6212', // moss
];

function hashKey(str) {
  const s = String(str || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Standardkalenderen til en konto deler farge med konto-raden i menyen. */
export function canonicalCalendarColorId(graphCalendarId, isDefault = false) {
  if (isDefault) return 'default';
  const cal = String(graphCalendarId || 'primary').trim() || 'primary';
  if (cal === 'primary' || cal === 'account' || cal === 'default') return 'default';
  return cal;
}

export function isDefaultLayerCalendar(cal) {
  if (!cal) return false;
  return !!(cal.isDefault || canonicalCalendarColorId(cal.id) === 'default');
}

export function defaultCalendarIdsFromLayers(layers) {
  const ids = new Set();
  for (const pack of layers || []) {
    const conn = pack.connectionId;
    if (!conn) continue;
    for (const cal of pack.calendars || []) {
      if (cal?.id && isDefaultLayerCalendar(cal)) {
        ids.add(`${conn}:${cal.id}`);
      }
    }
  }
  return ids;
}

/** Farge for en ekstern kalender / underkalender. */
export function colorForExternalCalendar(connectionId, graphCalendarId = 'primary', source = '', opts = {}) {
  const cal = canonicalCalendarColorId(graphCalendarId, opts.isDefault);
  const key = `${source || ''}|${connectionId || 'ext'}|${cal}`;
  return EXTERNAL_CALENDAR_COLORS[hashKey(key) % EXTERNAL_CALENDAR_COLORS.length];
}

function eventIsDefaultCalendar(ev, defaultCalIds) {
  if (!ev) return true;
  if (ev.graphCalendarIsDefault) return true;
  const calId = ev.graphCalendarId || 'primary';
  if (canonicalCalendarColorId(calId) === 'default') return true;
  if (defaultCalIds && ev.connectionId && defaultCalIds.has(`${ev.connectionId}:${calId}`)) return true;
  return false;
}

/** Sett farge på et eksternt event (muterer ikke — returnerer ny kopi). */
export function withExternalEventColor(ev, defaultCalIds = null) {
  if (!ev) return ev;
  if (!(ev.private || ev.readOnly || ev.connectionId || ev.source === 'microsoft' || ev.source === 'google' || ev.source === 'ics')) {
    return ev;
  }
  const color = colorForExternalCalendar(
    ev.connectionId || ev.sourceLabel || ev.source,
    ev.graphCalendarId || 'primary',
    ev.source || '',
    { isDefault: eventIsDefaultCalendar(ev, defaultCalIds) },
  );
  if (ev.color === color) return ev;
  return { ...ev, color };
}

export function applyExternalEventColors(events, layers) {
  const defaultCalIds = defaultCalendarIdsFromLayers(layers);
  return (events || []).map((ev) => withExternalEventColor(ev, defaultCalIds));
}

/** Farge for parent-rad (hele Outlook-kontoen) = standardkalenderen. */
export function colorForConnection(connectionId, source = 'microsoft') {
  return colorForExternalCalendar(connectionId, 'default', source);
}

/**
 * Farge for familiehendelse: eksplisitt farge → første medlems farge → familiegrå.
 * Brukes i plan, hjem og kalender-dots (FamilyWall-lignende personfarger).
 */
export function colorForFamilyEvent(ev, members = []) {
  if (ev?.color) return ev.color;
  if (ev?.private || ev?.readOnly || ev?.connectionId) {
    return ev?.color || FAMILY_CALENDAR_COLOR;
  }
  const ids = Array.isArray(ev?.memberIds) ? ev.memberIds.filter(Boolean) : [];
  for (const id of ids) {
    const m = (members || []).find((x) => x.id === id || x.uid === id);
    if (m?.color) return m.color;
  }
  return FAMILY_CALENDAR_COLOR;
}
