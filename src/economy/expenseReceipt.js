/**
 * Fra tolket kvittering (aiReceiptOcr) til felt på utlegget.
 * Feltene AI har fylt merkes «Tolket» i registreringen til den ansatte endrer dem.
 * Et felt den ansatte har endret, overskrives ikke av en ny tolkning.
 */
import { EXPENSE_CATEGORIES, expenseCategory } from './expenses.js';
import { roundMoney } from './vat.js';
import { suggestVatTreatment } from './vatTreatment.js';

function text(value) {
  return String(value ?? '').trim();
}

function num(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Feltene registreringen merker «Tolket». */
export const INTERPRETED_FIELDS = [
  'date', 'amountInclVat', 'currency', 'vatCode', 'vatTreatment', 'vendor', 'vendorOrgNr', 'receiptNumber',
  'paymentMethod', 'description', 'purpose', 'category',
];

/** Betalingsmåte fra kvitteringen, som tekst i skjemaet («Kort ****9141»). */
export const PAYMENT_METHODS = [
  { id: 'kort', label: 'Kort' },
  { id: 'vipps', label: 'Vipps' },
  { id: 'kontant', label: 'Kontant' },
  { id: 'faktura', label: 'Faktura' },
  { id: 'annet', label: 'Annet' },
];

/** Utgiftstypene som liste til AI-en: «id: navn». */
export function expenseTypeHint() {
  return EXPENSE_CATEGORIES.filter((row) => row.id !== 'mileage').map((row) => `${row.id}: ${row.label}`).join('; ');
}

/** Mva-sats på kvitteringen → mva-kode. Ukjent sats gir tom streng. */
export function vatCodeForPercent(percent) {
  const p = num(percent);
  if (p == null) return '';
  if (Math.abs(p - 25) < 0.6) return 'HIGH';
  if (Math.abs(p - 15) < 0.6) return 'MID';
  if (Math.abs(p - 12) < 0.6) return 'LOW';
  if (Math.abs(p) < 0.01) return 'EXEMPT';
  return '';
}

// Reserve når AI-en ikke ga en gyldig type: leverandør, kategori og varelinjer mot nøkkelord.
const KEYWORDS = [
  ['fuel', /\b(circle ?k|uno-?x|esso|shell|st1|yx|best|drivstoff|diesel|bensin|blyfri)\b/i],
  ['charging', /\b(lading|ladestasjon|tesla supercharger|mer\b|fortum charge|recharge|kople|ionity|eviny)\b/i],
  ['parking', /\b(parkering|easypark|apcoa|onepark|europark|aimo|q-?park|p-?hus|parkman)\b/i],
  ['toll', /\b(bompenger|autopass|fjellinjen|ferde|bom)\b/i],
  ['taxi', /\b(taxi|drosje|uber|bolt|norgestaxi|oslo taxi)\b/i],
  ['flight', /\b(sas|norwegian|widerøe|wideroe|flybillett|fly)\b/i],
  ['transit', /\b(vy|ruter|skyss|kolumbus|atb|flytoget|go-?ahead|sj|fjord1|hurtigruten|buss|tog|ferje|ferge)\b/i],
  ['hotel', /\b(hotel|hotell|scandic|thon|nordic choice|clarion|quality|comfort|radisson|overnatting)\b/i],
  ['books', /\b(bok|bøker|ark|norli|tidsskrift|avis|bokhandel|bok kristiansand)\b/i],
  ['postage', /\b(posten|porto|bring|postnord|frakt)\b/i],
  ['phone', /\b(telenor|telia|ice|mobil|bredbånd|internett)\b/i],
  ['software', /\b(microsoft|adobe|google|apple|abonnement|lisens|software|programvare)\b/i],
  ['office', /\b(kontorrekvisita|kontor|clas ohlson|staples|kontorpapir)\b/i],
  ['tools', /\b(verktøy|biltema|jula|byggmakker|maxbo|obs bygg|monter|xl-?bygg|optimera)\b/i],
  ['meals', /\b(restaurant|kafé|kafe|cafe|lunsj|middag|burger|pizza|rema|kiwi|coop|meny|spar|joker|bunnpris|7-?eleven|narvesen)\b/i],
  ['course', /\b(kurs|seminar|konferanse|utdanning|sertifisering)\b/i],
];

/**
 * Utgiftstype fra tolkningen: AI-ens id når den finnes i listen, ellers nøkkelord.
 * Tom streng når ingenting passer (registreringen lar typen stå).
 */
export function guessExpenseType(bilag = {}) {
  const id = text(bilag.expenseType).toLowerCase();
  if (id && id !== 'other' && EXPENSE_CATEGORIES.some((row) => row.id === id)) return id;
  const haystack = [
    bilag.supplier,
    bilag.category,
    bilag.suggestedTitle,
    ...(Array.isArray(bilag.lineItems) ? bilag.lineItems.slice(0, 8).map((row) => row?.description) : []),
  ].map(text).filter(Boolean).join(' ');
  for (const [type, pattern] of KEYWORDS) {
    if (pattern.test(haystack)) return type;
  }
  return id === 'other' ? 'other' : '';
}

/** Dato på kvitteringen er brukbar: gyldig, ikke frem i tid og ikke eldre enn fem år. */
export function plausibleReceiptDate(value, today = new Date().toISOString().slice(0, 10)) {
  const day = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const time = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(time)) return false;
  const now = Date.parse(`${today}T12:00:00Z`);
  if (time > now + 2 * 86400000) return false;
  return time > now - 5 * 366 * 86400000;
}

