/**
 * 5-column home grid (mobile).
 * Spans: 5×1 slim, 2×2 square, 3×2 rect, 2×3 columnTall, 3×3 rectTall,
 * 5×2 wide, 5×3 tall.
 * List/timeline widgets stay ≤ MAX_CONTENT_WIDGET_GH and scroll inside.
 * Child chores ("Dagens gjøremål") may use CHILD_TASKS_GH (3).
 * Dense widgets (kids progress, shop, family, location) may use up to
 * MAX_DENSE_WIDGET_GH so narrow cards can grow taller and keep text readable.
 */

import { BREAKPOINTS } from './ui/layout.js';

export const GRID_COLS = 5;
export const GRID_GAP = 4;
export const GRID_CELL_H = 64;

/** Max grid rows for widgets that grow with list content. */
export const MAX_CONTENT_WIDGET_GH = 2;

/** Child "Dagens gjøremål" — one row taller than other list cards (5×3). */
export const CHILD_TASKS_GH = 3;

/** Max grid rows for dense multi-person / list cards that need taller cells. */
export const MAX_DENSE_WIDGET_GH = 3;

export const GRID_SPANS = {
  slim: { id: 'slim', gw: 5, gh: 1, label: 'Kompakt 5×1' },
  square: { id: 'square', gw: 2, gh: 2, label: 'Firkant 2×2' },
  rect: { id: 'rect', gw: 3, gh: 2, label: 'Rektangel 3×2' },
  columnTall: { id: 'columnTall', gw: 2, gh: 3, label: 'Smal høy 2×3' },
  rectTall: { id: 'rectTall', gw: 3, gh: 3, label: 'Rektangel høy 3×3' },
  wide: { id: 'wide', gw: 5, gh: 2, label: 'Bred 5×2' },
  tall: { id: 'tall', gw: 5, gh: 3, label: 'Høy 5×3' },
};

export const GRID_SPAN_ORDER = ['square', 'rect', 'columnTall', 'rectTall', 'slim', 'wide', 'tall'];

/** Content-fit widgets: cycle without full-board tall (overflow scrolls at gh≤2). */
export const CONTENT_SPAN_ORDER = ['square', 'rect', 'slim', 'wide'];

/** Dense widgets: include taller narrow spans so text and people fit. */
export const DENSE_SPAN_ORDER = ['square', 'rect', 'columnTall', 'rectTall', 'wide'];

/** Timeline only cycles full-width heights up to 5×2. */
export const TIMELINE_SPAN_ORDER = ['slim', 'wide'];

/** Child chores can sit one row above the usual 5×2 list card. */
export const CHILD_TASKS_SPAN_ORDER = ['tall', 'wide', 'slim', 'square', 'rect'];

/** Widget types that shrink to content height (capped by saved gh / max 2). */
export const CONTENT_FIT_TYPES = new Set([
  'timeline',
  'tasks',
  'homework',
  'school',
  'shopping',
  'weeklyPlan',
  'progress',
  'kids',
]);

/** Types allowed to occupy up to MAX_DENSE_WIDGET_GH (narrow + tall). */
export const DENSE_WIDGET_TYPES = new Set([
  'progress',
  'shopping',
  'family',
  'location',
  'reminders',
]);

export function maxGhForType(type, role) {
  if (type === 'tasks' && role === 'child') return CHILD_TASKS_GH;
  if (DENSE_WIDGET_TYPES.has(type)) return MAX_DENSE_WIDGET_GH;
  if (CONTENT_FIT_TYPES.has(type)) return MAX_CONTENT_WIDGET_GH;
  return 6;
}

export function spanFor(gw, gh) {
  const hit = Object.values(GRID_SPANS)
    .find((s) => s.gw === gw && s.gh === gh);
  return hit || GRID_SPANS.square;
}

