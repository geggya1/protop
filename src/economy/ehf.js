/**
 * EHF / Peppol BIS Billing 3.0 — generer UBL Invoice 2.1 XML.
 * Sending via Access Point er utenfor scope; XML kan lastes ned / valideres.
 * Ref: https://anskaffelser.dev/postaward/g3/spec/current/billing-3.0/norway/
 */

import { invoiceVatTotals, vatCodeById } from './vat.js';
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
export function supplierFromCompany(company, fallbackName = '') {
  const addr = company?.forretning;
  const street = Array.isArray(addr?.lines) && addr.lines.length
    ? addr.lines.filter(Boolean).join(', ')
    : text(addr?.label || company?.addressLabel);
  return {
    name: text(company?.navn) || text(fallbackName) || 'Selskap',
    orgnr: text(company?.organisasjonsnummer),
    address: street,
    city: text(addr?.poststed),
    postalCode: text(addr?.postnummer),
    bankAccount: text(company?.bankAccount || company?.kontonummer),
  };
}

function money(n) {
  const v = Number(n) || 0;
  return v.toFixed(2);
}

/**
 * @param {object} invoice
 * @param {{ supplier?: object }} opts supplier: { name, orgnr, address, city, postalCode, country, iban, bankAccount }
 */
export function buildEhfXml(invoice, { supplier = {} } = {}) {
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const totals = lines.length
    ? invoiceVatTotals(lines)
    : {
      amountExVat: Number(invoice.amountExVat) || 0,
      vat: Number(invoice.vat) || 0,
      amountInclVat: Number(invoice.amountInclVat) || 0,
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
  const invoiceId = text(invoice.invoiceNumber) || text(invoice.id) || 'UTKAST';
  const issueDate = text(invoice.invoiceDate) || new Date().toISOString().slice(0, 10);
  const dueDate = text(invoice.dueDate) || issueDate;
  const currency = text(invoice.currency) || 'NOK';
  const kid = text(invoice.kid);
  const account = text(invoice.bankAccount || supplier.bankAccount || supplier.iban);

  if (!supplierOrgnr || supplierOrgnr.length !== 9) {
    return { ok: false, error: 'Selger må ha gyldig org.nr (9 siffer) for EHF.', xml: '' };
  }
  if (!text(supplier.name)) {
    return { ok: false, error: 'Selgernavn mangler for EHF.', xml: '' };
  }
  if (!text(invoice.customerName)) {
    return { ok: false, error: 'Kundenavn mangler for EHF.', xml: '' };
  }
  if (!lines.length && !(totals.amountInclVat > 0)) {
    return { ok: false, error: 'Faktura mangler linjer/beløp for EHF.', xml: '' };
  }

  const taxSubtotals = (totals.groups || []).map((g) => {
    const cat = g.category || vatCodeById(g.vatCode)?.category || 'S';
    return `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${esc(currency)}">${money(g.taxableAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${esc(currency)}">${money(g.vatAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${esc(cat)}</cbc:ID>
        <cbc:Percent>${money(g.vatPercent)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
  }).join('');

  const invoiceLines = (lines.length ? lines : [{
    id: '1',
    description: text(invoice.notes) || 'Tjenester',
    quantity: 1,
    unit: 'NAR',
    unitPrice: totals.amountExVat,
    amountExVat: totals.amountExVat,
    vatAmount: totals.vat,
    vatPercent: totals.groups?.[0]?.vatPercent ?? 25,
    vatCode: totals.groups?.[0]?.vatCode || 'HIGH',
  }]).map((line, index) => {
    const cat = vatCodeById(line.vatCode)?.category || 'S';
    const unit = line.unit === 't' ? 'HUR' : (line.unit || 'NAR');
    return `
  <cac:InvoiceLine>
    <cbc:ID>${esc(line.id || String(index + 1))}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(unit)}">${money(line.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(line.amountExVat)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(line.description || 'Linje')}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${esc(cat)}</cbc:ID>
        <cbc:Percent>${money(line.vatPercent)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${esc(currency)}">${money(line.unitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }).join('');

  const customerParty = customerOrgnr.length === 9
    ? `
      <cac:PartyIdentification>
        <cbc:ID schemeID="0192">${esc(customerOrgnr)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(invoice.customerName)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${esc(customerOrgnr)}</cbc:CompanyID>
      </cac:PartyLegalEntity>`
    : `
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(invoice.customerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(invoiceId)}</cbc:ID>
  <cbc:IssueDate>${esc(issueDate)}</cbc:IssueDate>
  <cbc:DueDate>${esc(dueDate)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${esc(currency)}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="0192">${esc(supplierOrgnr)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${esc(supplier.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(supplier.address || '')}</cbc:StreetName>
        <cbc:CityName>${esc(supplier.city || '')}</cbc:CityName>
        <cbc:PostalZone>${esc(supplier.postalCode || '')}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(supplier.name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${esc(supplierOrgnr)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(invoice.customerName)}</cbc:Name></cac:PartyName>
      ${customerParty}
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    ${kid ? `<cbc:PaymentID>${esc(kid)}</cbc:PaymentID>` : ''}
    ${account ? `<cac:PayeeFinancialAccount><cbc:ID>${esc(account)}</cbc:ID></cac:PayeeFinancialAccount>` : ''}
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${esc(currency)}">${money(totals.vat)}</cbc:TaxAmount>
    ${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(totals.amountExVat)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${esc(currency)}">${money(totals.amountExVat)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(currency)}">${money(totals.amountInclVat)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${esc(currency)}">${money(totals.amountInclVat)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${invoiceLines}
</Invoice>
`;

  return { ok: true, error: null, xml: xml.trim() };
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