/** Mva-sats: den største linjen når kvitteringen har flere satser, ellers satsen på kvitteringen. */
function receiptVatCode(bilag) {
  const lines = Array.isArray(bilag.vatLines) ? bilag.vatLines.filter((row) => num(row?.percent) != null) : [];
  if (lines.length) {
    const biggest = [...lines].sort((a, b) => (num(b.base) || num(b.vat) || 0) - (num(a.base) || num(a.vat) || 0))[0];
    const code = vatCodeForPercent(biggest.percent);
    if (code) return code;
  }
  const code = vatCodeForPercent(bilag.vatPercent);
  if (code) return code;
  // Kvitteringen viser mva 0 (bompenger, porto): fritatt.
  if (num(bilag.vatAmount) === 0 && (num(bilag.amount) || 0) > 0) return 'EXEMPT';
  return '';
}

/**
 * Feltene tolkningen gir utlegget.
 * touched: feltene den ansatte har endret (de beholdes).
 * Gir { patch, interpreted, warnings }.
 */
export function expensePatchFromReceipt(bilag = {}, { touched = {}, today } = {}) {
  const patch = {};
  const interpreted = [];
  const warnings = [];
  const put = (key, value) => {
    if (touched[key] || value === '' || value == null) return;
    patch[key] = value;
    interpreted.push(key);
  };

  if (plausibleReceiptDate(bilag.date, today)) put('date', bilag.date);
  else if (text(bilag.date)) warnings.push('Datoen på kvitteringen ser feil ut. Kontroller datoen.');

  const currency = text(bilag.currency).toUpperCase();
  const foreign = /^[A-Z]{3}$/.test(currency) && currency !== 'NOK';
  const amount = num(bilag.amount);
  if (currency && /^[A-Z]{3}$/.test(currency)) put('currency', currency);
  if (amount != null && amount > 0) {
    if (foreign) {
      // Beløpet i utenlandsk valuta lagres for seg. NOK-beløpet hentes fra kontoutskriften.
      if (!touched.originalAmount) {
        patch.originalAmount = roundMoney(amount);
        interpreted.push('originalAmount');
      }
      if (!touched.originalCurrency) patch.originalCurrency = currency;
      warnings.push(`Kvitteringen er i ${currency}. Skriv beløpet i NOK fra kontoutskriften.`);
    } else {
      put('amountInclVat', roundMoney(amount));
    }
  }
  // Norsk mva gjelder ikke kjøp i utlandet.
  put('vatCode', foreign ? 'OUTSIDE' : receiptVatCode(bilag));

  put('vendor', text(bilag.supplier).slice(0, 120));
  if (/^\d{9}$/.test(text(bilag.orgNr))) put('vendorOrgNr', text(bilag.orgNr));
  put('receiptNumber', text(bilag.invoiceNumber).slice(0, 60));
  const method = text(bilag.paymentMethod).toLowerCase();
  if (PAYMENT_METHODS.some((row) => row.id === method)) put('paymentMethod', method);
  if (!touched.cardLast4 && /^\d{4}$/.test(text(bilag.cardLast4))) patch.cardLast4 = text(bilag.cardLast4);

  const type = guessExpenseType(bilag);
  if (type) put('category', type);
  const title = text(bilag.suggestedTitle)
    || [type ? expenseCategory(type).label : '', text(bilag.supplier)].filter(Boolean).join(' – ');
  put('description', title.slice(0, 120));
  put('purpose', text(bilag.purpose).slice(0, 200));

  // Avgiftskode ut fra sats, type og land. Settes bare når den kan foreslås.
  const treatment = suggestVatTreatment({
    vatCode: patch.vatCode || '',
    category: patch.category || '',
    foreign,
    vendorCountry: text(bilag.vendorCountry).toUpperCase(),
    isService: bilag.isService === true,
  });
  if (treatment.id) put('vatTreatment', treatment.id);
  if (text(bilag.vendorCountry)) patch.vendorCountry = text(bilag.vendorCountry).toUpperCase();
  if (bilag.isService === true) patch.isService = true;

  if (bilag.confidence != null && num(bilag.confidence) < 0.5) {
    warnings.push('Kvitteringen var vanskelig å lese. Kontroller beløp og dato.');
  }
  if (bilag.duplicatePages) warnings.push('Samme kvittering lå flere ganger. Beløpet er telt én gang.');
  return { patch, interpreted, warnings };
}

/** De utgiftstypene personen bruker mest, nyeste først ved likt antall. */
export function frequentExpenseTypes(expenses = [], { employeeId = '', limit = 4 } = {}) {
  const counts = new Map();
  for (const row of expenses || []) {
    if (!row || (employeeId && text(row.employeeId) !== employeeId)) continue;
    const id = text(row.category);
    if (!id || id === 'other' || id === 'mileage') continue;
    const hit = counts.get(id) || { id, count: 0, last: '' };
    hit.count += 1;
    if (text(row.date) > hit.last) hit.last = text(row.date);
    counts.set(id, hit);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map((row) => row.id);
}

/** Et utlegg med samme person, dato og beløp finnes fra før (samme kvittering to ganger). */
export function findDuplicateExpense(expenses = [], draft = {}) {
  const amount = num(draft.amountInclVat);
  const day = text(draft.date);
  if (!amount || !day) return null;
  return (expenses || []).find((row) => row
    && row.id !== draft.id
    && text(row.date) === day
    && (!draft.employeeId || !row.employeeId || text(row.employeeId) === text(draft.employeeId))
    && Math.abs((num(row.amountInclVat) || 0) - amount) < 0.01) || null;
}
