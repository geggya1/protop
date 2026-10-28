/**
 * Utlegg ligger to steder (DS-13): registrert i appen i prosjektdokumentet
 * (projects/state.expenses) og importert i families/{companyId}/projectExpenses.
 * Denne modulen er stedet som vet det. Lesing slår sammen begge med samme regel overalt
 * (samlingen er fasit for importerte rader), og lagring og sletting går dit raden hører
 * hjemme. Ingen migrering: radene blir liggende der de er. Samme mønster som
 * productSaleSave.js for produktsalg.
 */
import { deleteExpense, upsertExpense } from './opsState.js';
import {
  deleteProjectExpense,
  isExternalExpense,
  loadProjectExpenses,
  mergeExpenseLists,
  saveProjectExpenses,
  withoutExternalExpenses,
} from './expenseStorage.js';
import { loadProjectState, patchProjectOperations } from '../project/storage.js';

function failure(error, fallback) {
  return { ok: false, error: String(error?.message || error || '') || fallback };
}

/**
 * Alle utlegg: importerte fra samlingen og de som er registrert i appen. En kopi av en
 * importert rad i prosjektdokumentet telles ikke; samlingen har den riktige.
 */
export function combineExpenses(stateExpenses = [], collectionRows = []) {
  return mergeExpenseLists(collectionRows, withoutExternalExpenses(stateExpenses));
}

/** Les begge stedene. state: prosjektstate skjermen allerede har (ellers lastes den). */
export async function loadAllExpenses(companyId, { state = null } = {}) {
  const [remote, project] = await Promise.all([
    loadProjectExpenses(companyId).catch(() => []),
    state ? Promise.resolve(state) : loadProjectState(companyId, { hours: false }),
  ]);
  return combineExpenses(project?.expenses, remote);
}

/** Lagre ett utlegg der det ligger. patch: endrede lister i prosjektstate (når den ble skrevet). */
export async function saveExpenseChange(companyId, expense) {
  if (isExternalExpense(expense)) {
    if (expense?.status === 'invoiced') return { ok: false, error: 'Fakturert utlegg kan ikke endres.' };
    try {
      await saveProjectExpenses(companyId, [{ ...expense, updatedAt: new Date().toISOString() }]);
      return { ok: true };
    } catch (cause) {
      return failure(cause, 'Kunne ikke lagre utlegget.');
    }
  }
  let refused = '';
  let patch = null;
  const result = await patchProjectOperations(companyId, (remote) => {
    const next = upsertExpense(remote, expense);
    if (!next.ok) {
      refused = next.error;
      return null;
    }
    patch = { expenses: next.state.expenses };
    return patch;
  }).catch((cause) => ({ ok: false, error: cause }));
  if (refused) return { ok: false, error: refused };
  if (!result?.ok) return failure(result?.error, 'Kunne ikke lagre utlegget.');
  return { ok: true, patch };
}

/** Slett ett utlegg der det ligger. Fakturerte utlegg slettes ikke. */
export async function removeExpenseRow(companyId, expense) {
  if (expense?.status === 'invoiced') return { ok: false, error: 'Fakturert utlegg kan ikke slettes.' };
  if (isExternalExpense(expense)) {
    try {
      await deleteProjectExpense(companyId, expense);
      return { ok: true };
    } catch (cause) {
      return failure(cause, 'Kunne ikke slette utlegget.');
    }
  }
  let refused = '';
  let patch = null;
  const result = await patchProjectOperations(companyId, (remote) => {
    const next = deleteExpense(remote, expense?.id);
    if (!next.ok) {
      refused = next.error;
      return null;
    }
    // Diffen mot skyens kopi merker raden som slettet (deletedRows), som for salg.
    patch = { expenses: next.state.expenses };
    return patch;
  }).catch((cause) => ({ ok: false, error: cause }));
  if (refused) return { ok: false, error: refused };
  if (!result?.ok) return failure(result?.error, 'Kunne ikke slette utlegget.');
  return { ok: true, patch };
}
