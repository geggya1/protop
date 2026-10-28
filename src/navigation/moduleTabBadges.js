/**
 * Tall på fanene i modulmenyen, f.eks. «Tilbud (2)» i Anbud.
 * Modulen melder tallene, ModuleTabs viser dem. Et lite lager utenfor React,
 * så skallet ikke trenger å kjenne til hva modulen teller.
 */
const counts = new Map();
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn();
}

/** values: { [sideId]: antall }. 0 eller tomt viser ikke noe tall. */
export function setModuleTabBadges(moduleId, values) {
  if (!moduleId) return;
  const next = {};
  for (const [id, n] of Object.entries(values || {})) {
    const value = Math.max(0, Math.floor(Number(n) || 0));
    if (value) next[id] = value;
  }
  const prev = counts.get(moduleId) || {};
  const same = Object.keys(prev).length === Object.keys(next).length
    && Object.entries(next).every(([id, n]) => prev[id] === n);
  if (same) return;
  counts.set(moduleId, next);
  emit();
}

export function clearModuleTabBadges(moduleId) {
  if (!counts.has(moduleId)) return;
  counts.delete(moduleId);
  emit();
}

export function moduleTabBadges(moduleId) {
  return counts.get(moduleId) || {};
}

export function subscribeModuleTabBadges(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Fanetekst med tall: «Tilbud (2)». */
export function badgedLabel(label, count) {
  return count ? `${label} (${count})` : label;
}
