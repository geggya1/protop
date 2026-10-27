/**
 * EHF / Peppol BIS Billing 3.0 — UBL Invoice og CreditNote 2.1.
 * Sendingen går via et aksesspunkt (Cloud Function sendInvoiceEhf) eller PowerOffice.
 * Ref: https://anskaffelser.dev/postaward/g3/spec/current/billing-3.0/norway/
 */

import { vatCodeById } from './vat.js';
import { totalsFromLines } from './invoiceLines.js';
import { text } from './invoices.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function orgDigits(orgnr) {
  return String(orgnr || '').replace(/\D/g, '').slice(0, 9);
}

/**
 * Map family.company → EHF/faktura-leverandørfelt.
 * Bedriften lagrer adresse som `forretning` (ikke Brreg-råfeltet forretningsadresse).
 */
const FORETAK_FORMS = new Set(['AS', 'ASA', 'ANS', 'DA', 'SA', 'BA', 'KS', 'NUF', 'SE', 'PRE', 'SF']);

function flag(value) {
  if (value === true || value === false) return value;
  return null;
}

export function supplierFromCompany(company, fallbackName = '') {
  const addr = company?.forretning;
  const street = Array.isArray(addr?.lines) && addr.lines.length
    ? addr.lines.filter(Boolean).join(', ')
    : text(addr?.label || company?.addressLabel);
  const form = text(company?.organisasjonsformKode || company?.organisasjonsform?.kode || company?.organisasjonsform).toUpperCase();
  const foretak = flag(company?.foretak) ?? flag(company?.registrertIForetaksregisteret) ?? FORETAK_FORMS.has(form);
  // Bedrifter som fakturerer med mva er mva-registrert. Står det eksplisitt nei, følges det.
  const vat = flag(company?.mva) ?? flag(company?.registrertIMvaregisteret) ?? flag(company?.vatRegistered) ?? true;
  return {
    name: text(company?.navn) || text(fallbackName) || 'Selskap',
    orgnr: text(company?.organisasjonsnummer).replace(/\s/g, ''),
    address: street,
    city: text(addr?.poststed),
    postalCode: text(addr?.postnummer),
    country: 'NO',
    bankAccount: text(company?.bankAccount || company?.kontonummer),
    bankName: text(company?.bankName || company?.bank),
    iban: text(company?.iban),
    bic: text(company?.bic || company?.swift),
    email: text(company?.invoiceEmail || company?.epostadresse),
    phone: text(company?.telefon || company?.mobil),
    website: text(company?.hjemmeside),
    vatRegistered: vat,
    inForetaksregisteret: foretak,
  };
}

/** «NO 916 538 804 MVA» og «Foretaksregisteret» slik bokføringsforskriften og foretaksregisterloven krever. */
export function supplierLegalLine(supplier = {}) {
  const digits = text(supplier.orgnr).replace(/\D/g, '');
  const pretty = digits.length === 9 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : digits;
  const parts = [];
  if (supplier.inForetaksregisteret) parts.push('Foretaksregisteret');
  if (pretty) parts.push(`NO ${pretty}${supplier.vatRegistered ? ' MVA' : ''}`);
  return parts.join(' ');
}

function money(n) {
  const v = Number(n) || 0;
  return v.toFixed(2);
}

function quantityText(n) {
  const v = Number(n) || 0;
  return String(Math.round(v * 10000) / 10000);
}

const UNIT_CODES = { t: 'HUR', time: 'HUR', timer: 'HUR', stk: 'EA', km: 'KMT', mnd: 'MON', dag: 'DAY' };

function unitCode(unit) {
  return UNIT_CODES[text(unit).toLowerCase()] || 'EA';
}

function taxCategory(vatCode, percent) {
  const known = vatCodeById(vatCode);
  if (known?.category) return known.category;
  return Number(percent) > 0 ? 'S' : 'Z';
}

const EXEMPTION_REASONS = {
  E: 'Fritatt for merverdiavgift',
  O: 'Utenfor merverdiavgiftsloven',
};

