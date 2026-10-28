/**
 * Én meny for PC og telefon (UX-22). Sidemenyen på PC (DesktopRail), skuffen på telefon
 * (ShellDrawer) og Meny-siden i docken bygger det samme treet herfra, med samme tilgang og
 * samme moduler av/på. Variantene skiller seg bare i utseende og oppførsel (søk og kollaps
 * på PC, animasjon på telefon), ikke i innhold. Endres menyen, endres den derfor overalt.
 * Ren logikk uten React Native, så node-testene kan lese den.
 */
import { allowedAppsForChild, isChildAppAllowed } from '../utils/childApps.js';
import { grandparentModulesFor } from '../utils/grandparentAccess.js';
import { isChildAppSection } from './childAppGroups.js';
import { isParentAppSection } from './parentAppGroups.js';
import {
  buildShellModules,
  groupCompanyDrawerItems,
  isNavItemActive,
} from './shellModules.js';

export const NAV_VARIANTS = ['rail', 'drawer'];

/**
 * Seksjoner uten overskrift (EGEN-04). Bryteren Privat/Bedrift øverst er den eneste veien
 * mellom privat og bedrift, og menyen viser det som hører til arbeidsområdet som er valgt
 * (bedriftsmenyen bare i Bedrift). Hjem, Kalender, E-post, Oppgaver, Notat og Timeliste
 * finnes i begge, så de står øverst uten en egen «Personlig»-overskrift, som ellers leses
 * som en ekstra vei til Privat ved siden av bryteren.
 */
const HEADLESS_SECTION_IDS = new Set(['main']);

/** Seksjoner som kan lukkes. Bedriftsgruppene lukkes én og én, ikke hele bedriftsmenyen. */
function sectionFoldable(id) {
  return isParentAppSection(id) || isChildAppSection(id) || id === 'account' || id === 'skole';
}

/**
 * Argumentene til buildShellModules, utledet likt for alle menyene fra appens tilstand
 * (useApp), tilgangen (useCompanyAccess) og bedriftens moduler (useCompanyModules).
 */
export function navTreeInput({
  t,
  app = {},
  companyGrants = null,
  companyModules = null,
  companyModuleNote = '',
} = {}) {
  const {
    isParent, isChild, isActingAsChild, isAdmin, isSuperAdmin, isGrandparent,
    family = null, familyId = null, kids, meChild, meParent, activeChild,
  } = app || {};
  const asChild = !!(isChild || isActingAsChild);
  const asParent = !!(isParent && !isActingAsChild);
  const activeKids = (kids || []).filter((kid) => kid && kid.active !== false);
  const childForSchedule = (isActingAsChild ? activeChild : (isChild ? meChild : null)) || null;
  const allowedApps = asChild ? allowedAppsForChild(childForSchedule) : null;
  return {
    t,
    asChild,
    asParent,
    isAdmin: !!isAdmin,
    isSuperAdmin: !!isSuperAdmin,
    familyId,
    family,
    hasKids: activeKids.length > 0,
    childForSchedule,
    aiEnabled: asChild ? isChildAppAllowed(allowedApps, 'ai') : true,
    allowedApps,
    showChildRestrictions: !!(isActingAsChild && childForSchedule),
    firstKid: activeKids[0] || null,
    isGrandparent: !!isGrandparent,
    grandparentModules: isGrandparent ? grandparentModulesFor(meParent) : null,
    companyGrants,
    companyModules,
    companyModuleNote,
  };
}

/**
 * Menyens innhold. hideChat: på web ligger chatten i chat-docken nede til høyre,
 * så sidemenyen på PC viser ikke Chat (skuffen gjør det, der åpner den chat-skuffen).
 */
export function buildNavTree(input, { hideChat = false } = {}) {
  const sections = buildShellModules(input);
  if (!hideChat) return sections;
  return sections.map((section) => ({
    ...section,
    items: (section.items || []).filter((item) => item.id !== 'chat'),
  }));
}

