/**
 * Pure layout helpers for the help overlay: spotlight holes, card placement,
 * curved arrows and step anchors. No React Native imports — safe for node tests.
 */

export function matchesWhen(when = {}, layout = {}) {
  if (!when || typeof when !== 'object') return true;
  return Object.entries(when).every(([key, val]) => layout[key] === val);
}

/**
 * Pick the first matching layout variant on a step object.
 * Variants override text (`nb`/`en`) and optional `anchor` / `scene`.
 */
export function resolveRawStep(raw, layout = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  const matched = variants.find((v) => v && matchesWhen(v.when, layout));
  if (!matched) {
    const { variants: _v, when: _w, ...rest } = raw;
    return rest;
  }
  const { when: _when, variants: _nested, ...override } = matched;
  const { variants: _drop, when: _dropWhen, ...base } = raw;
  return { ...base, ...override };
}

export function inferStepAnchor(text, layout = {}) {
  const s = String(text || '').toLowerCase();
  const { isDesktop = false, isPhone = false, hasRail = false } = layout;
  if (
    /skriv varen|type the item|trykk enter|hit enter|navn på vare|skriv og send|type and send|skriv, eller ta opp|type, or record|legg inn ønske|add a wish|trykk send|tap send|skriv i feltet|type in the field/
      .test(s)
  ) return 'input';
  // In-module sub-tabs (e.g. Matcoach «Familie», album detail tools)
  if (
    /familie-fanen|prefs|preferanser under familie|under familie|set preferences|åpne familie-fanen|trykk familie/
      .test(s)
  ) {
    return 'prefs';
  }
  if (/moduleTabs|modul-fanen|under-fanen|sub-tab/.test(s)) return 'moduleTabs';
  if (/åpne en (liste|mappe|bok)|åpne et (notat|gjøremål|album)|open a (list|folder|note|book|chore|album)/.test(s)) {
    return 'content';
  }
  if (/blyant|rediger hjem|legg til widget|toppbildet|pencil|edit home|add a widget/.test(s)) {
    return 'edit';
  }
  if (/last opp fil|upload a file|legg til bilder|add photos|legg til media/.test(s)) return 'add';
  if (
    /[+]/.test(s)
    || /\b(create |legg til|legg inn|registrer)/.test(s)
    || /\bny (hendelse|e-post|oppskrift|oppgave|liste|mappe|bok|chat|ukeplan|album)\b/.test(s)
    || /\bnew (event|email|recipe|task|list|folder|book|chat|week plan|album)\b/.test(s)
    || /\bnytt album\b/.test(s)
  ) return 'add';
  if (/dashbord-oppsett|dashboard setup|hjem-tema|home theme/.test(s)) {
    return isDesktop || hasRail ? 'rail' : 'tabs';
  }
  if (/dagens (plan|hendelser|avtaler)|today('|’)s (plan|events|appointments)|under hilsen|under the greeting|neste avtale|next appointment|trykk et kort|tap a (card|widget)/.test(s)) {
    return 'timeline';
  }
  if (/app-flis|app-modul|snarvei|shortcut|tile\b|app-kort|app card/.test(s)) {
    if (isDesktop || hasRail) return 'rail';
    return 'shortcuts';
  }
  if (/sidefelt|meny(?:en)? til venstre|\brail\b|left menu/.test(s)) return 'rail';
  if (/fane nederst|bytt fane|tab-bar|tab bar|bunnnavigasjon|bottom (tab|nav)/.test(s)) {
    if (isDesktop || hasRail) return 'rail';
    return 'tabs';
  }
  if (/lyspære|lightbulb|hjelpeikon|help (icon|button)/.test(s)) return 'helpBtn';
  if (/inviter|øverst|meny|header/.test(s)) return 'header';
  return 'content';
}

export function shortPitch(pitch, max = 110) {
  const raw = String(pitch || '').trim();
  if (!raw) return '';
  const first = raw.split(/(?<=[.!?])\s/)[0] || raw;
  if (first.length <= max) return first;
  return `${raw.slice(0, max - 1).trim()}…`;
}

export function inflateRect(rect, padding = 8) {
  if (!rect) return null;
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  };
}