function categoryXml(cat, percent) {
  const reason = EXEMPTION_REASONS[cat];
  return `<cbc:ID>${esc(cat)}</cbc:ID>${cat === 'O' ? '' : `
        <cbc:Percent>${money(percent)}</cbc:Percent>`}${reason ? `
        <cbc:TaxExemptionReason>${esc(reason)}</cbc:TaxExemptionReason>` : ''}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`;
}

function lineTotals(line) {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unitPrice) || 0;
  const base = Math.round(Math.abs(qty * price) * 100) / 100;
  const ext = Math.abs(Number(line.amountExVat ?? base) || 0);
  const markup = Number(line.markupPercent) || 0;
  const discount = Number(line.discountPercent) || 0;
  const charge = markup ? Math.round(base * (markup / 100) * 100) / 100 : 0;
  const allowance = discount ? Math.round((base + charge) * (discount / 100) * 100) / 100 : 0;
  // Speilede beløp (kreditnota) kan avvike i øre. Da justeres prisen, så linjen går opp.
  const calculated = Math.round((base + charge - allowance) * 100) / 100;
  const fits = Math.abs(calculated - ext) < 0.005;
  return {
    qty: Math.abs(qty) || 1,
    price: fits ? price : (Math.abs(qty) ? Math.round((ext / Math.abs(qty)) * 10000) / 10000 : ext),
    ext,
    charge: fits ? charge : 0,
    allowance: fits ? allowance : 0,
  };
}

function party({ endpoint, name, address = {}, vatId = '', legalName = '', companyId = '', legalForm = '', contact = {} }) {
  const contactXml = contact.name || contact.phone || contact.email
    ? `
      <cac:Contact>${contact.name ? `
        <cbc:Name>${esc(contact.name)}</cbc:Name>` : ''}${contact.phone ? `
        <cbc:Telephone>${esc(contact.phone)}</cbc:Telephone>` : ''}${contact.email ? `
        <cbc:ElectronicMail>${esc(contact.email)}</cbc:ElectronicMail>` : ''}
      </cac:Contact>`
    : '';
  return `
    <cac:Party>${endpoint ? `
      <cbc:EndpointID schemeID="0192">${esc(endpoint)}</cbc:EndpointID>` : ''}
      <cac:PartyName><cbc:Name>${esc(name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>${address.street ? `
        <cbc:StreetName>${esc(address.street)}</cbc:StreetName>` : ''}${address.city ? `
        <cbc:CityName>${esc(address.city)}</cbc:CityName>` : ''}${address.postalCode ? `
        <cbc:PostalZone>${esc(address.postalCode)}</cbc:PostalZone>` : ''}
        <cac:Country><cbc:IdentificationCode>${esc(address.country || 'NO')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${vatId ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(vatId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(legalName || name)}</cbc:RegistrationName>${companyId ? `
        <cbc:CompanyID schemeID="0192">${esc(companyId)}</cbc:CompanyID>` : ''}${legalForm ? `
        <cbc:CompanyLegalForm>${esc(legalForm)}</cbc:CompanyLegalForm>` : ''}
      </cac:PartyLegalEntity>${contactXml}
    </cac:Party>`;
}

function mimeOf(name, mime) {
  const known = text(mime).toLowerCase();
  if (['application/pdf', 'image/png', 'image/jpeg', 'text/csv'].includes(known)) return known;
  const lower = text(name).toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.csv')) return 'text/csv';
  return 'application/pdf';
}

/**
 * EHF (Peppol BIS Billing 3.0) som UBL Invoice eller CreditNote.
 * Kreditnota sendes som CreditNote med positive beløp og henvisning til fakturaen.
 * attachments: [{ name, mime, base64, description }] legges inn i fila (AdditionalDocumentReference).
 * @param {object} invoice
 * @param {{ supplier?: object, attachments?: object[] }} opts
 */
