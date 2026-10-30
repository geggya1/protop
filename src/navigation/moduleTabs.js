/**
 * Vannrett meny inne i en modul: undersidene som tidligere lå som undermeny i hamburgermenyen.
 * Kilden er bedriftsmenyen (companyMenuItems), så tilgang og låste moduler følger samme regler.
 * Alle moduler har samme meny (også HR og Anbud): fanene som får plass, og resten under «Mer» (UX-19).
 */
import {
  COMPANY_DRAWER_GROUPS, ISO_MENU, companyNavItems, defaultAnbudSubView, defaultHrSubView, defaultIsoSubView, defaultMoterSubView,
  isNavItemActive,
} from './shellModules.js';

/** ISO har mange sider, ordnet i deler. Oversikt og Innstillinger er egne faner. */
const ISO_GROUPS = [
  { id: 'styring', label: 'Styring', group: 'Styring' },
  { id: 'drift', label: 'Drift', group: 'Operativt' },
  { id: 'evaluering', label: 'Evaluering', group: 'Evaluering' },
  { id: 'innstillinger', label: 'Innstillinger', group: 'Innstillinger' },
];

/** Sidene som står først i raden. Resten følger i menyrekkefølge. ISO: de mest brukte sidene. */
const PRIMARY = {
  iso: ['oversikt', 'avvik', 'risiko', 'hms', 'dokumenter', 'prosesser', 'kompetanse', 'revisjon'],
};

/** Kortnavn på fanen på telefon, så 3–4 faner får plass. Arket og sidetittelen bruker hele navnet. */
const SHORT = {
  'anbud-varsling': 'Varsling',
  'anbud-foresporsel': 'Forespørsel',
  'anbud-vurdering': 'Vurdering',
  'anbud-tilbud': 'Tilbud',
  'iso-avvik': 'Avvik',
  'fravaer-fravaer': 'Oversikt',
  'fravaer-fravaersrapport': 'Rapport',
  'fravaer-planlagt': 'Planlagt',
  'selskapsinnstillinger-moduler': 'Moduler',
  'selskapsinnstillinger-tilgang': 'Tilgang',
  'iso-lovkrav': 'Lovkrav',
  'iso-organisasjon': 'Roller',
  'iso-ledelse': 'Ledelse',
};

/** Modulene som viser en standard underside når adressen ikke har en (/hjem/hr → Oversikt). */
const DEFAULT_SUB = {
  iso: defaultIsoSubView,
  moter: defaultMoterSubView,
  hr: defaultHrSubView,
  anbud: (sub) => (sub === 'pipeline' ? 'tilbud' : defaultAnbudSubView(sub)),
};

const sameAction = (a, b) => !!a && !!b && a.tab === b.tab && (a.subView || null) === (b.subView || null);

function ordered(moduleId, pages) {
  const first = (PRIMARY[moduleId] || []).map((id) => `${moduleId}-${id}`);
  if (!first.length) return pages;
  const rank = (p) => (first.includes(p.id) ? first.indexOf(p.id) : first.length);
  return pages.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}

/**
 * ISO-menyen: første rad er delene (Oversikt, Styring, Drift, Evaluering, Innstillinger),
 * andre rad er sidene i delen du står i, i menyrekkefølge.
 */
function isoSections(pages, active) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const pick = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  const sections = [
    { id: 'oversikt', label: 'Oversikt', pages: pick(['iso-oversikt']) },
    ...isoGroups(pages).map((g) => ({ id: g.id, label: g.label, pages: pick(g.pageIds) })),
  ].filter((s) => s.pages.length);
  const current = sections.find((s) => s.pages.some((p) => p.id === active?.id)) || sections[0] || null;
  return { sections, activeSectionId: current?.id || null };
}

function isoGroups(pages) {
  const have = new Set(pages.map((p) => p.id));
  return ISO_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    pageIds: ISO_MENU
      .filter((m) => m.group === g.group && m.id !== 'oversikt' && have.has(`iso-${m.id}`))
      .map((m) => `iso-${m.id}`),
  })).filter((g) => g.pageIds.length);
}

/**
 * Menyen for fanen og undersiden, eller null når modulen ikke har undersider.
 * items: bedriftsmenyen etter tilgang (companyMenuItems). Uten den brukes hele menyen.
 * Svar: { moduleId, label, pages: [{ id, label, short, icon, action }], activeId, groups?, sections?, activeSectionId? }
 * pages står i visningsrekkefølge. groups (ISO) er titlene i «Mer»-arket.
 * sections (ISO): delene med sidene sine, vist som to rader (ModuleTabs).
 */