export function nextSpan(gw, gh) {
  const cur = spanFor(gw, gh);
  const idx = GRID_SPAN_ORDER.indexOf(cur.id);
  const safeIdx = idx >= 0 ? idx : 0;
  return GRID_SPANS[GRID_SPAN_ORDER[(safeIdx + 1) % GRID_SPAN_ORDER.length]];
}

function nextSpanFromOrder(orderIds, gw, gh) {
  const order = orderIds.map((id) => GRID_SPANS[id]);
  const idx = order.findIndex((s) => s.gw === gw && s.gh === gh);
  return order[(idx + 1) % order.length];
}

export function nextSpanForType(type, gw, gh, role) {
  if (type === 'timeline') return nextSpanFromOrder(TIMELINE_SPAN_ORDER, gw, gh);
  if (type === 'tasks' && role === 'child') return nextSpanFromOrder(CHILD_TASKS_SPAN_ORDER, gw, gh);
  if (DENSE_WIDGET_TYPES.has(type)) return nextSpanFromOrder(DENSE_SPAN_ORDER, gw, gh);
  if (CONTENT_FIT_TYPES.has(type)) return nextSpanFromOrder(CONTENT_SPAN_ORDER, gw, gh);
  return nextSpan(gw, gh);
}

/** How many grid rows a timeline needs for N items (dense rows, max 2). */
export function preferredTimelineGh(itemCount, role) {
  const n = Math.max(0, Number(itemCount) || 0);
  // Child "I dag" stays two rows in normal view, matching the 5×2 edit footprint.
  if (role === 'child') return MAX_CONTENT_WIDGET_GH;
  // gh:1 (64px) clips the header plus even one row — measured cards are ~77px for 2 items.
  if (n <= 0) return 1;
  return MAX_CONTENT_WIDGET_GH;
}

export function timelineDisplayGh(savedGh, itemCount, role) {
  const cap = Math.max(1, Math.min(maxGhForType('timeline', role), Number(savedGh) || 2));
  return Math.min(cap, preferredTimelineGh(itemCount, role));
}

/**
 * Child "Dagens gjøremål" is 3 rows. Parent tasks stay at 2; extra items scroll.
 */
export function preferredTasksGh(itemCount, role) {
  if (role === 'child') return CHILD_TASKS_GH;
  const n = Math.max(0, Number(itemCount) || 0);
  if (n <= 0) return MAX_CONTENT_WIDGET_GH;
  return MAX_CONTENT_WIDGET_GH;
}

/**
 * Compact list cards (homework, shopping, calendar peek): progress/head + rows.
 * Cap at 2 rows; overflow scrolls inside the card.
 */
export function preferredListGh(itemCount) {
  const n = Math.max(0, Number(itemCount) || 0);
  if (n <= 0) return MAX_CONTENT_WIDGET_GH;
  return MAX_CONTENT_WIDGET_GH;
}

/**
 * Parent calendar peek: an empty week collapses to its header row
 * ("Kalender · Ingen avtaler") instead of a tall blank card.
 */
export function preferredCalendarPeekGh(itemCount) {
  const n = Math.max(0, Number(itemCount) || 0);
  if (n <= 0) return 1;
  return MAX_CONTENT_WIDGET_GH;
}

/**
 * Child ukeplan: week strip + lesson rows (or empty line).
 * Cap at 2 rows; extra lessons scroll.
 */
export function preferredSchoolGh(lessonCount) {
  const n = Math.max(0, Number(lessonCount) || 0);
  if (n <= 0) return MAX_CONTENT_WIDGET_GH;
  return MAX_CONTENT_WIDGET_GH;
}

/**
 * Parent kid row: avatar + name + next line. Two grid rows; never taller.
 * `withEvents` = kids that have something coming up. When none do, the
 * cards drop to one compact row (avatar + name) instead of repeating
 * "Ingen avtaler" in tall cards.
 */
export function preferredKidsGh(withEvents) {
  if (withEvents != null && Math.max(0, Number(withEvents) || 0) <= 0) return 1;
  return MAX_CONTENT_WIDGET_GH;
}

