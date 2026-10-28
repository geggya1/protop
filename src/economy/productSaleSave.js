/**
 * Produktsalg ligger to steder (DS-13): importerte salg i egen samling
 * (families/{id}/productSales), øvrige i prosjektstate. Denne modulen er stedet som vet det:
 * lesing slår sammen begge med samme regel overalt, og lagring og sletting går dit salget
 * hører hjemme. Brukes av Produktsalg-siden, som ikke eier prosjektstate selv. Prosjektsiden
 * lagrer egne salg via onChangeState. Ingen migrering.
 */
import { deleteSale } from './opsState.js';
import { replaceSaleInState } from './productSaleEdit.js';
import {
  deleteProductSale,
  isExternalSale,
  loadProductSales,
  mergeSaleLists,
  saveProductSaleEdit,
  withoutExternalSales,
} from './productSalesStorage.js';
import { saleIsLocked } from './productSalesView.js';
import { loadProjectState, patchProjectOperations } from '../project/storage.js';

/**
 * Alle salg: importerte fra samlingen og de som er registrert i appen. En kopi av et
 * importert salg i prosjektstate telles ikke; samlingen har den riktige.
 */
export function combineSales(stateSales = [], collectionRows = []) {
  return mergeSaleLists(collectionRows, withoutExternalSales(stateSales));
}

/** Les begge stedene. state: prosjektstate skjermen allerede har (ellers lastes den). */
export async function loadAllSales(companyId, { state = null } = {}) {
  const [remote, project] = await Promise.all([
    loadProductSales(companyId).catch(() => []),
    state ? Promise.resolve(state) : loadProjectState(companyId, { hours: false }),
  ]);
  return combineSales(project?.sales, remote);
}

function failure(error, fallback) {
  return { ok: false, error: String(error?.message || error || '') || fallback };
}

export async function saveSaleChange(companyId, sale) {
  if (isExternalSale(sale)) {
    try {
      await saveProductSaleEdit(companyId, sale);
      return { ok: true };
    } catch (cause) {
      return failure(cause, 'Kunne ikke lagre salget.');
    }
  }
  let refused = '';
  let patch = null;
  const result = await patchProjectOperations(companyId, (remote) => {
    const next = replaceSaleInState(remote, sale);
    if (!next.ok) {
      refused = next.error;
      return null;
    }
    patch = { sales: next.state.sales };
    if (next.state.products !== remote.products) patch.products = next.state.products;
    return patch;
  }).catch((cause) => ({ ok: false, error: cause }));
  if (refused) return { ok: false, error: refused };
  if (!result?.ok) return failure(result?.error, 'Kunne ikke lagre salget.');
  return { ok: true, patch };
}

export async function removeSale(companyId, sale) {
  if (saleIsLocked(sale)) return { ok: false, error: 'Fakturert salg kan ikke slettes.' };
  if (isExternalSale(sale)) {
    try {
      await deleteProductSale(companyId, sale);
      return { ok: true };
    } catch (cause) {
      return failure(cause, 'Kunne ikke slette salget.');
    }
  }
  let refused = '';
  let patch = null;
  const result = await patchProjectOperations(companyId, (remote) => {
    const next = deleteSale(remote, sale.id);
    if (!next.ok) {
      refused = next.error;
      return null;
    }
    patch = { sales: next.state.sales };
    return patch;
  }).catch((cause) => ({ ok: false, error: cause }));
  if (refused) return { ok: false, error: refused };
  if (!result?.ok) return failure(result?.error, 'Kunne ikke slette salget.');
  return { ok: true, patch };
}
