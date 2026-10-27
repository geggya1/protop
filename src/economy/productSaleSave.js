/**
 * Lagre eller slette ett produktsalg der det ligger: importerte salg i egen
 * samling, øvrige i prosjektstate. Brukes av Produktsalg-siden, som ikke eier
 * prosjektstate selv. Prosjektsiden lagrer egne salg via onChangeState.
 */
import { deleteSale } from './opsState.js';
import { replaceSaleInState } from './productSaleEdit.js';
import { deleteProductSale, isExternalSale, saveProductSaleEdit } from './productSalesStorage.js';
import { saleIsLocked } from './productSalesView.js';
import { patchProjectOperations } from '../project/storage.js';

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