/**
 * Parent "Barnas progresjon": taller cell so every kid stays visible (scroll if more).
 */
export function preferredProgressGh(_kidCount) {
  return MAX_DENSE_WIDGET_GH;
}

/**
 * Shopping list: taller narrow card so item titles are readable.
 */
export function preferredShoppingGh(_itemCount) {
  return MAX_DENSE_WIDGET_GH;
}

export function preferredContentGh(type, itemCount, role) {
  if (type === 'timeline') return preferredTimelineGh(itemCount, role);
  if (type === 'tasks') return preferredTasksGh(itemCount, role);
  if (type === 'homework') return preferredListGh(itemCount);
  if (type === 'weeklyPlan') {
    return role === 'child' ? preferredListGh(itemCount) : preferredCalendarPeekGh(itemCount);
  }
  if (type === 'shopping') return preferredShoppingGh(itemCount);
  if (type === 'school') return preferredSchoolGh(itemCount);
  if (type === 'progress') return preferredProgressGh(itemCount);
  if (type === 'kids') return preferredKidsGh(itemCount);
  return null;
}

export function contentDisplayGh(type, savedGh, itemCount, role) {
  const preferred = preferredContentGh(type, itemCount, role);
  const typeMax = maxGhForType(type, role);
  if (preferred == null) {
    return Math.max(1, Math.min(typeMax, Number(savedGh) || 2));
  }
  const fallback = preferred;
  const cap = Math.max(1, Math.min(typeMax, Number(savedGh) || fallback));
  return Math.min(cap, preferred);
}

/** Clamp content widgets to their type max (lists ≤2, child chores ≤3, dense ≤3). */
export function clampContentWidgetHeight(widget, role) {
  if (!widget || !CONTENT_FIT_TYPES.has(widget.type)) return widget;
  const { gw, gh, col, row } = normalizePlacement(widget);
  const maxGh = maxGhForType(widget.type, role);
  if (gh <= maxGh) return widget;
  return applyPlacement(widget, { col, row, gw, gh: maxGh });
}

export function spanFromLegacySize(size) {
  if (size === 'tall') return GRID_SPANS.tall;
  if (size === 'full') return GRID_SPANS.wide;
  if (size === 'half' || size === 'third') return GRID_SPANS.square;
  return GRID_SPANS.square;
}

export function clampSpan(gw, gh) {
  const w = Math.max(1, Math.min(GRID_COLS, Number(gw) || 2));
  const h = Math.max(1, Math.min(6, Number(gh) || 2));
  return { gw: w, gh: h };
}

