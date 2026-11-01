/**
 * Endringsloggen slik den vises på fakturasiden.
 *
 * Hendelsene i invoice.events er kilden. Ferdigstilling, sendinger og betalinger står også
 * i egne felt (issuedAt, deliveries, payments, sentAt). Mangler hendelsen for noe av det
 * (eldre fakturaer, PowerOffice, import eller en lagring som mistet hendelsen), lages en rad
 * fra feltet, så loggen alltid viser at fakturaen ble ferdigstilt, sendt og betalt.
 * Ingenting her lagres. Raden er bare visning.
 */

const CHANNEL_LABELS = { email: 'e-post', ehf: 'EHF', manual: 'egen sending', poweroffice: 'PowerOffice' };

function text(value) {
  return String(value ?? '').trim();
}

function time(iso) {
  const ms = Date.parse(text(iso));
  return Number.isFinite(ms) ? ms : 0;
}

function dayText(iso) {
  const day = text(iso).slice(0, 10);
  const [y, m, d] = day.split('-');
  return y && m && d ? `${d}.${m}.${y}` : day;
}

function money(amount, currency = 'NOK') {
  const value = Number(amount) || 0;
  const shown = value.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${shown} ${currency === 'NOK' || !currency ? 'kr' : currency}`;
}

/** Finnes en hendelse av typen innen to minutter fra tidspunktet? */
function hasNear(events, type, at, used) {
  const target = time(at);
  const hit = events.find((row) => row.type === type && !used.has(row.id)
    && (!target || !time(row.at) || Math.abs(time(row.at) - target) <= 120000));
  if (hit) used.add(hit.id);
  return !!hit;
}

export function invoiceLog(invoice) {
  const events = (Array.isArray(invoice?.events) ? invoice.events : []).filter((row) => row && text(row.text));
  const extra = [];
  const used = new Set();
  const credit = invoice?.kind === 'credit_note';
  const what = credit ? 'kreditnota' : 'faktura';

  if (invoice?.issuedAt && !events.some((row) => row.type === 'issue')) {
    extra.push({
      id: 'log_issue',
      at: invoice.issuedAt,
      type: 'issue',
      text: `ferdigstilte ${what}${invoice.invoiceNumber ? ` ${invoice.invoiceNumber}` : ''}`,
      byName: text(invoice.issuedByName),
    });
  }

  const deliveries = Array.isArray(invoice?.deliveries) ? invoice.deliveries : [];
  deliveries.forEach((row, index) => {
    if (!row || hasNear(events, 'delivery', row.at, used)) return;
    const where = Array.isArray(row.to) && row.to.length ? ` til ${row.to.join(', ')}` : '';
    const channel = CHANNEL_LABELS[row.channel] || text(row.channel) || 'ukjent kanal';
    extra.push({
      id: `log_del_${row.id || index}`,
      at: row.at,
      type: 'delivery',
      text: row.status === 'failed'
        ? `sending via ${channel}${where} feilet${row.message ? `: ${row.message}` : ''}`
        : `sendte via ${channel}${where}`,
      byName: text(row.byName),
    });
  });

  // Sendt uten registrert sending (PowerOffice, import): sentAt er det eneste sporet.
  if (invoice?.sentAt && !deliveries.length && !events.some((row) => row.type === 'delivery')) {
    extra.push({
      id: 'log_sent',
      at: invoice.sentAt,
      type: 'delivery',
      text: `${what}en ble sendt ${dayText(invoice.sentAt)}`,
      byName: '',
    });
  }

  const payments = Array.isArray(invoice?.payments) ? invoice.payments : [];
  payments.forEach((row, index) => {
    if (!row || hasNear(events, 'payment', row.at || row.date, used)) return;
    extra.push({
      id: `log_pay_${row.id || index}`,
      at: row.at || row.date,
      type: 'payment',
      text: `betaling ${money(row.amount, invoice?.currency)}${row.date ? ` (${dayText(row.date)})` : ''}`,
      byName: text(row.byName),
    });
  });

  // Nyeste først. Uten tidspunkt beholdes rekkefølgen hendelsene ble lagt til i.
  return [...events.map((row, index) => ({ row, index })), ...extra.map((row, index) => ({ row, index: events.length + index }))]
    .sort((a, b) => (time(b.row.at) - time(a.row.at)) || (b.index - a.index))
    .map(({ row }) => row);
}