export function clampRect(rect, winW, winH, inset = 4) {
  if (!rect) return null;
  const x = Math.min(Math.max(rect.x, inset), Math.max(inset, winW - inset));
  const y = Math.min(Math.max(rect.y, inset), Math.max(inset, winH - inset));
  const w = Math.max(24, Math.min(rect.w, winW - x - inset));
  const h = Math.max(24, Math.min(rect.h, winH - y - inset));
  return { x, y, w, h };
}

export function fallbackTargetRect(anchor, layout = {}) {
  const {
    width = 390,
    height = 844,
    isPhone = true,
    isTablet = false,
    isDesktop = false,
    hasRail = false,
    railWidth = 220,
    pad = 16,
    headerH,
    insets = { top: 0, bottom: 0 },
  } = layout;
  const rail = hasRail ? railWidth : 0;
  const topChrome = headerH ?? (isDesktop ? 52 : isPhone ? 96 : 88);
  const top = (insets.top || 0) + topChrome;
  const tabH = isPhone ? 56 : 0;

  switch (anchor) {
    case 'helpBtn': {
      if (isPhone) {
        const size = 40;
        const chrome = headerH ?? 56;
        return {
          x: width - 12 - size,
          y: (insets.top || 0) + chrome + 8,
          w: size,
          h: size,
        };
      }
      const size = isDesktop ? 32 : 36;
      const rightPad = isDesktop ? 84 : 92;
      return {
        x: width - rightPad - size,
        y: (insets.top || 0) + (isDesktop ? 8 : 10),
        w: size,
        h: size,
      };
    }
    case 'add': {
      if (isDesktop) {
        const btnW = 152;
        const btnH = 32;
        const rightCluster = 84 + 32 + 8;
        return {
          x: width - rightCluster - btnW,
          y: (insets.top || 0) + 8,
          w: btnW,
          h: btnH,
        };
      }
      return {
        x: Math.max(rail + pad, width - pad - 148),
        y: isTablet
          ? (insets.top || 0) + 72
          : Math.max((insets.top || 0) + 56, top - 48),
        w: 140,
        h: 40,
      };
    }
    case 'header':
      return {
        x: rail,
        y: insets.top || 0,
        w: Math.max(80, width - rail),
        h: isDesktop ? 52 : 80,
      };
    case 'rail':
      return { x: 0, y: 0, w: Math.max(rail, isPhone ? 1 : railWidth), h: height };
    case 'tabs':
      return {
        x: 0,
        y: height - tabH - (insets.bottom || 0),
        w: width,
        h: Math.max(tabH, 1),
      };
    case 'edit':
      return {
        x: Math.max(rail + pad, width - pad - 44),
        y: top + 8,
        w: 44,
        h: 44,
      };
    case 'fab':
      return {
        x: width - 72,
        y: height - 72 - tabH - (insets.bottom || 0),
        w: 56,
        h: 56,
      };
    case 'prefs':
    case 'moduleTabs': {
      const x = rail + pad;
      const y = top + (isPhone ? 8 : 12);
      const w = Math.max(120, width - rail - pad * 2);
      return { x, y, w, h: 44 };
    }
    case 'shortcuts': {
      const x = rail + pad;
      const y = top + (isPhone ? 220 : 180);
      const w = Math.max(120, width - rail - pad * 2);
      return { x, y, w, h: isPhone ? 96 : 120 };
    }
    case 'timeline': {
      const x = rail + pad;
      const y = top + pad + (isPhone ? 120 : 80);
      const w = Math.max(120, width - rail - pad * 2);
      return { x, y, w, h: isPhone ? 140 : 180 };
    }
    case 'content':
    default: {
      const x = rail + pad;
      // Sit below typical hero + module tab row so we don't fake-highlight the help bulb
      const y = top + pad + (isPhone ? 72 : 48);
      const w = Math.max(120, width - rail - pad * 2);
      const band = isPhone ? 128 : 160;
      return { x, y, w, h: band };
    }
  }
}

/**
 * Pick a card rect that does not cover the spotlight when space allows.
 * Phone: bottom sheet, or above the hole when the target sits mid/low.
 * Wider screens: opposite side of the hole.
 */
