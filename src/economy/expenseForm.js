/**
 * Skjemaet «Nytt utlegg»: prosjektvelgeren og utfylling fra en tolket kvittering.
 */
import { projectPhaseOf } from '../project/statusFilter.js';
import { EXPENSE_CATEGORIES } from './expenses.js';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function projectLabel(row) {
  return [row.number ? `#${row.number}` : '', row.name].filter(Boolean).join(' ') || 'Uten navn';
}

/**
 * Prosjektene i velgeren. Uten søk står den ansattes aktive prosjekter øverst (deltaker,
 * prosjektleder eller timer ført), så andre aktive, så avsluttede. Søket treffer alle.
 * Arkiverte vises ikke, med mindre utlegget allerede står på et (keepId).
 */
export function expenseProjectOptions(projects = [], { mineIds = new Set(), keepId = '' } = {}) {
  const mine = mineIds instanceof Set ? mineIds : new Set(mineIds || []);
  const rows = (projects || [])
    .filter((row) => row?.id && (row.status !== 'arkivert' || row.id === keepId))
    .map((row) => {
      const closed = row.status === 'arkivert' || row.status === 'avsluttet' || projectPhaseOf(row) === 'avsluttet';
      const rank = closed ? 2 : (mine.has(row.id) ? 0 : 1);
      return {
        rank,
        option: {
          id: row.id,
          label: projectLabel(row),
          hint: text(row.client || row.customerName),
          group: ['Dine aktive prosjekter', 'Andre aktive prosjekter', 'Avsluttede prosjekter'][rank],
          keywords: [text(row.number), text(row.client || row.customerName)].filter(Boolean),
        },
      };
    });
  rows.sort((a, b) => a.rank - b.rank || a.option.label.localeCompare(b.option.label, 'nb', { numeric: true }));
  return rows.map((row) => row.option);
}

const VAT_BY_PERCENT = { 25: 'HIGH', 15: 'MID', 12: 'LOW' };

/** Mva-kode fra satsen på kvitteringen. 0 % er fritatt (som bompenger). Ukjent: null. */
export function receiptVatCode(percent) {
  const n = Number(percent);
  if (percent == null || percent === '' || !Number.isFinite(n)) return null;
  if (n === 0) return 'EXEMPT';
  const near = Object.keys(VAT_BY_PERCENT).map(Number).find((rate) => Math.abs(rate - n) < 0.6);
  return near ? VAT_BY_PERCENT[near] : null;
}

const CATEGORY_WORDS = [
  ['parking', /parker/],
  ['toll', /bom|toll|ferje|ferry/],
  ['travel', /reise|hotell|fly|tog|buss|taxi|drosje|overnatting/],
  ['office', /kontor|rekvisita|papir/],
  ['tools', /verkt|utstyr|maskin/],
  ['materials', /bygg|materi|jernvare|trelast|el-?artikl|rør/],
];

function categoryFrom(value) {
  const key = text(value).toLowerCase();
  if (!key) return '';
  const hit = CATEGORY_WORDS.find(([, re]) => re.test(key));
  return hit && EXPENSE_CATEGORIES.some((row) => row.id === hit[0]) ? hit[0] : '';
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function money(value) {
  const [whole, frac] = Math.abs(Number(value) || 0).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${frac} kr`;
}

function norDate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
}

/**
 * Felt fra en tolket kvittering (aiReceiptOcr) inn i utlegget. Bare tomme felt fylles,
 * og datoen når den fortsatt er dagens dato. Beløpet på kvitteringen er inkl. mva.
 * Gir { patch, summary, filled }.
 */
export function expensePatchFromReceipt(draft = {}, bilag = {}, { today = '' } = {}) {
  const patch = {};
  const filled = [];
  const supplier = text(bilag.supplier);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text(bilag.date)) ? text(bilag.date) : '';
  const amount = Number(bilag.amount);
  const vat = Number(bilag.vatAmount);
  const hasAmount = bilag.amount != null && Number.isFinite(amount) && amount > 0;
  const hasVat = bilag.vatAmount != null && Number.isFinite(vat) && vat >= 0 && vat < amount;

  if (supplier && !text(draft.vendor)) patch.vendor = supplier;
  if (date && (!text(draft.date) || text(draft.date) === today)) {
    patch.date = date;
    filled.push('dato');
  }
  const currentAmount = Number(String(draft.amountExVat ?? '').replace(',', '.'));
  if (hasAmount && !(Number.isFinite(currentAmount) && currentAmount > 0)) {
    let percent = bilag.vatPercent;
    if ((percent == null || percent === '') && hasVat && amount > vat) percent = round2((vat / (amount - vat)) * 100);
    const code = receiptVatCode(percent);
    if (code) patch.vatCode = code;
    const net = hasVat ? amount - vat : (code ? amount / (1 + (Number(percent) || 0) / 100) : amount / 1.25);
    patch.amountExVat = String(round2(net));
    filled.push('beløp');
  }
  if (!text(draft.description)) {
    const title = text(bilag.suggestedTitle) || supplier;
    if (title) {
      patch.description = title.slice(0, 120);
      filled.push('beskrivelse');
    }
  }
  if ((draft.category || 'other') === 'other') {
    const category = categoryFrom(`${bilag.category || ''} ${bilag.suggestedTitle || ''}`);
    if (category) {
      patch.category = category;
      filled.push('kategori');
    }
  }
  const facts = [
    supplier,
    norDate(date),
    hasAmount ? `${money(amount)} inkl. mva${hasVat ? ` (mva ${money(vat)})` : ''}` : '',
  ].filter(Boolean);
  const summary = facts.length
    ? `Lest fra kvitteringen: ${facts.join(', ')}.${filled.length ? ` Fylt inn: ${filled.join(', ')}. Sjekk før du lagrer.` : ''}`
    : 'Fant ikke beløp, dato eller leverandør på kvitteringen. Fyll inn selv.';
  return { patch, summary, filled };
}
