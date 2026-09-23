/**
 * Home board catalog (adult + child).
 * 5-column snap grid on mobile. Looks are starting templates; users can add,
 * remove and drag widgets onto a dust grid while editing.
 */

import {
  addWidgetToGrid,
  applyPlacement,
  layoutWidgets,
  nextSpan,
  spanFromLegacySize,
} from './homeGrid.js';
import { isProtopHomeWidget } from './navigation/protopShell.js';

export const WIDGET_SIZES = ['third', 'half', 'full', 'tall'];

export const PARENT_WIDGET_CATALOG = [
  { type: 'weather', label: 'Vær', icon: 'partly-sunny-outline', sizes: ['half', 'full', 'tall'], defaultSize: 'half', hint: 'Temperatur, sted og neste timer' },
  { type: 'clock', label: 'Klokke', icon: 'time-outline', sizes: ['half', 'full'], defaultSize: 'half', hint: 'Analog klokke og klokkeslett' },
  { type: 'date', label: 'Dato', icon: 'calendar-outline', sizes: ['half', 'full'], defaultSize: 'half', hint: 'Ukedag og dato' },
  { type: 'weekPlan', label: 'Ukeplan', icon: 'calendar-outline', sizes: ['third', 'full', 'tall'], defaultSize: 'full', hint: 'Uken i fem dager' },
  { type: 'nextEvent', label: 'Neste avtale', icon: 'calendar-outline', sizes: ['half', 'full', 'tall'], defaultSize: 'full', hint: 'Det som skjer først' },
  { type: 'timeline', label: 'Avtaler', icon: 'calendar-outline', sizes: ['full', 'tall'], defaultSize: 'full', hint: 'Kalender for i dag — fra kveld: i morgen' },
  { type: 'tasks', label: 'Oppgaver', icon: 'checkbox-outline', sizes: ['third', 'half', 'full', 'tall'], defaultSize: 'full', hint: 'Åpne oppgaver' },
  { type: 'shopping', label: 'Handleliste', icon: 'cart-outline', sizes: ['third', 'half', 'full'], defaultSize: 'full', hint: 'Varer som mangler' },
  { type: 'meals', label: 'Måltider', icon: 'restaurant-outline', sizes: ['third', 'half', 'full'], defaultSize: 'full', hint: 'Dagens måltid' },
  { type: 'notes', label: 'Notat', icon: 'document-text-outline', sizes: ['third', 'full'], defaultSize: 'full', hint: 'Siste huskelapp' },
  { type: 'messages', label: 'Chat', icon: 'chatbubbles-outline', sizes: ['full'], defaultSize: 'full', hint: 'Siste i familiechatten' },
  { type: 'family', label: 'Familien', icon: 'people-outline', sizes: ['full'], defaultSize: 'full', hint: 'Hvem som er hjemme' },
  { type: 'location', label: 'Posisjon', icon: 'location-outline', sizes: ['full', 'tall'], defaultSize: 'full', hint: 'Hvor barna er' },
  { type: 'activities', label: 'Aktiviteter', icon: 'fitness-outline', sizes: ['full', 'tall'], defaultSize: 'full', hint: 'Trening og fritid' },
  { type: 'rememberDates', label: 'Husk dato', icon: 'gift-outline', sizes: ['full'], defaultSize: 'full', hint: 'Bursdager og merkedager' },
  { type: 'familyTree', label: 'Familietreet', icon: 'git-network-outline', sizes: ['full'], defaultSize: 'full', hint: 'Nære relasjoner' },
  { type: 'trips', label: 'Reiser', icon: 'briefcase-outline', sizes: ['full'], defaultSize: 'full', hint: 'Neste tur og pakkeliste' },
  { type: 'wishes', label: 'Ønsker', icon: 'gift-outline', sizes: ['third', 'full'], defaultSize: 'full', hint: 'Ønskelister' },
  { type: 'books', label: 'Bokhylla', icon: 'library-outline', sizes: ['third', 'full'], defaultSize: 'full', hint: 'Lesestund' },
  { type: 'kids', label: 'Barnas dag', icon: 'happy-outline', sizes: ['full', 'tall'], defaultSize: 'full', hint: 'Hva barna har i dag' },
  { type: 'shortcuts', label: 'Snarveier', icon: 'apps-outline', sizes: ['third', 'full', 'tall'], defaultSize: 'full', hint: 'Moduler som fliser' },
  { type: 'appFolder', label: 'Apper', icon: 'grid-outline', sizes: ['third'], defaultSize: 'third', hint: 'Tre apper + mer' },
  { type: 'reminders', label: 'Husk', icon: 'notifications-outline', sizes: ['full'], defaultSize: 'full', hint: 'Det som gjenstår' },
  { type: 'assistant', label: 'ProTop AI', icon: 'sparkles-outline', sizes: ['third', 'full', 'tall'], defaultSize: 'full', hint: 'Spør AI om plan, lister og rutiner' },
  { type: 'rewards', label: 'Belønninger', icon: 'star-outline', sizes: ['third', 'half'], defaultSize: 'third', hint: 'Opptjent denne uken' },
  { type: 'goals', label: 'Ukens mål', icon: 'flag-outline', sizes: ['third', 'half'], defaultSize: 'third', hint: 'Mål barna jobber mot' },
  { type: 'progress', label: 'Barnas progresjon', icon: 'stats-chart-outline', sizes: ['half', 'full', 'tall'], defaultSize: 'full', hint: 'Hvordan barna ligger an i dag' },
];

