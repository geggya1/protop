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
  percent: row.percent,
}));

/** «1 · Timer · konto 3000 · 25 % MVA (kode 3)». MVA vises når PowerOffice oppgir den. */
export function productOptionLabel(product) {
  const parts = [`${product.code} · ${product.name}`];
  if (product.salesAccount) parts.push(`konto ${product.salesAccount}`);
  if (product.vatPercent != null) {
    parts.push(`${product.vatPercent} % MVA${product.vatCode ? ` (kode ${product.vatCode})` : ''}`);
  }
  return parts.join(' · ');
}

/** Valgene for én MVA-rad: produkter med samme sats først. */
export function productOptionsForRow(row, products) {
  const list = Array.isArray(products) ? products : [];
  const matches = (product) => product.vatPercent != null && product.vatPercent === row.percent;
  return [...list.filter(matches), ...list.filter((product) => !matches(product))]
    .map((product) => ({ id: product.code, label: productOptionLabel(product) }));
}

/** Advarsel når valgt produkt gir en annen MVA-sats enn raden. */
export function productVatWarning(row, products, code) {
  if (!code) return '';
  const product = (Array.isArray(products) ? products : []).find((item) => item.code === code);
  if (!product || product.vatPercent == null || product.vatPercent === row.percent) return '';
  return `Produktet gir ${product.vatPercent} % MVA i PowerOffice, ikke ${row.percent} %.`;
}

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

const PROTOP_STATUS = { sent: 'Sendt', paid: 'Betalt', credited: 'Kreditert' };

function dateTimeText(value) {
  const day = String(value || '').slice(0, 10);
  return day ? formatDate(day) : '';
}

/**
 * Rader for oppslaget av én faktura i Go: det Go svarte, og det ProTop ville lagret.
 * Tom liste når fakturaen ikke ble funnet.
 */
export function lookupRows(result) {
  if (!result?.found) return [];
  const go = result.outgoing || {};
  const protop = result.protop || {};
  return [
    ['Fakturanummer', protop.invoiceNumber || go.invoiceNo],
    ['KID', protop.kid || 'Ingen KID'],
    ['Forsendelse', deliveryTypeLabel(go.deliveryType) || 'Ikke oppgitt'],
    ['Sendt', dateTimeText(go.sentDateTime || protop.sentAt)],
    ['Fakturadato', dateTimeText(protop.invoiceDate)],
    ['Forfall', dateTimeText(protop.dueDate)],
    ['Beløp', go.totalAmount == null ? '' : formatMoney(go.totalAmount)],
    ['Restbeløp', go.balance == null ? '' : formatMoney(go.balance)],
    ['Status i ProTop', PROTOP_STATUS[protop.status] || protop.status || ''],
    ['Kundenr. i PowerOffice', go.customerNo],
    ['Lest på id', result.readById ? `Ja (${go.id})` : 'Nei, bare fra søket'],
  ].filter(([, value]) => value !== '' && value != null);
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
  if (counts.sending) parts.push(`${counts.sending} sendes fortsatt`);
  if (counts.failed) parts.push(`${counts.failed} sending feilet`);
  return parts.length ? parts.join(', ') : 'ingen endringer';
}

/** Kan sendes fra ProTop: utkastet ligger i Go og er ikke bedt sendt ennå. */
export function canSendFromPowerOffice(invoice, status) {
  const po = invoice?.poweroffice || {};
  return !!status?.connected && !!po.salesOrderId && po.state === 'draft';
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
      tone: po.sendError ? 'warn' : 'info',
      title: `Overført til PowerOffice${env}`,
      lines: [
        po.sendError ? `Sendingen feilet: ${po.sendError}` : '',
        `Utkast${po.orderNo ? ` nr. ${po.orderNo}` : ''} venter på kontroll og sending i PowerOffice Go.`,
        po.mergedFrom ? 'Utkastet er slått sammen med et annet utkast i PowerOffice.' : '',
        `Overført ${formatDate(po.transferredAt)}.`,
        'Skal det slettes: slett utkastet i PowerOffice først, og synk.',
      ].filter(Boolean),
    };
  }
  if (po.state === 'sending') {
    return {
      tone: 'info',
      title: `Sendes fra PowerOffice${env}`,
      lines: [
        `Bedt sendt ${formatDate(po.sendRequestedAt)}${po.orderNo ? ` (utkast nr. ${po.orderNo})` : ''}.`,
        'Fakturanummer, KID og forsendelse kommer ved neste synk.',
      ],
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
