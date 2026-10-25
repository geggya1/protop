/**
 * Finner knappen et hjelpesteg peker på (web). Steg i protopPages har
 * `find: ['Ny kunde', …]` — vi ser etter aria-label, testID og synlig tekst,
 * og bruker nærmeste klikkbare forelder. Hjelpelaget selv hoppes over.
 * Uten DOM (native, node) gir funksjonene null, og rundturen bruker anchor.
 *
 * `via` er knappen som åpner stedet der steget skjer (f.eks. «Ny kunde»
 * før «Lagre kunde»). Finnes ikke målknappen ennå, markerer vi via-knappen.
 */

const OVERLAY_SELECTOR = '[data-wp-help-overlay], [data-help-card], [data-assistant-panel]';
const CLICKABLE_SELECTOR = 'button, a[href], [role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="switch"], input, textarea, [tabindex]:not([tabindex="-1"])';
const MAX_SCAN = 4000;

/** Normaliserer synlig tekst: ikon-glyfer, plusstegn og mellomrom bort. */
export function normalizeLabel(text) {
  return String(text || '')
    // Ikonfonter (Ionicons) bruker private-use-tegn.
    .replace(/[-]/g, '')
    .replace(/^[\s+•·›»→]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isVisible(el, win) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const r = el.getBoundingClientRect();
  if (!(r.width > 2 && r.height > 2)) return false;
  try {
    const cs = win.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
  } catch { /* ignore */ }
  return true;
}

function insideOverlay(el) {
  try { return !!el.closest(OVERLAY_SELECTOR); } catch { return false; }
}

const MENU_SELECTOR = '#help-target-rail';

function insideMenu(el) {
  try { return !!el.closest(MENU_SELECTOR); } catch { return false; }
}

function clickableAncestor(el) {
  try {
    const hit = el.closest(CLICKABLE_SELECTOR);
    if (hit) return hit;
  } catch { /* ignore */ }
  return el;
}

/**
 * Rangerer treff: eksakt aria-label/testID først, så eksakt tekst,
 * så tekst som starter med etiketten. Mindre element vinner ved likhet,
 * så vi markerer knappen og ikke hele kortet rundt den.
 */
export function scoreCandidate({ label, ariaLabel, testId, text }) {
  const want = normalizeLabel(label);
  if (!want) return 0;
  if (normalizeLabel(testId) === want) return 100;
  if (normalizeLabel(ariaLabel) === want) return 90;
  const own = normalizeLabel(text);
  if (own === want) return 80;
  if (normalizeLabel(ariaLabel).startsWith(want)) return 60;
  if (want.length >= 4 && own.startsWith(want) && own.length <= want.length + 24) return 50;
  return 0;
}

function viewportOf(doc) {
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  return { win, w: win?.innerWidth || 0, h: win?.innerHeight || 0 };
}

const NODE_SELECTOR = '[aria-label], [data-testid], [placeholder], button, [role="button"], [role="tab"], a, input, textarea, div, span';

/** Åpne dialoger (ikke hjelpelaget) — knapper der inne vinner over siden bak. */
function openDialogs(doc, win) {
  try {
    return [...doc.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
      .filter((el) => typeof el.querySelectorAll === 'function' && !insideOverlay(el) && isVisible(el, win));
  } catch {
    return [];
  }
}

function behindModal(el, doc) {
  const { win } = viewportOf(doc);
  let modals = [];
  try {
    modals = [...doc.querySelectorAll('[aria-modal="true"]')]
      .filter((m) => !insideOverlay(m) && isVisible(m, win));
  } catch {
    return false;
  }
  return modals.length > 0 && !modals.some((m) => typeof m.contains === 'function' && m.contains(el));
}

/** DOM-elementet for første etikett i `labels` som finnes på siden. */
export function findTargetElement(labels, doc = (typeof document !== 'undefined' ? document : null)) {
  return findTargetMatch(labels, doc)?.el || null;
}

/**
 * Som findTargetElement, men sier også hvilken etikett som traff.
 * `clickable`: bare noe brukeren kan trykke på (via-knapper) — ikke en
 * overskrift med samme tekst.
 */
export function findTargetMatch(labels, doc = (typeof document !== 'undefined' ? document : null), { clickable = false } = {}) {
  if (!doc || !Array.isArray(labels) || labels.length === 0) return null;
  const { win } = viewportOf(doc);
  if (!win) return null;
  const dialogs = openDialogs(doc, win);
  const scopes = dialogs.length ? [dialogs[dialogs.length - 1], doc] : [doc];
  for (const scope of scopes) {
    const hit = scanFor(labels, scope, win, clickable);
    if (hit) return hit;
  }
  return null;
}

function isClickable(el) {
  try { return !!el.closest(CLICKABLE_SELECTOR); } catch { return false; }
}

/**
 * `#id` peker på et element med nativeID (id) — `#prefix*` på det første
 * synlige med id som starter slik (f.eks. første rad i en liste).
 */
function byId(label, scope, win) {
  const raw = label.slice(1).trim();
  if (!raw) return null;
  const prefix = raw.endsWith('*');
  const id = prefix ? raw.slice(0, -1) : raw;
  const safe = id.replace(/["\\]/g, '');
  let list = [];
  try {
    list = [...scope.querySelectorAll(prefix ? `[id^="${safe}"]` : `[id="${safe}"]`)];
  } catch {
    return null;
  }
  // Minste synlige treff: en rad, ikke listen rundt (som kan ha samme prefiks).
  let best = null;
  let bestArea = Infinity;
  for (const el of list) {
    if (insideOverlay(el)) continue;
    const target = clickableAncestor(el);
    if (!isVisible(target, win)) continue;
    const r = target.getBoundingClientRect();
    const area = r.width * r.height;
    if (area < bestArea) {
      best = target;
      bestArea = area;
    }
  }
  return best;
}

function scanFor(labels, scope, win, clickable = false) {
  const nodes = scope.querySelectorAll(NODE_SELECTOR);
  const limit = Math.min(nodes.length, MAX_SCAN);
  for (const label of labels) {
    if (typeof label === 'string' && label.startsWith('#')) {
      const el = byId(label, scope, win);
      if (el && (!clickable || isClickable(el))) return { el, label };
      continue;
    }
    let best = null;
    let bestScore = 0;
    let bestArea = Infinity;
    for (let i = 0; i < limit; i += 1) {
      const el = nodes[i];
      // Bare elementer med egen, kort tekst — ellers matcher hele sidebeholderen.
      const text = el.childElementCount > 3 ? '' : (el.textContent || '');
      const score = scoreCandidate({
        label,
        ariaLabel: el.getAttribute?.('aria-label') || el.getAttribute?.('placeholder') || '',
        testId: el.getAttribute?.('data-testid') || '',
        text: text.length > 140 ? '' : text,
      });
      if (!score || score < bestScore) continue;
      if (insideOverlay(el)) continue;
      // Menyen har mange like ord («Godkjenninger», «Avtaler»): der teller bare eksakte etiketter.
      if (score < 90 && insideMenu(el)) continue;
      if (clickable && !isClickable(el)) continue;
      const target = clickableAncestor(el);
      if (!isVisible(target, win)) continue;
      const r = target.getBoundingClientRect();
      const area = r.width * r.height;
      if (score > bestScore || area < bestArea) {
        best = target;
        bestScore = score;
        bestArea = area;
      }
    }
    if (best) return { el: best, label };
  }
  return null;
}

/**
 * Rektangelet (vinduskoordinater) for steget. Ligger knappen utenfor
 * skjermen, rulles den inn først.
 */
export function findTargetRect(labels, { scroll = true, doc } = {}) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const el = findTargetElement(labels, d);
  return el ? rectOf(el, d, scroll) : null;
}

function rectOf(el, doc, scroll) {
  const { w, h } = viewportOf(doc);
  let r = el.getBoundingClientRect();
  const off = r.bottom < 0 || r.top > h || r.right < 0 || r.left > w;
  if (off && scroll && typeof el.scrollIntoView === 'function') {
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* ignore */ }
    r = el.getBoundingClientRect();
  }
  if (!(r.width > 2 && r.height > 2)) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * Hele oppslaget for et hjelpesteg: målknappen (`find`) hvis den finnes,
 * ellers knappen som åpner den (`via`). Gir { rect, el, label, via }.
 */
export function locateStepTarget({ find = [], via = [] } = {}, { scroll = true, doc } = {}) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  const direct = find.length ? findTargetMatch(find, d) : null;
  let hit = direct || (via.length ? findTargetMatch(via, d, { clickable: true }) : null);
  // En via-knapp bak et åpent modalvindu er dekket — da venter vi på målknappen.
  if (hit && !direct && behindModal(hit.el, d)) hit = null;
  if (!hit) return null;
  const rect = rectOf(hit.el, d, scroll);
  if (!rect) return null;
  return { rect, el: hit.el, label: hit.label, via: !direct };
}