export const CHILD_WIDGET_CATALOG = [
  { type: 'weather', label: 'Vær', icon: 'partly-sunny-outline', sizes: ['half', 'full', 'tall'], defaultSize: 'half', hint: 'Hvordan er været' },
  { type: 'clock', label: 'Klokke', icon: 'time-outline', sizes: ['half', 'full'], defaultSize: 'half', hint: 'Hva er klokken' },
  { type: 'date', label: 'Dato', icon: 'calendar-outline', sizes: ['half', 'full'], defaultSize: 'half', hint: 'Hvilken dag det er' },
  { type: 'nextEvent', label: 'Neste', icon: 'calendar-outline', sizes: ['half', 'full', 'tall'], defaultSize: 'full', hint: 'Hva skjer nå' },
  { type: 'timeline', label: 'I dag', icon: 'list-outline', sizes: ['full', 'tall'], defaultSize: 'full', hint: 'Dagens plan — tom dag viser i morgen' },
  { type: 'tasks', label: 'Gjøremål', icon: 'checkbox-outline', sizes: ['third', 'half', 'full', 'tall'], defaultSize: 'full', hint: 'Kvitter ut dagens gjøremål' },
  { type: 'homework', label: 'Leksehjelpen', icon: 'bulb-outline', sizes: ['third', 'half', 'full', 'tall'], defaultSize: 'full', hint: 'Lekser i dag' },
  { type: 'school', label: 'Ukeplan', icon: 'school-outline', sizes: ['third', 'full', 'tall'], defaultSize: 'full', hint: 'Ukeplan og dagens program — etter skolen: i morgen' },
  { type: 'rewards', label: 'Belønninger', icon: 'star-outline', sizes: ['third', 'half', 'full'], defaultSize: 'half', hint: 'Poeng eller ukepenger' },
  { type: 'goals', label: 'Ukens mål', icon: 'flag-outline', sizes: ['third', 'half', 'full'], defaultSize: 'half', hint: 'Mål du jobber mot' },
  { type: 'meals', label: 'Middag', icon: 'restaurant-outline', sizes: ['third', 'half', 'full'], defaultSize: 'full', hint: 'Hva blir det til middag' },
  { type: 'activities', label: 'Aktiviteter', icon: 'fitness-outline', sizes: ['full', 'tall'], defaultSize: 'full', hint: 'Trening og fritid' },
  { type: 'rememberDates', label: 'Husk dato', icon: 'gift-outline', sizes: ['full'], defaultSize: 'full', hint: 'Bursdager og merkedager' },
  { type: 'notes', label: 'Notat', icon: 'document-text-outline', sizes: ['third', 'full'], defaultSize: 'full', hint: 'Huskelapper' },
  { type: 'messages', label: 'Chat', icon: 'chatbubbles-outline', sizes: ['full'], defaultSize: 'full', hint: 'Familiechatten' },
  { type: 'books', label: 'Bokhylla', icon: 'library-outline', sizes: ['third', 'full'], defaultSize: 'full', hint: 'Lesestund' },
  { type: 'wishes', label: 'Ønsker', icon: 'gift-outline', sizes: ['third', 'full'], defaultSize: 'full', hint: 'Mine ønsker' },
  { type: 'shortcuts', label: 'Apper', icon: 'apps-outline', sizes: ['third', 'full', 'tall'], defaultSize: 'full', hint: 'Dine apper' },
  { type: 'appFolder', label: 'Apper', icon: 'grid-outline', sizes: ['third'], defaultSize: 'third', hint: 'Tre apper + mer' },
  { type: 'reminders', label: 'Husk', icon: 'star-outline', sizes: ['full'], defaultSize: 'full', hint: 'Det som gjenstår' },
];

