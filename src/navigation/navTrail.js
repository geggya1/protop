/**
 * Stien til en bedriftsside slik menyen viser den: gruppe › modul › side.
 * Bygges fra COMPANY_DRAWER_GROUPS og companyNavItems, samme kilde som
 * hamburgermenyen og venstremenyen, så brødsmulen følger menyen når den endres.
 * Ren logikk, så node-testene kan lese den.
 */
import { COMPANY_DRAWER_GROUPS, companyNavItems, isNavItemActive } from './shellModules.js';

export const TRAIL_SEPARATOR = ' › ';

function node(item) {
  if (!item) return null;
  return { id: item.id, label: item.label, action: item.action || null };
}

/**
 * Gruppe, modul og side for fanen og undersiden, eller null når siden ikke
 * ligger i bedriftsmenyen (personlige sider, kontoinnstillinger).
 */
export function companyNavTrail(tab, subView = null) {
  if (!tab) return null;
  const sub = subView || null;
  const byId = new Map(companyNavItems({ includeUnderenheter: true }).map((item) => [item.id, item]));
  for (const group of COMPANY_DRAWER_GROUPS) {
    for (const id of group.itemIds) {
      const item = byId.get(id);
      if (!item || !isNavItemActive(item, tab, sub)) continue;
      const page = (item.children || []).find((child) => isNavItemActive(child, tab, sub)) || null;
      return {
        group: { id: group.id, label: group.label },
        module: node(item),
        page: node(page),
      };
    }
  }
  return null;
}

/** Menygruppen siden ligger i, eller tom streng. */
export function companyNavGroupId(tab, subView = null) {
  return companyNavTrail(tab, subView)?.group.id || '';
}

/**
 * Leddene i brødsmulen. Siden er siste ledd og har ingen lenke.
 * compact (telefon) dropper menygruppen. Et ledd som har samme navn som forrige, tas ikke med.
 */
export function navTrailSegments(trail, { compact = false, current = '' } = {}) {
  if (!trail) return [];
  const rows = [];
  if (!compact) rows.push({ id: trail.group.id, label: trail.group.label, action: null });
  rows.push({ id: trail.module.id, label: trail.module.label, action: trail.module.action });
  if (trail.page) rows.push({ id: trail.page.id, label: trail.page.label, action: trail.page.action });
  if (current) rows.push({ id: 'current', label: current, action: null });
  const out = [];
  for (const row of rows) {
    if (out.length && out[out.length - 1].label === row.label) {
      out[out.length - 1] = row;
      continue;
    }
    out.push(row);
  }
  // Siste ledd er siden man står på.
  if (out.length) out[out.length - 1] = { ...out[out.length - 1], action: null, current: true };
  return out;
}

/** Brødsmulen som tekst: «Ansatte og arbeidstid › Timer / arbeid per ansatt › Godkjenninger». */
export function navTrailText(tab, subView = null, options = {}) {
  return navTrailSegments(companyNavTrail(tab, subView), options).map((row) => row.label).join(TRAIL_SEPARATOR);
}