export function gridCellWidth(boardWidth) {
  const w = Number(boardWidth) || 0;
  if (w <= 0) return 0;
  return (w - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
}

/** Phone keeps the compact 64px row. Tablet and web use taller rows. */
export function cellHeightForBoard(boardWidth) {
  const w = Number(boardWidth) || 0;
  if (w >= BREAKPOINTS.desktop) return 120;
  if (w >= BREAKPOINTS.tablet) return 96;
  return GRID_CELL_H;
}

export function widgetBox(widget, boardWidth) {
  const cellW = gridCellWidth(boardWidth);
  const cellH = cellHeightForBoard(boardWidth);
  const { col, row, gw, gh } = normalizePlacement(widget);
  return {
    left: col * (cellW + GRID_GAP),
    top: row * (cellH + GRID_GAP),
    width: gw * cellW + (gw - 1) * GRID_GAP,
    height: gh * cellH + (gh - 1) * GRID_GAP,
  };
}

export function gridPixelHeight(rows, cellH = GRID_CELL_H) {
  const n = Math.max(0, Number(rows) || 0);
  if (!n) return 0;
  const h = cellH || GRID_CELL_H;
  return n * h + (n - 1) * GRID_GAP;
}

export function usedRows(widgets) {
  let max = 0;
  (widgets || []).forEach((w) => {
    const { row, gh } = normalizePlacement(w);
    max = Math.max(max, row + gh);
  });
  return max;
}

export function normalizePlacement(widget) {
  const span = widget?.gw && widget?.gh
    ? clampSpan(widget.gw, widget.gh)
    : spanFromLegacySize(widget?.size);
  const gw = span.gw;
  const gh = span.gh;
  const col = Math.max(0, Math.min(GRID_COLS - gw, Number.isFinite(widget?.col) ? widget.col : 0));
  const row = Math.max(0, Number.isFinite(widget?.row) ? widget.row : 0);
  return { col, row, gw, gh };
}

function cellsOf({ col, row, gw, gh }) {
  const out = [];
  for (let y = row; y < row + gh; y += 1) {
    for (let x = col; x < col + gw; x += 1) out.push(`${x}:${y}`);
  }
  return out;
}

export function occupancy(widgets, exceptId) {
  const used = new Set();
  (widgets || []).forEach((w) => {
    if (exceptId && w.id === exceptId) return;
    cellsOf(normalizePlacement(w)).forEach((c) => used.add(c));
  });
  return used;
}

export function canPlace(widgets, widget, col, row, exceptId) {
  const { gw, gh } = normalizePlacement({ ...widget, col, row });
  if (col < 0 || row < 0 || col + gw > GRID_COLS) return false;
  const used = occupancy(widgets, exceptId || widget.id);
  const next = cellsOf({ col, row, gw, gh });
  return next.every((c) => !used.has(c));
}

export function firstFit(widgets, widget, exceptId) {
  const { gw, gh } = normalizePlacement(widget);
  const occupied = occupancy(widgets, exceptId || widget.id);
  const maxRow = usedRows(widgets.filter((w) => w.id !== (exceptId || widget.id))) + 8;
  for (let row = 0; row <= maxRow; row += 1) {
    for (let col = 0; col <= GRID_COLS - gw; col += 1) {
      const next = cellsOf({ col, row, gw, gh });
      if (next.every((c) => !occupied.has(c))) return { col, row, gw, gh };
    }
  }
  return { col: 0, row: usedRows(widgets), gw, gh };
}

export function intendedPlacement(widget, wantCol, wantRow) {
  const { gw, gh } = normalizePlacement(widget);
  return {
    col: Math.max(0, Math.min(GRID_COLS - gw, Math.round(wantCol))),
    row: Math.max(0, Math.round(wantRow)),
    gw,
    gh,
  };
}

export function widgetIsNarrow(widget) {
  return normalizePlacement(widget).gw <= 2;
}

export function widgetIsCompact(widget) {
  return normalizePlacement(widget).gw <= 3;
}

export function widgetIsWide(widget) {
  return normalizePlacement(widget).gw >= 5;
}

/** Nearest free slot to a desired cell — this is what makes drop stick. */
export function nearestFit(widgets, widget, wantCol, wantRow, exceptId) {
  const { gw, gh } = normalizePlacement(widget);
  const col0 = Math.max(0, Math.min(GRID_COLS - gw, Math.round(wantCol)));
  const row0 = Math.max(0, Math.round(wantRow));
  if (canPlace(widgets, { ...widget, gw, gh }, col0, row0, exceptId)) {
    return { col: col0, row: row0, gw, gh };
  }
  const maxRow = Math.max(row0 + 12, usedRows(widgets) + 6);
  let best = null;
  let bestScore = Infinity;
  for (let row = 0; row <= maxRow; row += 1) {
    for (let col = 0; col <= GRID_COLS - gw; col += 1) {
      if (!canPlace(widgets, { ...widget, gw, gh }, col, row, exceptId)) continue;
      const score = Math.abs(row - row0) * 10 + Math.abs(col - col0);
      if (score < bestScore) {
        bestScore = score;
        best = { col, row, gw, gh };
      }
    }
  }
  return best || firstFit(widgets, { ...widget, gw, gh }, exceptId);
}

export function pointerToCell(x, y, boardWidth) {
  const cellW = gridCellWidth(boardWidth);
  const strideW = cellW + GRID_GAP;
  const strideH = cellHeightForBoard(boardWidth) + GRID_GAP;
  const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor((x + GRID_GAP / 2) / Math.max(strideW, 1))));
  const row = Math.max(0, Math.floor((y + GRID_GAP / 2) / strideH));
  return { col, row };
}