export function moduleTabsFor(tab, subView, items = null) {
  if (!tab) return null;
  const list = items || companyNavItems({ includeUnderenheter: true });
  const sub = DEFAULT_SUB[tab] ? DEFAULT_SUB[tab](subView) : (subView || null);
  const module = list.find((item) => !item.locked && (item.children || []).length && isNavItemActive(item, tab, sub));
  if (!module) return groupTabsFor(list, tab);
  let pages = module.children.filter((p) => !p.locked && p.action?.type === 'tab');
  // Modulens egen side først når den ikke er en av undersidene (Selskapsinnstillinger → Generelt).
  if (module.action?.type === 'tab' && !pages.some((p) => sameAction(p.action, module.action))) {
    pages = [{ id: `${module.id}-start`, label: 'Generelt', icon: module.icon, action: module.action }, ...pages];
  }
  if (pages.length < 2) return null;
  pages = ordered(module.id, pages).map((p) => (SHORT[p.id] ? { ...p, short: SHORT[p.id] } : p));
  const active = pages.find((p) => isNavItemActive(p, tab, sub)) || null;
  const out = { moduleId: module.id, label: module.label, pages, activeId: active?.id || null };
  if (module.id === 'iso') Object.assign(out, { groups: isoGroups(pages) }, isoSections(pages, active));
  return out;
}

/**
 * Grupper med `tabs` (Kunder og oppdrag): sidene i gruppen står som faner seg imellom,
 * så også sider uten undersider har meny under båndet. Sider med egne undersider hører ikke med.
 */
function groupTabsFor(list, tab) {
  for (const group of COMPANY_DRAWER_GROUPS) {
    if (!group.tabs) continue;
    const pages = group.itemIds
      .map((id) => list.find((item) => item.id === id))
      .filter((item) => item && !item.locked && item.action?.type === 'tab' && !(item.children || []).length);
    const active = pages.find((page) => page.action.tab === tab);
    if (!active || pages.length < 2) continue;
    return { moduleId: group.id, label: group.label, pages, activeId: active.id };
  }
  return null;
}

/** Omtrentlig bredde på en fane: 14 px tekst (≈ 7,2 px per tegn) og 12 px luft på hver side. */
export function tabWidth(label) {
  return Math.ceil(String(label || '').length * 7.2) + 26;
}

/** «Mer»-knappen har en pil i tillegg til teksten. */
const MORE_ICON = 20;
export const PHONE_MAX_TABS = 4;

/**
 * Hvilke faner som står i raden, og hvilke som ligger under «Mer».
 * width: plassen raden har (px). max: høyst så mange faner i raden (telefon: 4). short: bruk kortnavn.
 * Siden du står på, er alltid i raden: ligger den under «Mer», tar den plassen til den siste fanen
 * som får plass (som GitHubs UnderlineNav), så du ser hvor du er.
 * Svar: { visible: [page], more: [{ id, label, pages }] }
 */
export function splitModuleTabs(menu, { width = Infinity, max = Infinity, short = false } = {}) {
  const pages = menu?.pages || [];
  const w = (p) => tabWidth((short && p.short) || p.label);
  const total = pages.reduce((n, p) => n + w(p), 0);
  if (pages.length <= max && total <= width) return { visible: pages, more: [] };
  const room = width - tabWidth('Mer') - MORE_ICON;
  let used = 0;
  let count = 0;
  for (const p of pages) {
    if (count >= max || used + w(p) > room) break;
    used += w(p);
    count += 1;
  }
  count = Math.min(Math.max(1, count), pages.length - 1);
  let visible = pages.slice(0, count);
  const active = pages.find((p) => p.id === menu.activeId) || null;
  if (active && !visible.includes(active)) {
    // Gi plass til den aktive siden fra slutten av raden. Den første fanen blir alltid stående.
    const sum = (list) => list.reduce((n, p) => n + w(p), 0);
    visible = visible.slice(0, Math.min(visible.length, max - 1));
    while (visible.length > 1 && sum(visible) + w(active) > room) visible = visible.slice(0, -1);
    visible = [...visible, active];
  }
  const shown = new Set(visible.map((p) => p.id));
  const rest = pages.filter((p) => !shown.has(p.id));
  // Arket viser resten, med delene som titler når modulen har dem (ISO, i menyrekkefølge).
  let more;
  if (menu.groups?.length) {
    const byId = new Map(rest.map((p) => [p.id, p]));
    more = menu.groups
      .map((g) => ({ id: g.id, label: g.label, pages: g.pageIds.map((id) => byId.get(id)).filter(Boolean) }))
      .filter((g) => g.pages.length);
    const grouped = new Set(more.flatMap((g) => g.pages.map((p) => p.id)));
    const loose = rest.filter((p) => !grouped.has(p.id));
    if (loose.length) more = [{ id: 'andre', label: null, pages: loose }, ...more];
  } else {
    more = [{ id: 'alle', label: null, pages: rest }];
  }
  return { visible, more };
}
