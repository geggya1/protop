import { filterCompanyNav } from './companyAccess.js';
import { companyNavItems } from '../navigation/shellModules.js';

function flatten(items) {
  const rows = [];
  for (const item of items || []) {
    rows.push({ id: item.id, label: item.label, child: false, parentId: '' });
    for (const child of item.children || []) {
      rows.push({ id: child.id, label: child.label, child: true, parentId: item.id });
    }
  }
  return rows;
}

/** Synlige og skjulte moduler i bedriftsmenyen for et gitt rettighetssett. */
export function companyModuleVisibility(grants) {
  const items = companyNavItems();
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
