/**
 * Påbudt innhold i salgsdokumentet (bokføringsforskriften § 5-1-1 og foretaksregisterloven § 10-2):
 * selgers navn, adresse og org.nr. (med «MVA» bare når selskapet står i Merverdiavgiftsregisteret),
 * kjøpers navn og adresse, leveringsdato eller -periode, beskrivelse av ytelsen, beløp, mva og forfall,
 * og ved omvendt avgiftsplikt kjøpers org.nr.
 * Rene kontroller. issueChecks viser dem før ferdigstilling, og issueInvoice stopper på dem.
 */
import { parseDate, text } from './invoices.js';
import { normalizeLines, totalsFromLines } from './invoiceLines.js';
import { hasReverseCharge } from './vat.js';

function isCredit(invoice) {
  return invoice?.kind === 'credit_note' || !!text(invoice?.creditNoteForId);
}

/** Gate og postnummer eller sted. */
export function customerHasAddress(invoice) {
  const addr = invoice?.customerAddress || {};
  return !!(text(addr.street) && (text(addr.postalCode) || text(addr.city)));
}

/**
 * Selgers adresse. Selskapsprofilen har enten gate, postnummer og sted hver for seg,
 * eller én linje fra Brønnøysund («Gate 1, 4313 Sandnes»).
 */
export function supplierHasAddress(supplier = {}) {
  const street = text(supplier.address);
  if (!street) return false;
  return !!(text(supplier.postalCode) || text(supplier.city) || /\b\d{4}\b/.test(street));
}

/** true, false eller null når det er ukjent om selskapet står i Merverdiavgiftsregisteret. */
export function supplierVatStatus(supplier = {}) {
  if (supplier.vatKnown === false) return null;
  if (supplier.vatRegistered === true || supplier.vatRegistered === false) return supplier.vatRegistered;
  return null;
}

/**
 * Leveringsdatoen som står på fakturaen: perioden fra linjene, ellers fakturadatoen.
 * fromInvoiceDate sier at fakturadatoen er brukt fordi perioden mangler.
 */
export function deliveryDateOf(invoice = {}) {
  const start = parseDate(invoice.periodStart);
  const end = parseDate(invoice.periodEnd);
  if (start || end) return { start: start || end, end: end || start, fromInvoiceDate: false };
  const date = parseDate(invoice.invoiceDate);
  return { start: date, end: date, fromInvoiceDate: true };
}

/**
 * Kontroll av påbudt innhold. mode 'protop': ProTop utsteder og står for hele dokumentet.
 * mode 'poweroffice': PowerOffice utsteder, har kunderegisteret og setter selgerdata selv,
 * så kjøpers adresse er bare et råd og selgerdata kontrolleres ikke her.
 * Returnerer { blocking, warnings } med { id, text, field } som issueChecks.
 */