export const HOME_LOOKS = [
  {
    id: 'oversikt',
    label: 'Oversikt',
    hint: 'Dagens plan, oppgaver, notat, varsler og snarveier.',
    childHint: 'Dagens plan, oppgaver, notat og snarveier.',
  },
  {
    id: 'fokus',
    label: 'Fokus',
    hint: 'Dagens plan, oppgaver, notat, varsler og snarveier.',
    childHint: 'Dagens plan, oppgaver, notat og snarveier.',
  },
];

export const DEFAULT_HOME_LOOK = 'oversikt';

export function resolveHomeLook(id) {
  return HOME_LOOKS.some((look) => look.id === id) ? id : DEFAULT_HOME_LOOK;
}

export function homeLookMeta(id) {
  const look = resolveHomeLook(id);
  return HOME_LOOKS.find((item) => item.id === look);
}

/** Same 5-column home grid. Tiles are kalender, oppgaver, notat and varsler. */
const STANDARD_PARENT_WIDGETS = [
  { id: 'w-family-today', type: 'timeline', col: 0, row: 0, gw: 5, gh: 2 },
  { id: 'w-tasks', type: 'tasks', col: 0, row: 2, gw: 3, gh: 3 },
  { id: 'w-notes', type: 'notes', col: 3, row: 2, gw: 2, gh: 3 },
  { id: 'w-reminders', type: 'reminders', col: 0, row: 5, gw: 5, gh: 2 },
  { id: 'w-shortcuts', type: 'shortcuts', col: 0, row: 7, gw: 5, gh: 2, variant: 'row' },
];

const LOOK_PARENT_WIDGETS = {
  oversikt: STANDARD_PARENT_WIDGETS,
  fokus: STANDARD_PARENT_WIDGETS,
};

/** Child home uses the same grid: dagens plan, oppgaver, notat, snarveier. */
const STANDARD_CHILD_WIDGETS = [
  { id: 'w-today', type: 'timeline', col: 0, row: 0, gw: 5, gh: 2 },
  { id: 'w-tasks', type: 'tasks', col: 0, row: 2, gw: 5, gh: 2 },
  { id: 'w-notes', type: 'notes', col: 0, row: 4, gw: 5, gh: 2 },
  { id: 'w-shortcuts', type: 'shortcuts', col: 0, row: 6, gw: 5, gh: 2, variant: 'row' },
];

const LOOK_CHILD_WIDGETS = {
  oversikt: STANDARD_CHILD_WIDGETS,
  fokus: STANDARD_CHILD_WIDGETS,
};

export function widgetsForLook(lookId, role = 'parent') {
  const look = resolveHomeLook(lookId);
  const table = role === 'child' ? LOOK_CHILD_WIDGETS : LOOK_PARENT_WIDGETS;
  const list = table[look] || table[DEFAULT_HOME_LOOK];
  return layoutWidgets(list.map((widget) => ({ ...widget })));
}

export const DEFAULT_PARENT_WIDGETS = widgetsForLook('oversikt', 'parent');
export const DEFAULT_CHILD_WIDGETS = widgetsForLook('oversikt', 'child');