export function applyPlacement(widget, place) {
  return {
    ...widget,
    col: place.col,
    row: place.row,
    gw: place.gw,
    gh: place.gh,
    size: place.gw >= 5 ? (place.gh >= 3 ? 'tall' : 'full') : (place.gw >= 3 ? 'half' : 'third'),
  };
}

/** Pull widgets upward so shrinking one widget does not leave empty grid rows. */
export function compactGrid(widgets) {
  const list = Array.isArray(widgets) ? widgets : [];
  const sorted = [...list].sort((a, b) => {
    const pa = normalizePlacement(a);
    const pb = normalizePlacement(b);
    return pa.row - pb.row || pa.col - pb.col;
  });
  const placed = [];
  sorted.forEach((widget) => {
    const { gw, gh, col } = normalizePlacement(widget);
    let row = 0;
    while (row < 64 && !canPlace(placed, { ...widget, gw, gh }, col, row, widget.id)) {
      row += 1;
    }
    const place = canPlace(placed, { ...widget, gw, gh }, col, row, widget.id)
      ? { col, row, gw, gh }
      : firstFit(placed, { ...widget, gw, gh }, widget.id);
    placed.push(applyPlacement(widget, place));
  });
  const byId = new Map(placed.map((w) => [w.id, w]));
  return list.map((w) => byId.get(w.id) || w);
}

/**
 * Shrink content widgets to preferred height (capped by saved gh).
 * `counts` maps widget type → visible item count (timeline, tasks, …).
 * When compact=true, also pull widgets below upward so empty rows disappear.
 * Default compact=false: keep user-assigned rows (including intentional gaps).
 */
export function fitHomeWidgets(widgets, counts = {}, { compact = false, role = 'parent' } = {}) {
  const list = (Array.isArray(widgets) ? widgets : []).map((w) => clampContentWidgetHeight(w, role));
  const byType = counts && typeof counts === 'object' ? counts : {};
  let changed = false;
  const next = list.map((w) => {
    const type = w?.type;
    if (!CONTENT_FIT_TYPES.has(type)) return w;
    if (!Object.prototype.hasOwnProperty.call(byType, type)) return w;
    const { gw, gh, col, row } = normalizePlacement(w);
    const fitted = contentDisplayGh(type, gh, byType[type], role);
    if (fitted === gh) return w;
    changed = true;
    const nextGw = type === 'timeline' ? Math.max(gw, 5) : gw;
    return applyPlacement(w, { col, row, gw: nextGw, gh: fitted });
  });
  if (!changed) return list;
  return compact ? compactGrid(next) : collapseFreedRows(list, next);
}

function occupiedRows(widgets) {
  const rows = new Set();
  (widgets || []).forEach((w) => {
    const { row, gh } = normalizePlacement(w);
    for (let y = row; y < row + gh; y += 1) rows.add(y);
  });
  return rows;
}

/**
 * Drop rows that only went empty because a widget shrank, shifting
 * everything below up. Rows the user left empty on purpose stay.
 */
export function collapseFreedRows(before, after) {
  const was = occupiedRows(before);
  const now = occupiedRows(after);
  const freed = [...was].filter((y) => !now.has(y)).sort((a, b) => a - b);
  if (!freed.length) return after;
  return after.map((w) => {
    const p = normalizePlacement(w);
    const shift = freed.filter((y) => y < p.row).length;
    return shift ? applyPlacement(w, { ...p, row: p.row - shift }) : w;
  });
}