export function invoiceContentChecks(invoice, { supplier = null, mode = 'protop' } = {}) {
  const row = invoice || {};
  const blocking = [];
  const warnings = [];
  const add = (list, id, message, field = '') => list.push({ id, text: message, field });
  const lines = normalizeLines(row.lines);
  const totals = totalsFromLines(lines);
  const credit = isCredit(row);

  // Ytelsen: beskrivelse og beløp.
  if (!lines.length) add(blocking, 'lines', 'Fakturaen har ingen linjer.', 'lines');
  else if (!totals.totalDue && !totals.amountExVat) add(blocking, 'amount', 'Beløpet er 0.', 'lines');
  if (lines.some((line) => !text(line.description))) add(blocking, 'lineText', 'En linje mangler tekst.', 'lines');

  // Kjøper: navn og adresse.
  if (!text(row.customerName)) add(blocking, 'customer', 'Kunden mangler.', 'customerName');
  if (!customerHasAddress(row)) {
    if (mode === 'protop') {
      add(blocking, 'address', 'Kundens adresse mangler. Fakturaen skal ha kjøpers navn og adresse (bokføringsforskriften § 5-1-1). Legg inn gate og postnummer på kunden eller i utkastet.', 'customerAddress');
    } else if (!text(row.orgnr)) {
      add(blocking, 'party', 'Kunden må ha org.nr. eller adresse (bokføringsforskriften § 5-1-1).', 'orgnr');
    } else {
      add(warnings, 'address', 'Kundens adresse mangler i ProTop. PowerOffice bruker adressen i sitt kunderegister. Legg den inn på kunden her også.', 'customerAddress');
    }
  }

  // Forfall: valgt betalingsfrist kan ikke være før valgt fakturadato.
  const due = parseDate(row.dueDate);
  const date = parseDate(row.invoiceDate);
  if (!credit && row.dueDateSet && row.invoiceDateSet && due && date && due < date) {
    add(blocking, 'dueDate', 'Betalingsfristen er før fakturadatoen.', 'dueDate');
  }

  // Levering: uten periode står fakturadatoen som leveringsdato på PDF og EHF.
  if (!credit && deliveryDateOf(row).fromInvoiceDate) {
    add(warnings, 'period', 'Leveringsperioden mangler. Fakturadatoen står som leveringsdato på fakturaen.', 'lines');
  }

  // Omvendt avgiftsplikt (mval. § 11-1): bare salg til næringsdrivende. Kjøpers org.nr. skal stå
  // på fakturaen, og selgeren må være mva-registrert. Påskriften settes på PDF og EHF.
  const reverse = hasReverseCharge(lines);
  if (reverse && text(row.orgnr).replace(/\D/g, '').length !== 9) {
    add(blocking, 'reverseBuyer', 'Omvendt avgiftsplikt gjelder bare salg til næringsdrivende. Kunden må ha org.nr. (9 siffer).', 'orgnr');
  }

  // Selger: navn, adresse, org.nr. og mva-registrering.
  if (mode === 'protop' && supplier) {
    const digits = text(supplier.orgnr).replace(/\D/g, '');
    if (!text(supplier.name)) add(blocking, 'supplierName', 'Bedriftens navn mangler.', 'supplier');
    if (!digits) add(blocking, 'supplierOrgnr', 'Bedriftens org.nr. mangler i selskapsprofilen.', 'supplier');
    else if (digits.length !== 9) add(blocking, 'supplierOrgnr', 'Bedriftens org.nr. må ha 9 siffer.', 'supplier');
    if (!supplierHasAddress(supplier)) {
      add(blocking, 'supplierAddress', 'Bedriftens adresse mangler i selskapsprofilen. Fakturaen skal ha selgers adresse (bokføringsforskriften § 5-1-1). Legg den inn under Selskap.', 'supplier');
    }
    const vatStatus = supplierVatStatus(supplier);
    if (Math.abs(totals.vat) >= 0.005 && vatStatus === false) {
      add(blocking, 'supplierVat', 'Bedriften står ikke i Merverdiavgiftsregisteret, men fakturaen har mva. Bruk en mva-kode uten mva på linjene, eller oppdater registreringen under Selskap.', 'supplier');
    } else if (Math.abs(totals.vat) >= 0.005 && vatStatus === null) {
      // Eldre selskaper har ikke hentet registreringen. Fakturaen merkes «MVA» som før,
      // men brukeren bes bekrefte, så merkingen stemmer med Merverdiavgiftsregisteret.
      add(warnings, 'supplierVat', 'Det er ikke bekreftet at bedriften står i Merverdiavgiftsregisteret. Org.nr. merkes «MVA» fordi fakturaen har mva. Trykk «Hent på nytt fra Brønnøysund» under Selskap for å bekrefte.', 'supplier');
    }
    if (reverse && vatStatus === false) {
      add(blocking, 'reverseSupplier', 'Omvendt avgiftsplikt krever at bedriften står i Merverdiavgiftsregisteret. Bruk en annen mva-kode, eller oppdater registreringen under Selskap.', 'supplier');
    } else if (reverse && vatStatus === null && Math.abs(totals.vat) < 0.005) {
      add(warnings, 'reverseSupplier', 'Det er ikke bekreftet at bedriften står i Merverdiavgiftsregisteret, som omvendt avgiftsplikt krever. Trykk «Hent på nytt fra Brønnøysund» under Selskap for å bekrefte.', 'supplier');
    }
  }
  return { blocking, warnings };
}

/** Feilmelding når påbudt innhold mangler, ellers tom streng. Brukes av issueInvoice. */
export function missingContentError(invoice, options = {}) {
  const { blocking } = invoiceContentChecks(invoice, options);
  if (!blocking.length) return '';
  return `Fakturaen kan ikke ferdigstilles: ${blocking.map((row) => row.text).join(' ')}`;
}
