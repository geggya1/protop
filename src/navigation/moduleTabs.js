/**
 * Vannrett meny inne i en modul: undersidene som tidligere lå som undermeny i hamburgermenyen.
 * Kilden er bedriftsmenyen (companyMenuItems), så tilgang og låste moduler følger samme regler.
 * HR og Anbud har sin egen meny på siden og får ikke en til.
 */
import { ISO_MENU, companyNavItems, defaultIsoSubView, isNavItemActive } from './shellModules.js';

const OWN_NAV = new Set(['hr', 'anbud']);

/** ISO har mange sider: først et valg av del, så sidene i delen. */
const ISO_SECTIONS = [
  { id: 'oversikt', label: 'Oversikt', group: null },
  { id: 'styring', label: 'Styring', group: 'Styring' },
  { id: 'drift', label: 'Drift', group: 'Operativt' },
  { id: 'evaluering', label: 'Evaluering', group: 'Evaluering' },
];

const sameAction = (a, b) => !!a && !!b && a.tab === b.tab && (a.subView || null) === (b.subView || null);

function isoSections(pages, active) {
  const groupOf = new Map(ISO_MENU.map((m) => [`iso-${m.id}`, m.id === 'oversikt' ? null : m.group]));
  const sections = ISO_SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    pages: pages.filter((p) => (s.group === null ? groupOf.get(p.id) === null : groupOf.get(p.id) === s.group)),
  })).filter((s) => s.pages.length);
  const activeSection = sections.find((s) => s.pages.some((p) => p.id === active?.id)) || sections[0] || null;
  return { sections, activeSectionId: activeSection?.id || null };
}

/**
 * Menyen for fanen og undersiden, eller null når modulen ikke har undersider.
 * items: bedriftsmenyen etter tilgang (companyMenuItems). Uten den brukes hele menyen.
 * Svar: { moduleId, label, pages: [{ id, label, icon, action }], activeId, sections?, activeSectionId? }
 */
export function moduleTabsFor(tab, subView, items = null) {
  if (!tab) return null;
  const list = items || companyNavItems({ includeUnderenheter: true });
  const sub = tab === 'iso' ? defaultIsoSubView(subView) : (subView || null);
  const module = list.find((item) => !OWN_NAV.has(item.id) && !item.locked && (item.children || []).length
    && isNavItemActive(item, tab, sub));
  if (!module) return null;
  let pages = module.children.filter((p) => !p.locked && p.action?.type === 'tab');
  // Modulens egen side først når den ikke er en av undersidene (Selskapsinnstillinger → Generelt).
  if (module.action?.type === 'tab' && !pages.some((p) => sameAction(p.action, module.action))) {
    pages = [{ id: `${module.id}-start`, label: 'Generelt', icon: module.icon, action: module.action }, ...pages];
  }
  if (pages.length < 2) return null;
  const active = pages.find((p) => isNavItemActive(p, tab, sub)) || null;
  const out = { moduleId: module.id, label: module.label, pages, activeId: active?.id || null };
  if (module.id === 'iso') Object.assign(out, isoSections(pages, active));
  return out;
}