/**
 * Widgets shown on the home grid.
 * Clamp content widgets to type max (lists ≤2, dense ≤3); overflow scrolls.
 * Edit mode keeps saved col/row. View mode may shrink empty parent widgets
 * (timeline, calendar, kids) and pulls up only the rows that shrinking freed.
 * Child "I dag" stays at its saved height (two rows on the standard board).
 */
export function displayHomeWidgets(widgets, counts = {}, { editing = false, fitContent = true, role = 'parent' } = {}) {
  const list = (Array.isArray(widgets) ? widgets : []).map((w) => clampContentWidgetHeight(w, role));
  if (editing || !fitContent) return list;
  // What the parent placed in edit mode is what view mode shows: the kid
  // cards are never hidden just because "Barnas progresjon" is also on home.
  return fitHomeWidgets(list, counts, { compact: false, role });
}

/**
 * Legacy helper (no longer used by displayHomeWidgets): folded the kid cards
 * into "Barnas progresjon". Kept exported for callers/tests that import it.
 */
export function foldKidsIntoProgress(widgets) {
  const list = Array.isArray(widgets) ? widgets : [];
  if (!list.some((w) => w?.type === 'progress') || !list.some((w) => w?.type === 'kids')) {
    return list;
  }
  const next = list
    .filter((w) => w?.type !== 'kids')
    .map((w) => (w.type === 'progress' ? { ...w, foldedKids: true } : w));
  return collapseFreedRows(list, next);
}

/**
 * Shrink timeline widgets to content height (capped by saved gh).
 * When compact=true, also pull widgets below upward so empty rows disappear.
 */
export function fitTimelineWidgets(widgets, itemCount, { compact = false } = {}) {
  return fitHomeWidgets(widgets, { timeline: itemCount }, { compact });
}

export function layoutWidgets(list, role = 'parent') {
  const out = [];
  (list || []).forEach((raw) => {
    if (!raw) return;
    const clamped = clampContentWidgetHeight(raw, role);
    const base = {
      ...clamped,
      ...clampSpan(clamped.gw || spanFromLegacySize(clamped.size).gw, clamped.gh || spanFromLegacySize(clamped.size).gh),
    };
    const typeMax = maxGhForType(base.type, role);
    if (CONTENT_FIT_TYPES.has(base.type) && base.gh > typeMax) {
      base.gh = typeMax;
    }
    const hasPos = Number.isFinite(clamped.col) && Number.isFinite(clamped.row);
    const place = hasPos && canPlace(out, base, clamped.col, clamped.row, clamped.id)
      ? { col: clamped.col, row: clamped.row, gw: base.gw, gh: base.gh }
      : (hasPos
        ? nearestFit(out, base, clamped.col, clamped.row, clamped.id)
        : firstFit(out, base, clamped.id));
    out.push(applyPlacement(base, place));
  });
  return out;
}

export function moveWidgetOnGrid(list, id, wantCol, wantRow) {
  const widgets = Array.isArray(list) ? list : [];
  const current = widgets.find((w) => w.id === id);
  if (!current) return widgets;
  const target = intendedPlacement(current, wantCol, wantRow);
  const placedDrag = applyPlacement(current, target);

  if (canPlace(widgets, current, target.col, target.row, id)) {
    return widgets.map((w) => (w.id === id ? placedDrag : w));
  }

  const targetCells = new Set(cellsOf(target));
  const overlapping = widgets.filter((w) => {
    if (w.id === id) return false;
    return cellsOf(normalizePlacement(w)).some((c) => targetCells.has(c));
  });

  let acc = widgets
    .filter((w) => w.id !== id && !overlapping.some((other) => other.id === w.id))
    .concat(placedDrag);

  const origin = normalizePlacement(current);
  const displaced = overlapping.map((other) => {
    const place = nearestFit(acc, other, origin.col, origin.row, other.id);
    const next = applyPlacement(other, place);
    acc = acc.concat(next);
    return next;
  });

  const byId = new Map([[id, placedDrag], ...displaced.map((w) => [w.id, w])]);
  return widgets.map((w) => byId.get(w.id) || w);
}