/**
 * Visual looks for a widget. Preview and home must use the same spec
 * so size and expression never jump after a choice.
 */
const WEATHER_VARIANT_LEGACY = {
  small: 'now',
  half: 'now',
  third: 'now',
  medium: 'hours',
  full: 'hours',
  large: 'day',
  tall: 'day',
};

export const WIDGET_VARIANTS = {
  weather: [
    { id: 'now', label: 'Nå', size: 'half', gw: 2, gh: 2 },
    { id: 'day', label: 'Dagsvarsel', size: 'full', gw: 5, gh: 2 },
    { id: 'hours', label: 'Time for time', size: 'full', gw: 5, gh: 2 },
  ],
  clock: [
    { id: 'small', label: 'Liten', size: 'half', height: 118 },
    { id: 'wide', label: 'Bred', size: 'full', height: 118 },
  ],
  date: [
    { id: 'small', label: 'Liten', size: 'half', height: 118 },
    { id: 'wide', label: 'Bred', size: 'full', height: 118 },
  ],
};

export const VARIANT_PICKER_TYPES = ['weather'];

export function variantsFor(type) {
  return WIDGET_VARIANTS[type] || [];
}

export function widgetVariant(type, variantId) {
  const list = variantsFor(type);
  if (!list.length) {
    return { id: variantId || 'default', label: 'Standard', size: null };
  }
  if (type === 'weather') {
    const mapped = WEATHER_VARIANT_LEGACY[variantId] || variantId;
    return list.find((v) => v.id === mapped) || list[0];
  }
  const fromId = list.find((v) => v.id === variantId);
  if (fromId) return fromId;
  if (variantId === 'half') return list.find((v) => v.size === 'half') || list[0];
  if (variantId === 'tall') return list.find((v) => v.height >= 160) || list[list.length - 1];
  if (variantId === 'full') return list.find((v) => v.size === 'full') || list[0];
  return list[0];
}

export function withWidgetVariant(widget, variantId) {
  const spec = widgetVariant(widget.type, variantId || widget.variant);
  return { ...widget, variant: spec.id, size: spec.size || widget.size || 'full' };
}

export function applyCanonicalLook(lookId, role = 'parent') {
  return widgetsForLook(lookId, role);
}

export function applyCanonicalVariants(savedList, role = 'parent', lookId) {
  return widgetsForLook(lookId, role);
}

export function setHomeLook(_list, lookId, role = 'parent') {
  return widgetsForLook(lookId, role);
}

export function isWidgetOn(list, type) {
  return (list || []).some((w) => w.type === type);
}

export function toggleWidgetType(list, type, role = 'parent') {
  const widgets = Array.isArray(list) ? list : [];
  if (widgets.some((w) => w.type === type)) {
    return layoutWidgets(widgets.filter((w) => w.type !== type));
  }
  return addWidget(widgets, type, role);
}

export function setWidgetVariantInList(list, type, variantId, role = 'parent') {
  if (variantId === 'off') {
    return layoutWidgets((list || []).filter((w) => w.type !== type));
  }
  let next = Array.isArray(list) ? [...list] : [];
  if (!next.some((w) => w.type === type)) next = addWidget(next, type, role);
  const spec = widgetVariant(type, variantId);
  return layoutWidgets(next.map((w) => {
    if (w.type !== type) return w;
    return {
      ...w,
      variant: spec.id,
      gw: spec.gw || w.gw,
      gh: spec.gh || w.gh,
    };
  }));
}

export function resolvedWidgetSize(widget) {
  const size = widget?.size;
  if (size === 'third' || size === 'half' || size === 'full' || size === 'tall') return size;
  return widgetVariant(widget?.type, widget?.variant).size || 'full';
}