export function buildEhfXml(invoice, { supplier = {}, attachments = [] } = {}) {
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const totals = lines.length
    ? totalsFromLines(lines)
    : {
      amountExVat: Number(invoice.amountExVat) || 0,
      vat: Number(invoice.vat) || 0,
      amountInclVat: Number(invoice.amountInclVat) || 0,
      rounding: 0,
      totalDue: Number(invoice.amountInclVat) || 0,
      groups: [{
        vatCode: invoice.vatCode || 'HIGH',
        vatPercent: 25,
        category: 'S',
        taxableAmount: Number(invoice.amountExVat) || 0,
        vatAmount: Number(invoice.vat) || 0,
      }],
    };

  const supplierOrgnr = orgDigits(supplier.orgnr);
  const customerOrgnr = orgDigits(invoice.orgnr);
  const credit = invoice.kind === 'credit_note' || !!text(invoice.creditNoteForId) || totals.amountInclVat < 0;
  const invoiceId = text(invoice.invoiceNumber) || text(invoice.id) || 'UTKAST';
  const issueDate = text(invoice.invoiceDate) || new Date().toISOString().slice(0, 10);
  const dueDate = text(invoice.dueDate) || issueDate;
  const currency = text(invoice.currency) || 'NOK';
  const kid = text(invoice.kid);
  const account = text(invoice.bankAccount || supplier.bankAccount || supplier.iban).replace(/[\s.]/g, '');
  const sign = credit ? -1 : 1;
  const abs = (value) => Math.abs(Number(value) || 0);

  if (!supplierOrgnr || supplierOrgnr.length !== 9) {
    return { ok: false, error: 'Selger må ha gyldig org.nr (9 siffer) for EHF.', xml: '' };
  }
  if (!text(supplier.name)) {
    return { ok: false, error: 'Selgernavn mangler for EHF.', xml: '' };
  }
  if (!text(invoice.customerName)) {
    return { ok: false, error: 'Kundenavn mangler for EHF.', xml: '' };
  }
  if (!lines.length && !(abs(totals.amountInclVat) > 0)) {
    return { ok: false, error: 'Faktura mangler linjer/beløp for EHF.', xml: '' };
  }

  const taxSubtotals = (totals.groups || []).map((g) => {
    const cat = g.category || taxCategory(g.vatCode, g.vatPercent);
    return `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${esc(currency)}">${money(abs(g.taxableAmount))}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${esc(currency)}">${money(abs(g.vatAmount))}</cbc:TaxAmount>
      <cac:TaxCategory>
        ${categoryXml(cat, g.vatPercent)}
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
  }).join('');

  const sourceLines = lines.length ? lines : [{
    id: '1',
    description: text(invoice.notes) || 'Tjenester',
    quantity: sign,
    unit: 'stk',
    unitPrice: abs(totals.amountExVat),
    amountExVat: totals.amountExVat,
    vatCode: invoice.vatCode || 'HIGH',
    vatPercent: 25,
  }];
  const lineTag = credit ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyTag = credit ? 'CreditedQuantity' : 'InvoicedQuantity';
  const docLines = sourceLines.map((line, index) => {
    const t = lineTotals(line);
    const percent = Number(line.vatPercent ?? vatCodeById(line.vatCode)?.percent ?? 25);
    const cat = taxCategory(line.vatCode, percent);
    const period = text(line.periodStart) || text(line.periodEnd)
      ? `
    <cac:InvoicePeriod>${text(line.periodStart) ? `
      <cbc:StartDate>${esc(line.periodStart)}</cbc:StartDate>` : ''}${text(line.periodEnd) ? `
      <cbc:EndDate>${esc(line.periodEnd)}</cbc:EndDate>` : ''}
    </cac:InvoicePeriod>`
      : '';
    const charges = [
      t.charge ? `
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason>Påslag ${esc(String(line.markupPercent).replace('.', ','))} %</cbc:AllowanceChargeReason>
      <cbc:Amount currencyID="${esc(currency)}">${money(t.charge)}</cbc:Amount>
    </cac:AllowanceCharge>` : '',
      t.allowance ? `
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason>Rabatt ${esc(String(line.discountPercent).replace('.', ','))} %</cbc:AllowanceChargeReason>
      <cbc:Amount currencyID="${esc(currency)}">${money(t.allowance)}</cbc:Amount>
    </cac:AllowanceCharge>` : '',
    ].join('');
    const accountRef = text(line.account) ? `
    <cbc:AccountingCost>${esc(line.account)}</cbc:AccountingCost>` : '';
    return `
  <cac:${lineTag}>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:${qtyTag} unitCode="${unitCode(line.unit)}">${quantityText(t.qty)}</cbc:${qtyTag}>
    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(t.ext)}</cbc:LineExtensionAmount>${accountRef}${period}${charges}
    <cac:Item>
      <cbc:Name>${esc(text(line.description).slice(0, 200) || 'Linje')}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        ${categoryXml(cat, percent)}
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${esc(currency)}">${t.price}</cbc:PriceAmount>
    </cac:Price>
  </cac:${lineTag}>`;
  }).join('');

  const lineSum = Math.round(sourceLines.reduce((sum, line) => sum + lineTotals(line).ext, 0) * 100) / 100;
  const rounding = abs(totals.rounding) >= 0.005 ? Number(totals.rounding) * sign : 0;
  const buyerReference = text(invoice.customerReference)
    || (text(invoice.orderReference) ? '' : text(invoice.customerContact) || text(invoice.projectNumber) || invoiceId);
  const addr = invoice.customerAddress || {};
  const vatOutside = (totals.groups || []).some((g) => (g.category || taxCategory(g.vatCode, g.vatPercent)) === 'O');
  const supplierVat = supplier.vatRegistered !== false && !vatOutside ? `NO${supplierOrgnr}MVA` : '';
  const notes = [text(invoice.invoiceText), credit && text(invoice.creditReason) ? `Årsak: ${text(invoice.creditReason)}` : '']
    .filter(Boolean)
    .map((note) => `
  <cbc:Note>${esc(note.slice(0, 1000))}</cbc:Note>`)
    .join('');
  const docRefs = (attachments || []).filter((row) => row?.base64).map((row, index) => `
  <cac:AdditionalDocumentReference>
    <cbc:ID>${esc(text(row.id) || `Vedlegg-${index + 1}`)}</cbc:ID>${row.description ? `
    <cbc:DocumentDescription>${esc(row.description)}</cbc:DocumentDescription>` : ''}
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="${esc(mimeOf(row.name, row.mime))}" filename="${esc(text(row.name) || `vedlegg-${index + 1}.pdf`)}">${row.base64}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>`).join('');
  const root = credit ? 'CreditNote' : 'Invoice';
  const ns = credit
    ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
    : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${ns}"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(invoiceId)}</cbc:ID>
  <cbc:IssueDate>${esc(issueDate)}</cbc:IssueDate>${credit ? '' : `
  <cbc:DueDate>${esc(dueDate)}</cbc:DueDate>`}
  <cbc:${credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${credit ? '381' : '380'}</cbc:${credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${notes}
  <cbc:DocumentCurrencyCode>${esc(currency)}</cbc:DocumentCurrencyCode>${buyerReference ? `
  <cbc:BuyerReference>${esc(buyerReference)}</cbc:BuyerReference>` : ''}${text(invoice.periodStart) || text(invoice.periodEnd) ? `
  <cac:InvoicePeriod>${text(invoice.periodStart) ? `
    <cbc:StartDate>${esc(invoice.periodStart)}</cbc:StartDate>` : ''}${text(invoice.periodEnd) ? `
    <cbc:EndDate>${esc(invoice.periodEnd)}</cbc:EndDate>` : ''}
  </cac:InvoicePeriod>` : ''}${text(invoice.orderReference) ? `
  <cac:OrderReference><cbc:ID>${esc(invoice.orderReference)}</cbc:ID></cac:OrderReference>` : ''}${credit && text(invoice.creditNoteForNumber) ? `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${esc(invoice.creditNoteForNumber)}</cbc:ID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>` : ''}${text(invoice.contractReference) ? `
  <cac:ContractDocumentReference><cbc:ID>${esc(invoice.contractReference)}</cbc:ID></cac:ContractDocumentReference>` : ''}${docRefs}${!credit && text(invoice.projectNumber) ? `
  <cac:ProjectReference><cbc:ID>${esc(invoice.externalProjectNumber || invoice.projectNumber)}</cbc:ID></cac:ProjectReference>` : ''}
  <cac:AccountingSupplierParty>${party({
    endpoint: supplierOrgnr,
    name: supplier.name,
    address: { street: supplier.address, city: supplier.city, postalCode: supplier.postalCode, country: supplier.country || 'NO' },
    vatId: supplierVat,
    companyId: supplierOrgnr,
    legalForm: supplier.inForetaksregisteret ? 'Foretaksregisteret' : '',
    contact: { name: invoice.ourReference, phone: supplier.phone, email: supplier.email },
  })}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${party({
    endpoint: customerOrgnr,
    name: invoice.customerName,
    address: { street: addr.street, city: addr.city, postalCode: addr.postalCode, country: addr.country || 'NO' },
    vatId: text(invoice.customerVatNumber),
    companyId: customerOrgnr,
    contact: { name: invoice.customerContact, email: invoice.customerEmail },
  })}
  </cac:AccountingCustomerParty>${text(invoice.periodEnd) ? `
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${esc(invoice.periodEnd)}</cbc:ActualDeliveryDate>
  </cac:Delivery>` : ''}${credit ? '' : `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>${kid ? `
    <cbc:PaymentID>${esc(kid)}</cbc:PaymentID>` : ''}${account ? `
    <cac:PayeeFinancialAccount><cbc:ID>${esc(account)}</cbc:ID></cac:PayeeFinancialAccount>` : ''}
  </cac:PaymentMeans>`}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${esc(currency)}">${money(abs(totals.vat))}</cbc:TaxAmount>${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(lineSum)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${esc(currency)}">${money(abs(totals.amountExVat))}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(currency)}">${money(abs(totals.amountInclVat))}</cbc:TaxInclusiveAmount>${rounding ? `
    <cbc:PayableRoundingAmount currencyID="${esc(currency)}">${money(rounding)}</cbc:PayableRoundingAmount>` : ''}
    <cbc:PayableAmount currencyID="${esc(currency)}">${money(abs(totals.amountInclVat) + rounding)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${docLines}
</${root}>
`;

  return { ok: true, error: null, xml: xml.trim() };
}

/**
 * Det som må være på plass før EHF kan sendes. Mottakeren må ha org.nr. (elektronisk adresse i ELMA).
 */
export function ehfReadiness(invoice, supplier = {}) {
  const blocking = [];
  const warnings = [];
  if (orgDigits(supplier.orgnr).length !== 9) blocking.push('Bedriften mangler gyldig org.nr.');
  if (orgDigits(invoice?.orgnr).length !== 9) blocking.push('Kunden mangler org.nr. EHF sendes til kundens org.nr.');
  if (!text(invoice?.invoiceNumber)) blocking.push('Fakturaen er ikke ferdigstilt.');
  if (!text(invoice?.customerReference) && !text(invoice?.orderReference)) {
    warnings.push('«Deres referanse» eller bestillingsnummer mangler. Mange offentlige mottakere avviser EHF uten.');
  }
  return { ok: !blocking.length, blocking, warnings };
}

export function validateEhfBasics(invoice, supplier = {}) {
  const result = buildEhfXml(invoice, { supplier });
  if (!result.ok) return result;
  const checks = [];
  if (!result.xml.includes('CustomizationID')) checks.push('Mangler CustomizationID');
  if (!result.xml.includes('InvoiceLine')) checks.push('Mangler InvoiceLine');
  if (!result.xml.includes('TaxTotal')) checks.push('Mangler TaxTotal');
  if (checks.length) return { ok: false, error: checks.join('; '), xml: result.xml };
  return result;
}