export function resizeWidgetOnGrid(list, id, spanId) {
  const widgets = Array.isArray(list) ? list : [];
  const current = widgets.find((w) => w.id === id);
  if (!current) return widgets;
  const span = GRID_SPANS[spanId] || nextSpan(current.gw, current.gh);
  const next = { ...current, gw: span.gw, gh: span.gh };
  const col = Math.min(current.col || 0, GRID_COLS - span.gw);
  const place = canPlace(widgets, next, col, current.row || 0, id)
    ? { col, row: current.row || 0, gw: span.gw, gh: span.gh }
    : nearestFit(widgets, next, col, current.row || 0, id);
  return widgets.map((w) => (w.id === id ? applyPlacement(w, place) : w));
}

export function cycleWidgetSpan(list, id, role) {
  const current = (list || []).find((w) => w.id === id);
  if (!current) return list || [];
  const span = nextSpanForType(current.type, current.gw, current.gh, role);
  return resizeWidgetOnGrid(list, id, span.id);
}

export function addWidgetToGrid(list, type, role, { newWidgetId, widgetMeta }) {
  const meta = widgetMeta(type, role);
  if (!meta) return list || [];
  const span = defaultSpanForType(type, role);
  const draft = {
    id: newWidgetId(),
    type,
    gw: span.gw,
    gh: span.gh,
    variant: type === 'nextEvent' ? 'wide' : type === 'assistant' ? 'banner' : 'default',
  };
  const place = firstFit(list || [], draft);
  return [...(list || []), applyPlacement(draft, place)];
}

/** ProTop-widgetene som fyller hele bredden når de legges til. */
const PRO_WIDE_TYPES = new Set(['dayBrief', 'weekAgenda', 'quickActions', 'myHours', 'companyNews', 'mileage', 'vat', 'tenders']);

export function defaultSpanForType(type, role) {
  if (type === 'timeline') return GRID_SPANS.wide;
  if (PRO_WIDE_TYPES.has(type)) return GRID_SPANS.wide;
  if (type === 'projects') return GRID_SPANS.rectTall;
  if (type === 'focus' || type === 'approvals' || type === 'myReports') return GRID_SPANS.rect;
  if (type === 'countdown') return GRID_SPANS.square;
  if (type === 'away') return GRID_SPANS.rectTall;
  if (type === 'celebrations') return GRID_SPANS.columnTall;
  if (type === 'team') return GRID_SPANS.columnTall;
  if (type === 'mail') return GRID_SPANS.square;
  // Progress + shop share a row as two wider/taller sections (3×3 + 2×3).
  if (type === 'progress') return GRID_SPANS.rectTall;
  if (type === 'shopping') return GRID_SPANS.columnTall;
  if (type === 'family' || type === 'location' || type === 'reminders') {
    return GRID_SPANS.rectTall;
  }
  if (type === 'tasks') return role === 'child' ? GRID_SPANS.tall : GRID_SPANS.wide;
  if (type === 'appFolder') return GRID_SPANS.square;
  if (type === 'kids' || type === 'shortcuts' || type === 'assistant' || type === 'weeklyPlan') {
    return GRID_SPANS.wide;
  }
  if (type === 'nextEvent' || type === 'meals') return GRID_SPANS.rect;
  return GRID_SPANS.square;
}

export function withGridPlacements(list, role = 'parent') {
  return layoutWidgets((list || []).map((w) => {
    if (Number.isFinite(w?.col) && Number.isFinite(w?.row) && w.gw && w.gh) return w;
    return { ...w, ...spanFromLegacySize(w.size) };
  }), role);
}