/** Unique per-module glyph — never the ProTop mark. */
export const MODULE_CHROME = {
  weekPlan: { icon: 'calendar', glyphColor: '#2F80ED' },
  nextEvent: { icon: 'today', glyphColor: '#5B63A6' },
  timeline: { icon: 'list', glyphColor: '#34C759' },
  tasks: { icon: 'checkbox', glyphColor: '#34C759' },
  shopping: { icon: 'cart', glyphColor: '#C47A4A' },
  meals: { icon: 'restaurant', glyphColor: '#E07A7A' },
  notes: { icon: 'document-text', glyphColor: '#8EB4F0' },
  messages: { icon: 'chatbubbles', glyphColor: '#2F80ED' },
  family: { icon: 'people', glyphColor: '#6B8F71' },
  location: { icon: 'location', glyphColor: '#E85D4C' },
  activities: { icon: 'fitness', glyphColor: '#1F8A4C' },
  rememberDates: { icon: 'heart', glyphColor: '#E85D4C' },
  familyTree: { icon: 'git-network', glyphColor: '#6B8F71' },
  trips: { icon: 'briefcase', glyphColor: '#2F80ED' },
  wishes: { icon: 'gift', glyphColor: '#E07A9A' },
  books: { icon: 'library', glyphColor: '#2F80ED' },
  kids: { icon: 'happy', glyphColor: '#E0A106' },
  shortcuts: { icon: 'apps', glyphColor: '#5B63A6' },
  appFolder: { icon: 'grid', glyphColor: '#5B63A6' },
  reminders: { icon: 'notifications', glyphColor: '#C47A4A' },
  assistant: { icon: 'sparkles', glyphColor: '#7C3AED' },
  homework: { icon: 'bulb', glyphColor: '#E0A106' },
  school: { icon: 'school', glyphColor: '#2F80ED' },
  rewards: { icon: 'star', glyphColor: '#E0A106' },
  goals: { icon: 'flag', glyphColor: '#1F8A4C' },
  progress: { icon: 'stats-chart', glyphColor: '#2F80ED' },
};

export function moduleChrome(type) {
  return MODULE_CHROME[type] || { icon: 'apps', glyphColor: '#5B63A6' };
}

export function catalogForRole(role) {
  const list = role === 'child' ? CHILD_WIDGET_CATALOG : PARENT_WIDGET_CATALOG;
  return list.filter((item) => isProtopHomeWidget(item.type));
}

export const CATALOG_GROUPS = [
  { id: 'info', label: 'Klokke og vær', types: ['weather', 'clock', 'date'] },
  {
    id: 'plan',
    label: 'Plan og kalender',
    types: ['weekPlan', 'nextEvent', 'timeline', 'activities', 'rememberDates', 'school', 'homework'],
  },
  { id: 'hjem', label: 'Hjem', types: ['tasks', 'shopping', 'meals', 'notes', 'reminders', 'rewards', 'goals'] },
  { id: 'familie', label: 'Familie', types: ['kids', 'progress', 'family', 'location', 'familyTree', 'messages'] },
  { id: 'mer', label: 'Mer', types: ['appFolder', 'shortcuts', 'assistant', 'trips', 'wishes', 'books'] },
];

/** Catalog grouped for the picker — every module type stays a visible choice. */
export function groupedCatalog(role = 'parent') {
  const byType = new Map(catalogForRole(role).map((item) => [item.type, item]));
  return CATALOG_GROUPS
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: group.types.map((type) => byType.get(type)).filter(Boolean),
    }))
    .filter((group) => group.items.length);
}

export function widgetMeta(type, role = 'parent') {
  return catalogForRole(role).find((w) => w.type === type) || null;
}

