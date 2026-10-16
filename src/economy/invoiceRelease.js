/**
 * Frigjør timer og poster etter sletting av faktura.
 * Rører bare id-ene på fakturaen og utlegg på prosjektstate — ikke saveProjectState,
 * som ellers kan skrive hele timehistorikken og la «Sletter…» henge.
 */
import { text } from './invoices.js';
import { releaseTimeEntriesFromInvoice } from './timeEntryStorage.js';
import { clearOperationsInvoice } from './opsState.js';
import { patchProjectOperations } from '../project/storage.js';

export function invoiceTimeEntryIds(invoice) {
  const ids = [];
  for (const id of invoice?.timeEntryIds || []) ids.push(text(id));
  for (const line of invoice?.lines || []) {
    for (const id of line?.timeEntryIds || []) ids.push(text(id));
  }
  return [...new Set(ids.filter(Boolean))];
}

export async function releaseInvoicedWork(companyId, invoice) {
  const id = text(companyId);
  const invoiceId = text(invoice?.id);
  if (!id || id === '__demo__' || !invoiceId) return;
  const entryIds = invoiceTimeEntryIds(invoice);
  await releaseTimeEntriesFromInvoice(id, invoiceId, entryIds);
  await patchProjectOperations(id, (state) => {
    const next = clearOperationsInvoice(state, invoiceId);
    if (next === state) return null;
    return {
      expenses: next.expenses,
      mileageTrips: next.mileageTrips,
      sales: next.sales,
    };
  });
}
