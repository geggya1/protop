/**
 * Utlegg på én side (UX-17): filteret «Prosjekt / Internt / Alle».
 * Før var Økonomi → Utlegg (registrering og godkjenning) og Prosjektutlegg (Arbeid, med import
 * og filter) to sider for de samme radene. Nå viser siden begge typer, og registrering skjer der.
 * Siden, Til fakturering og prosjektfanen leser det samme (combineExpenses i expenseSave.js).
 */
import { text } from './invoices.js';
import { isExternalExpense } from './expenseStorage.js';
import { combineExpenses } from './expenseSave.js';

export const EXPENSE_SCOPES = [
  { id: 'prosjekt', label: 'Prosjekt' },
  { id: 'internt', label: 'Internt' },
  { id: 'alle', label: 'Alle' },
];

/** Filteret i adressen: /hjem/okonomi/utlegg?vis=prosjekt. */
export const EXPENSE_SCOPE_PARAM = 'vis';

const SCOPE_IDS = EXPENSE_SCOPES.map((scope) => scope.id);

/** Utlegg på prosjekt: koblet til et prosjekt, eller importert (importerte utlegg er prosjektutlegg). */
export function isProjectExpense(row) {
  if (!row) return false;
  return isExternalExpense(row) || !!(text(row.projectId) || text(row.projectNumber) || text(row.projectName));
}

export function expenseScopeOf(row) {
  return isProjectExpense(row) ? 'prosjekt' : 'internt';
}

export function filterExpenseScope(rows, scope) {
  const list = Array.isArray(rows) ? rows : [];
  if (scope === 'prosjekt' || scope === 'internt') return list.filter((row) => expenseScopeOf(row) === scope);
  return list;
}

/**
 * Filtrene personen kan velge. Utlegg (economyExpenses) gir alle tre. Prosjektutlegg
 * (economyProjectExpenses) alene gir bare Prosjekt, som den gamle Prosjektutlegg-siden.
 */
export function expenseScopesFor({ all = false, project = false } = {}) {
  if (all) return EXPENSE_SCOPES;
  if (project) return EXPENSE_SCOPES.filter((scope) => scope.id === 'prosjekt');
  return [];
}

/** Valgt filter når det er lov, ellers Alle (eller det ene filteret personen har). */
export function resolveExpenseScope(requested, allowed = []) {
  const ids = (allowed || []).map((scope) => scope.id);
  const wanted = text(requested).toLowerCase();
  if (ids.includes(wanted)) return wanted;
  if (ids.includes('alle')) return 'alle';
  return ids[0] || 'prosjekt';
}

export function expenseScopeFromSearch(search) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const value = text(params.get(EXPENSE_SCOPE_PARAM)).toLowerCase();
  return SCOPE_IDS.includes(value) ? value : '';
}

/** Spørringen med filteret satt. Andre spørringer blir stående. */
export function expenseScopeSearch(search, scope) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  params.set(EXPENSE_SCOPE_PARAM, scope);
  return `?${params.toString()}`;
}

/**
 * Gamle adresser (bokmerker, lenker i e-post og hjelpen): /hjem/arbeid/utlegg var Prosjektutlegg.
 * Den åpner nå Utlegg med filteret Prosjekt. /hjem/okonomi/utlegg er selve siden.
 */
export function movedExpensePage(tab, subView) {
  if (tab === 'arbeid' && subView === 'utlegg') {
    return { tab: 'okonomi', subView: 'utlegg', intent: { type: 'expenseScope', scope: 'prosjekt' } };
  }
  return null;
}

/**
 * Utleggene på ett prosjekt (prosjektfanen): registrerte og importerte, slått sammen som på
 * Utlegg og i Til fakturering. employeeId: bare den personens (uten full prosjekttilgang).
 */
export function projectExpenseRows(stateExpenses, imported, projectId, { employeeId = '' } = {}) {
  const id = text(projectId);
  return combineExpenses(stateExpenses, imported).filter((row) => (
    text(row.projectId) === id && (!employeeId || text(row.employeeId) === text(employeeId))
  ));
}

/**
 * Hva personen kan gjøre med en rad på Utlegg.
 * canManage: Begrenset redigering på Utlegg eller Admin på Prosjektutlegg (godkjenner og rydder).
 * Andre kan endre og slette sine egne utlegg til de er godkjent. Fakturerte utlegg står.
 * Kjøring (tripId) endres i Kjørebok, der turen og utlegget henger sammen.
 */
export function expenseRowActions(row, { canManage = false, myEmployeeId = '' } = {}) {
  const none = { approve: false, edit: false, remove: false, trip: false };
  if (!row) return none;
  if (row.status === 'invoiced' || text(row.invoiceId)) return none;
  if (text(row.tripId)) return { ...none, trip: true };
  const own = !!text(myEmployeeId) && text(row.employeeId) === text(myEmployeeId);
  const open = row.status !== 'approved' && row.status !== 'reimbursed';
  return {
    approve: canManage && open,
    edit: canManage || (own && open),
    remove: canManage || (own && open),
    trip: false,
  };
}

/** Det som mangler før et nytt utlegg kan lagres, utover feltene validateExpense sjekker. */
export function expenseDraftProblem(draft, { needsProject = false } = {}) {
  if (needsProject && !text(draft?.projectId)) return 'Velg prosjekt.';
  return '';
}
