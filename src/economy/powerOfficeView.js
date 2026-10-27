/**
 * Visning av PowerOffice-status på fakturaer og i innstillingene.
 * Dataene skrives av serveren (functions/powerOfficeMap.js).
 */
import { VAT_CODES } from './vat.js';
import { formatDate, formatMoney } from './invoices.js';

export const POWEROFFICE_GUI = {
  demo: 'https://godemo.poweroffice.net/',
  prod: 'https://go.poweroffice.net/',
};

/** Én rad per MVA-sats. Produktet i Go styrer salgskonto og MVA. */
export const POWEROFFICE_VAT_ROWS = VAT_CODES.map((row) => ({
  id: row.id,
  label: `${row.label} (${row.percent} %)`,
}));

const DELIVERY_LABELS = {
  EHF: 'EHF',
  PdfByEmail: 'E-post (PDF)',
  Print: 'Papir',
  Efaktura: 'eFaktura',
  AvtaleGiro: 'AvtaleGiro',
  External: 'Eksternt',
  Factoring: 'Factoring',
};

export function deliveryTypeLabel(type) {
  const key = String(type || '');
  return DELIVERY_LABELS[key] || key;
}

/**
 * Produksjon er det vanlige og får ingen merkelapp. En testklient (PowerOffice sitt
 * demomiljø) merkes tydelig, så ingen tror testfakturaer er ekte.
 */
export function envTag(env) {
  return env === 'demo' ? 'Testklient' : '';
}

export function syncLabel(lastSyncAt) {
  const at = new Date(lastSyncAt || '');
  if (!lastSyncAt || Number.isNaN(at.getTime())) return 'ikke synket ennå';
  return `sist synket ${at.toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}`;
}

export function syncCountsText(counts) {
  if (!counts) return '';
  const parts = [];
  if (counts.sent) parts.push(`${counts.sent} sendt`);
  if (counts.paid) parts.push(`${counts.paid} betalt`);
  if (counts.merged) parts.push(`${counts.merged} slått sammen`);
  if (counts.missing) parts.push(`${counts.missing} ikke funnet`);
  return parts.length ? parts.join(', ') : 'ingen endringer';
}

function isDraft(invoice) {
  return invoice?.status === 'draft' || /utkast|draft/i.test(String(invoice?.exportStatus || ''));
}

/** Kan overføres: utkast som ikke er sendt, og som ikke ligger i Go fra før. */
export function canTransferToPowerOffice(invoice, status) {
  if (!status?.connected || !isDraft(invoice) || invoice?.sentAt) return false;
  const po = invoice?.poweroffice || {};
  return !po.salesOrderId || po.state === 'missing';
}

/** Tekst om fakturaen i PowerOffice, eller null når den ikke er overført. */
export function powerOfficeSummary(invoice) {
  const po = invoice?.poweroffice;
  if (!po?.state) return null;
  const env = po.env === 'demo' ? ' (testklient)' : '';
  if (po.state === 'draft') {
    return {
      tone: 'info',
      title: `Overført til PowerOffice${env}`,
      lines: [
        `Utkast${po.orderNo ? ` nr. ${po.orderNo}` : ''} venter på kontroll og sending i PowerOffice Go.`,
        po.mergedFrom ? 'Utkastet er slått sammen med et annet utkast i PowerOffice.' : '',
        `Overført ${formatDate(po.transferredAt)}.`,
        'Skal det slettes: slett utkastet i PowerOffice først, og synk.',
      ].filter(Boolean),
    };
  }
  if (po.state === 'missing') {
    return {
      tone: 'warn',
      title: 'Finnes ikke lenger i PowerOffice',
      lines: [
        'Utkastet er slettet i PowerOffice, eller slått sammen uten at vi fant det igjen.',
        'Overfør på nytt bare hvis det ble slettet. Ellers blir kunden fakturert to ganger.',
      ],
    };
  }
  const paid = po.state === 'paid';
  return {
    tone: paid ? 'ok' : 'info',
    title: paid ? `Betalt (PowerOffice${env})` : `Sendt fra PowerOffice${env}`,
    lines: [
      [
        po.invoiceNo ? `Faktura ${po.invoiceNo}` : '',
        po.cid ? `KID ${po.cid}` : '',
        po.deliveryType ? deliveryTypeLabel(po.deliveryType) : '',
        po.sentDateTime ? `sendt ${formatDate(po.sentDateTime)}` : '',
      ].filter(Boolean).join(' · '),
      po.balance != null ? `Restbeløp ${formatMoney(po.balance)}` : '',
      po.mergedFrom ? 'Fakturaen dekker flere utkast som ble slått sammen i PowerOffice.' : '',
    ].filter(Boolean),
  };
}
