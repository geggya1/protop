/**
 * Kunden på et fakturautkast (DS-09). Utkastet viser kunden slik den står i kunderegisteret
 * når utkastet åpnes, og kunden kopieres inn for godt først ved ferdigstilling (da låses den
 * i reglene; bokføringsforskriften § 5-1-1 krever et øyeblikksbilde ved utstedelse).
 *
 * customerCopy på utkastet er det som sist ble hentet fra registeret. Et felt som avviker fra
 * det, har brukeren endret selv i utkastet, og blir stående. Eldre utkast uten customerCopy
 * følger registeret bare når de ikke er redigert.
 */
import { CUSTOMER_COPY_KEYS, text } from './invoices.js';
import { isCreditNote, isEditableDraft } from './invoiceFlow.js';

export { CUSTOMER_COPY_KEYS };

function address(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    street: text(src.street),
    postalCode: text(src.postalCode),
    city: text(src.city),
    country: (text(src.country) || 'NO').toUpperCase().slice(0, 2),
  };
}

function norm(key, value) {
  if (key === 'customerAddress') return address(value);
  if (key === 'orgnr') return text(value).replace(/\s/g, '');
  return text(value);
}

function same(key, left, right) {
  return JSON.stringify(norm(key, left)) === JSON.stringify(norm(key, right));
}

/** Mottakerfeltene på fakturaen slik kunden står i registeret. */
export function customerFieldsFrom(customer, project = null) {
  return {
    customerNumber: text(customer?.customerNumber),
    customerName: text(customer?.name),
    orgnr: text(customer?.orgnr).replace(/\s/g, ''),
    customerAddress: address({
      street: customer?.address || project?.address,
      postalCode: customer?.postalCode,
      city: customer?.place,
      country: customer?.country,
    }),
    customerEmail: text(customer?.invoiceEmail || customer?.email),
    customerContact: text(customer?.contactName),
  };
}

/** Kunden utkastet gjelder: customerId, ellers kundenummer, ellers org.nr. (ikke navnet, det kan være endret). */
export function draftCustomer(invoice, customers = []) {
  const list = Array.isArray(customers) ? customers : [];
  const id = text(invoice?.customerId);
  if (id) {
    const hit = list.find((row) => text(row?.id) === id);
    if (hit) return hit;
  }
  const number = text(invoice?.customerNumber);
  if (number) {
    const hit = list.find((row) => text(row?.customerNumber) === number);
    if (hit) return hit;
  }
  const org = text(invoice?.orgnr).replace(/\s/g, '');
  if (org) return list.find((row) => text(row?.orgnr).replace(/\s/g, '') === org) || null;
  return null;
}

/** Felt brukeren har endret i utkastet (avviker fra det som sist ble hentet fra registeret). */
export function editedCustomerFields(invoice) {
  const copy = invoice?.customerCopy;
  if (!copy || typeof copy !== 'object') return [];
  return CUSTOMER_COPY_KEYS.filter((key) => !same(key, invoice[key], copy[key]));
}

/**
 * Utkastet med kunden slik den står i registeret nå. Ferdigstilte fakturaer, kreditnotaer
 * og utkast uten treff i registeret gis tilbake uendret (samme objekt).
 */
export function withRegistryCustomer(invoice, customers = [], project = null) {
  if (!invoice || !isEditableDraft(invoice) || isCreditNote(invoice)) return invoice;
  const customer = draftCustomer(invoice, customers);
  if (!customer) return invoice;
  const copy = invoice.customerCopy && typeof invoice.customerCopy === 'object' ? invoice.customerCopy : null;
  // Eldre utkast uten kopi: vi vet ikke hva brukeren har skrevet selv, så et redigert utkast står.
  if (!copy && (invoice.events || []).some((event) => event?.type === 'edit')) return invoice;
  const fresh = customerFieldsFrom(customer, project);
  const edited = new Set(editedCustomerFields(invoice));
  const next = { ...invoice };
  const nextCopy = { ...(copy || {}) };
  let changed = !copy || text(invoice.customerId) !== text(customer.id);
  for (const key of CUSTOMER_COPY_KEYS) {
    if (edited.has(key)) continue;
    if (!copy || !same(key, copy[key], fresh[key])) changed = true;
    nextCopy[key] = fresh[key];
    next[key] = fresh[key];
  }
  if (!changed) return invoice;
  return { ...next, customerId: text(customer.id), customerCopy: nextCopy };
}