export function newWidgetId() {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeWidgets(list, role = 'parent') {
  const catalog = catalogForRole(role);
  const allowed = new Set(catalog.map((w) => w.type));
  const out = [];
  const seen = new Set();
  (list || []).forEach((raw) => {
    if (!raw || !allowed.has(raw.type)) return;
    const id = String(raw.id || newWidgetId());
    if (seen.has(id)) return;
    seen.add(id);
    const spec = widgetVariant(raw.type, raw.variant || raw.size);
    out.push({
      id,
      type: raw.type,
      size: spec.size || resolvedWidgetSize(raw),
      variant: raw.variant || spec.id,
      col: raw.col,
      row: raw.row,
      gw: raw.gw,
      gh: raw.gh,
    });
  });
  return layoutWidgets(out);
}

const DECORATIVE_WIDGET_TYPES = new Set(['weather', 'clock', 'date']);
const TIMELINE_WIDGET_TYPES = new Set(['timeline', 'nextEvent', 'weekPlan', 'tasks']);

/** Spotlight id for the help tour — skip weather/clock/date so "innhold" is an app card. */
export function helpIdForWidget(widget, used) {
  if (!widget || !used) return null;
  if (widget.type === 'shortcuts' && !used.has('shortcuts')) {
    used.add('shortcuts');
    return 'shortcuts';
  }
  if (widget.type === 'appFolder' && !used.has('shortcuts')) {
    used.add('shortcuts');
    return 'shortcuts';
  }
  if (TIMELINE_WIDGET_TYPES.has(widget.type)) {
    if (!used.has('timeline')) {
      used.add('timeline');
      return 'timeline';
    }
    return null;
  }
  if (DECORATIVE_WIDGET_TYPES.has(widget.type)) return null;
  if (!used.has('content')) {
    used.add('content');
    return 'content';
  }
  return null;
}

/** Half stays half unless it shares a row. A lone half never stretches to full width. */
export function widgetCellStyle(widget, { shareRow } = {}) {
  if (shareRow) return { flex: 1, minWidth: 0 };
  const size = resolvedWidgetSize(widget);
  if (size === 'half') return { minWidth: 0, width: '48.5%' };
  if (size === 'third') return { minWidth: 0, width: '31.5%' };
  return { minWidth: 0, width: '100%' };
}

function samePackSize(a, b) {
  return a === b && (a === 'half' || a === 'third');
}

function packLimit(size) {
  if (size === 'third') return 3;
  if (size === 'half') return 2;
  return 1;
}

/** Pack consecutive halves (2) and thirds (3). A lone half/third never stretches to full width. */
export function packWidgetRows(widgets) {
  const rows = [];
  let i = 0;
  const list = widgets || [];
  while (i < list.length) {
    const cur = list[i];
    const curSize = resolvedWidgetSize(cur);
    const limit = packLimit(curSize);
    if (limit > 1) {
      const items = [cur];
      while (items.length < limit) {
        const nxt = list[i + items.length];
        if (!nxt || !samePackSize(curSize, resolvedWidgetSize(nxt))) break;
        items.push(nxt);
      }
      rows.push({ key: `row-${items.map((w) => w.id).join('-')}`, items });
      i += items.length;
    } else {
      rows.push({ key: `row-${cur.id}`, items: [cur] });
      i += 1;
    }
  }
  return rows;
}

export function cycleWidgetSize(widget) {
  const from = (widget.gw && widget.gh)
    ? { gw: widget.gw, gh: widget.gh }
    : spanFromLegacySize(widget.size);
  const span = nextSpan(from.gw, from.gh);
  return applyPlacement(widget, {
    col: Number.isFinite(widget.col) ? widget.col : 0,
    row: Number.isFinite(widget.row) ? widget.row : 0,
    gw: span.gw,
    gh: span.gh,
  });
}

export function moveWidget(list, id, delta) {
  const widgets = Array.isArray(list) ? [...list] : [];
  const idx = widgets.findIndex((w) => w.id === id);
  if (idx < 0) return widgets;
  const to = Math.max(0, Math.min(widgets.length - 1, idx + delta));
  if (to === idx) return widgets;
  const [item] = widgets.splice(idx, 1);
  widgets.splice(to, 0, item);
  return widgets;
}

export function moveWidgetToIndex(list, fromId, toId) {
  if (!fromId || fromId === toId) return list || [];
  const widgets = Array.isArray(list) ? [...list] : [];
  const from = widgets.findIndex((w) => w.id === fromId);
  const to = widgets.findIndex((w) => w.id === toId);
  if (from < 0 || to < 0) return widgets;
  const [item] = widgets.splice(from, 1);
  widgets.splice(to, 0, item);
  return widgets;
}

export function removeWidget(list, id) {
  return (list || []).filter((w) => w.id !== id);
}

export function addWidget(list, type, role = 'parent') {
  if ((list || []).some((w) => w.type === type)) return list || [];
  return addWidgetToGrid(list, type, role, { newWidgetId, widgetMeta });
}
