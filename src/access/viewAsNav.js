import { COMPANY_TAB_IDS, filterCompanyNav } from './companyAccess.js';
import { companyAccountNavItems, companyNavItems } from '../navigation/shellModules.js';

/**
 * Øyet hører til bedriftsmodulene.
 * Når noen allerede ses som en annen, blir symbolet stående til visningen tilbakestilles,
 * også om en er inne på en personlig side.
 */
export function viewAsChromeVisible({ canViewAs = false, tab = '', previewing = false } = {}) {
  if (!canViewAs) return false;
  if (previewing) return true;
  return COMPANY_TAB_IDS.includes(tab);
}

function flatten(items, parentId = '') {
  const rows = [];
  for (const item of items || []) {
    rows.push({ id: item.id, label: item.label, child: !!parentId, parentId });
    rows.push(...flatten(item.children || [], item.id));
  }
  return rows;
}

/** Bedriftsmeny + bedriftsvalg under Konto. */
function allCompanyMenuItems() {
  return [...companyNavItems(), ...companyAccountNavItems()];
}

/** Synlige og skjulte moduler i bedriftsmenyen for et gitt rettighetssett. */
export function companyModuleVisibility(grants) {
  const items = allCompanyMenuItems();
  const rows = flatten(items);
  if (!grants) return rows.map((row) => ({ ...row, visible: true }));
  const visible = filterCompanyNav(items, grants);
  const ids = new Set();
  for (const item of visible) {
    ids.add(item.id);
    for (const child of item.children || []) ids.add(child.id);
  }
  return rows.map((row) => ({ ...row, visible: ids.has(row.id) }));
}

/**
 * Moduler som er skjult for brukeren.
 * Undermeny under en skjult modul tas ikke med en gang til.
 */
export function hiddenCompanyModules(grants) {
  const rows = companyModuleVisibility(grants);
  const visibleIds = new Set(rows.filter((row) => row.visible).map((row) => row.id));
  return rows.filter((row) => {
    if (row.visible) return false;
    if (!row.child) return true;
    return visibleIds.has(row.parentId);
  });
}