export function placeCard({
  winW,
  winH,
  hole,
  cardW,
  cardH,
  isPhone,
  inset = {},
} = {}) {
  const m = 16;
  const bottomSafe = inset.bottom || 0;
  const topSafe = inset.top || 0;

  if (isPhone || winW < 768) {
    const w = Math.min(cardW, winW - m * 2);
    const maxH = Math.min(cardH, Math.round(winH * 0.42));
    const bottomY = winH - maxH - m - bottomSafe;
    let y = bottomY;
    if (hole && hole.w > 0 && hole.h > 0) {
      const holeBottom = hole.y + hole.h;
      const holeMid = hole.y + hole.h / 2;
      // Target in lower half → sit the card above so the spotlight stays visible.
      if (holeMid > winH * 0.42) {
        y = Math.max(topSafe + m, hole.y - maxH - 18);
      } else if (holeBottom > bottomY - 8) {
        // Bottom sheet would cover a mid-page hole — nudge above it.
        y = Math.max(topSafe + m, Math.min(bottomY, hole.y - maxH - 18));
      }
    }
    return { x: (winW - w) / 2, y, w, h: maxH };
  }

  const w = Math.min(cardW, 400);
  const h = Math.min(cardH, winH - 48 - topSafe - bottomSafe);
  const holeCx = hole ? hole.x + hole.w / 2 : winW / 2;
  const preferRight = !hole || holeCx < winW * 0.55;
  const x = preferRight
    ? Math.max(m, winW - w - 24)
    : Math.min(24, winW - w - m);
  const y = Math.max(
    topSafe + 20,
    Math.min((winH - h) / 2, winH - h - 24 - bottomSafe),
  );
  return { x, y, w, h };
}

export function attachPoint(rect, other) {
  if (!rect) return { x: 0, y: 0 };
  const rcx = rect.x + rect.w / 2;
  const rcy = rect.y + rect.h / 2;
  if (!other) return { x: rcx, y: rcy };
  const ocx = other.x + other.w / 2;
  const ocy = other.y + other.h / 2;
  const dx = ocx - rcx;
  const dy = ocy - rcy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: rect.x + rect.w, y: rcy }
      : { x: rect.x, y: rcy };
  }
  return dy > 0
    ? { x: rcx, y: rect.y + rect.h }
    : { x: rcx, y: rect.y };
}