/** Søk i menyen: treff på punktet, eller på en underside (som da vises med modulen åpen). */
function narrowItems(items, q) {
  const match = (item) => String(item.label || '').toLowerCase().includes(q);
  return (items || []).map((item) => {
    if (match(item)) return item;
    const kids = (item.children || []).filter(match);
    if (kids.length) return { ...item, children: kids, forceOpen: true };
    return null;
  }).filter(Boolean);
}

/**
 * Seksjonene slik menyen tegner dem: søket brukt, bedriftsmenyen gruppert
 * (COMPANY_DRAWER_GROUPS) og overskrift/lukking bestemt. Tomme seksjoner tas bort.
 */
export function navSections(sections, { query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return (sections || [])
    .map((section) => {
      const items = q ? narrowItems(section.items, q) : (section.items || []);
      const appFolder = isParentAppSection(section.id) || isChildAppSection(section.id);
      return {
        ...section,
        heading: HEADLESS_SECTION_IDS.has(section.id) ? '' : (section.title || ''),
        appFolder,
        foldable: sectionFoldable(section.id),
        items: section.id === 'company' ? groupCompanyDrawerItems(items) : items,
      };
    })
    .filter((section) => section.items.length > 0);
}

function itemContainsActive(item, activeTab, activeSubView) {
  if (isNavItemActive(item, activeTab, activeSubView)) return true;
  return (item.children || []).some((child) => itemContainsActive(child, activeTab, activeSubView));
}

/** Om seksjonen har siden som er åpen nå (også inne i en gruppe). */
export function navSectionHasActive(section, activeTab, activeSubView) {
  return (section?.items || []).some((item) => itemContainsActive(item, activeTab, activeSubView));
}

/**
 * Om seksjonen vises åpen. Et trykk på overskriften lagres i `open` og vinner.
 * Ellers åpen når den har aktiv side; app-mapper og Konto er lukket til de åpnes.
 */
export function navSectionExpanded(section, {
  open = {}, query = '', activeTab = null, activeSubView = null,
} = {}) {
  if (!section) return false;
  if (String(query || '').trim()) return true;
  if (!section.foldable) return true;
  if (open && Object.prototype.hasOwnProperty.call(open, section.id)) return open[section.id] !== false;
  if (navSectionHasActive(section, activeTab, activeSubView)) return true;
  if (section.appFolder || section.id === 'account') return false;
  return true;
}

/** Punktet som er åpent nå, og seksjonen det ligger i (skuffen ruller dit). */
export function findActiveNavItem(sections, activeTab, activeSubView) {
  const walk = (items, sectionId) => {
    for (const item of items || []) {
      const nested = walk(item.children || [], sectionId);
      if (nested) return nested;
      if (!item.group && isNavItemActive(item, activeTab, activeSubView)) return { itemId: item.id, sectionId };
    }
    return null;
  };
  for (const section of sections || []) {
    const hit = walk(section.items, section.id);
    if (hit) return hit;
  }
  return null;
}

/** Kollapset sidemeny (bare ikoner): de øverste punktene, så modulene i bedriftsmenyen. */
export function collapsedNavItems(sections) {
  const main = (sections || []).find((section) => section.id === 'main')?.items || [];
  const company = groupCompanyDrawerItems(
    (sections || []).find((section) => section.id === 'company')?.items || [],
  ).flatMap((item) => (item.group ? (item.children || []) : [item]));
  return { main, company };
}

/** Utfører et menyvalg likt i alle menyene. */
export function runNavAction(action, { onSelectTab, navigate } = {}) {
  if (!action) return false;
  if (action.type === 'tab') {
    onSelectTab?.(action.tab, action.subView || null);
    return true;
  }
  if (action.type === 'nav') {
    navigate?.(action.screen, action.params);
    return true;
  }
  return false;
}