export function arrowPath(start, end) {
  if (!start || !end) return '';
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const c1 = { x: start.x + dx * 0.35, y: start.y + dy * 0.05 };
  const c2 = { x: end.x - dx * 0.08, y: end.y - dy * 0.22 };
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

export function arrowHead(start, end, size = 9) {
  if (!start || !end) return '';
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const b = { x: end.x - ux * size, y: end.y - uy * size };
  const l = { x: b.x + px * (size * 0.55), y: b.y + py * (size * 0.55) };
  const r = { x: b.x - px * (size * 0.55), y: b.y - py * (size * 0.55) };
  return `M ${end.x.toFixed(1)} ${end.y.toFixed(1)} L ${l.x.toFixed(1)} ${l.y.toFixed(1)} L ${r.x.toFixed(1)} ${r.y.toFixed(1)} Z`;
}

export function resolveHole(anchor, measured, layout, altMeasured = null) {
  if (!anchor) return null;
  const hasMeasured = measured && measured.w > 8 && measured.h > 8;
  // Prefer a real measured rect — never invent a hole for targets that must
  // be glued to a component (avoids arrows drifting after layout updates).
  if (anchor === 'input' && !hasMeasured) return null;
  if ((anchor === 'prefs' || anchor === 'moduleTabs' || anchor === 'friends-add') && !hasMeasured) {
    return null;
  }
  let effectiveAnchor = anchor;
  let rect = hasMeasured ? measured : null;
  if (!rect && (anchor === 'shortcuts' || anchor === 'timeline' || anchor === 'edit')) {
    if (altMeasured && altMeasured.w > 8 && altMeasured.h > 8) {
      rect = altMeasured;
    } else {
      effectiveAnchor = anchor === 'shortcuts' && (layout.isDesktop || layout.hasRail)
        ? 'rail'
        : 'content';
    }
  }
  const raw = rect || fallbackTargetRect(effectiveAnchor, layout);
  if (!raw) return null;
  return clampRect(inflateRect(raw, 10), layout.width, layout.height, 6);
}

/**
 * Inner steps only make sense after the user has actually opened the thing
 * in the previous step (a list, note, folder, form, …).
 */
export function inferStepScene(text, index = 0, prevText = '') {
  const s = String(text || '').toLowerCase();
  const prev = String(prevText || '').toLowerCase();
  if (/skriv varen|type the item|trykk enter|hit enter/.test(s)) return 'inner';
  if (/skriv, eller ta opp|type, or record|mikrofonen/.test(s)) return 'inner';
  if (/skriv og send|type and send/.test(s)) return 'inner';
  if (/legg inn ønske|add a wish|marker det som kjøpt|mark it bought/.test(s)) return 'inner';
  if (/åpne boka for å logge|open the book to log|logge sider|logg sider|log pages/.test(s)) return 'inner';
  if (/last opp fil|upload a file|legg til bilder|add photos/.test(s)) return 'inner';
  if (/velg hvem det gjelder|choose who it applies|pick who it applies|sett hvem, når|set who, when/.test(s)) {
    return 'inner';
  }
  if (/sett antall|allergier|budsjett|set (adults|allergies|budget)|lagre preferanser|save preferences/.test(s)) {
    return 'inner';
  }
  if (/gi albumet et navn|name the album|velg hvem som skal se|pick who can see/.test(s)) {
    return 'inner';
  }
  if (/kryss av i butikken|check items off/.test(s)) return 'inner';
  if (/trykk avkrysningen|tap the checkbox/.test(s)) return 'inner';
  if (index > 0 && /åpne en |åpne et |open a |trykk \+ for|tap \+ (for|to)|trykk familie|åpne familie/.test(prev)) {
    if (!/[+]/.test(s) && !/åpne en |åpne et |open a |trykk \+ /.test(s)) {
      if (/skriv|type |enter|last opp|upload|kryss av|check |logg|legg inn|add a |marker|mark it|mikrofon|record|velg hvem|set who|pick who|sett antall|allergi|budsjett|navn|name the/.test(s)) {
        return 'inner';
      }
    }
  }
  return 'hub';
}

export function buildTourSteps(rawSteps, lang = 'nb', pickText = (v) => v, layout = {}) {
  const tour = (rawSteps || []).map((raw, i, arr) => {
    const resolved = resolveRawStep(raw, layout);
    const text = pickText(resolved, lang);
    const prevResolved = i > 0 ? resolveRawStep(arr[i - 1], layout) : null;
    const prevText = prevResolved ? pickText(prevResolved, lang) : '';
    const meta = resolved && typeof resolved === 'object' ? resolved : null;
    return {
      text,
      anchor: meta?.anchor || inferStepAnchor(text, layout),
      scene: meta?.scene || inferStepScene(text, i, prevText),
      advance: false,
      where: meta?.where ? pickText(meta.where, lang) : '',
    };
  }).filter((s) => s.text);
  tour.forEach((s, i) => {
    const raw = resolveRawStep((rawSteps || [])[i], layout);
    if (raw && typeof raw === 'object' && typeof raw.advance === 'boolean') {
      s.advance = raw.advance;
    } else {
      s.advance = s.scene === 'hub' && tour[i + 1]?.scene === 'inner';
    }
  });
  return tour;
}

/** Overlay pages for the screen we are actually on (hub vs opened item). */
export function visibleTourPages(tour, scene = 'hub') {
  const all = (tour || []).map((step, index) => ({
    kind: 'step',
    text: step.text,
    where: step.where || '',
    anchor: step.anchor,
    scene: step.scene || 'hub',
    advance: !!step.advance,
    index,
  }));
  const matching = all.filter((p) => p.scene === scene);
  if (matching.length) return matching;
  return all.filter((p) => p.scene === 'hub');
}

export function shouldAutoWelcome(welcomeMap, moduleSeenMap, scope) {
  if (!scope) return false;
  if (welcomeMap && welcomeMap[scope]) return false;
  const prefix = `${scope}.`;
  const seen = moduleSeenMap && typeof moduleSeenMap === 'object' ? moduleSeenMap : {};
  return !Object.keys(seen).some((k) => k.startsWith(prefix));
}
