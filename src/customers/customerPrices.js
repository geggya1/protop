/**
 * Priser på kundekortet. Priser og rabatter avtales for det meste med kunden, ikke per prosjekt.
 *
 * Rekkefølgen er: prosjektet (når det er satt der) → kunden → selskapets standard.
 * Tomt felt på kunden betyr «ikke satt», og da gjelder neste nivå.
 *
 * Feltene ligger rett på kunden, som kredittid og forsendelse:
 * - hourlyRate: timepris eks. mva (kr/t)
 * - discountHours: rabatt på timer (%)
 * - discountProducts: rabatt på varer (%)
 * - discountRental: rabatt på utleie av utstyr (%)
 */

export const CUSTOMER_PRICE_FIELDS = [
  { key: 'hourlyRate', label: 'Timepris eks. mva', suffix: 'kr/t', hint: 'Brukes når prosjektet ikke har egen timepris.' },
  { key: 'discountHours', label: 'Rabatt timer', suffix: '%', hint: 'Tomt: selskapets standard.' },
  { key: 'discountProducts', label: 'Rabatt varer', suffix: '%', hint: 'Tomt: selskapets standard.' },
  { key: 'discountRental', label: 'Rabatt utleie', suffix: '%', hint: 'Maskiner og utstyr booket på prosjekter.' },
];

const PERCENT_KEYS = ['discountHours', 'discountProducts', 'discountRental'];

function number(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** { hourlyRate, discountHours, discountProducts, discountRental }, null når ikke satt. */
export function customerPrices(customer) {
  const src = customer && typeof customer === 'object' ? customer : {};
  const rate = number(src.hourlyRate);
  const out = { hourlyRate: rate != null && rate > 0 ? Math.round(rate * 100) / 100 : null };
  for (const key of PERCENT_KEYS) {
    const value = number(src[key]);
    out[key] = value == null || value < 0 ? null : Math.min(100, Math.round(value * 100) / 100);
  }
  return out;
}

/** Har kunden minst én pris eller rabatt satt? */
export function hasCustomerPrices(customer) {
  return Object.values(customerPrices(customer)).some((value) => value != null);
}

/** Feltene slik de lagres på kunden (tomt felt = ikke satt). */
export function customerPricePatch(form = {}) {
  const prices = customerPrices(form);
  return Object.fromEntries(Object.entries(prices).map(([key, value]) => [key, value == null ? '' : value]));
}

function formatNumber(value) {
  return String(value).replace('.', ',');
}

/** Kort tekst til kundelisten og avtalene: «1 050 kr/t · 10 % rabatt timer». Tom når ingen er satt. */
export function customerPriceSummary(customer) {
  const p = customerPrices(customer);
  return [
    p.hourlyRate != null ? `${p.hourlyRate.toLocaleString('nb-NO')} kr/t` : '',
    p.discountHours ? `${formatNumber(p.discountHours)} % rabatt timer` : '',
    p.discountProducts ? `${formatNumber(p.discountProducts)} % rabatt varer` : '',
    p.discountRental ? `${formatNumber(p.discountRental)} % rabatt utleie` : '',
  ].filter(Boolean).join(' · ');
}

function projectOverrides(project, key) {
  const value = project?.invoiceSettings?.[key];
  return value !== null && value !== undefined && value !== '' && value !== 'inherit' && number(value) != null;
}

/**
 * Effektive fakturainnstillinger med kundens rabatter. Prosjektets egne verdier står;
 * ellers gjelder kunden foran selskapets standard. discountRental legges til.
 */
export function withCustomerPrices(settings = {}, { project = null, customer = null } = {}) {
  const base = settings && typeof settings === 'object' ? settings : {};
  const p = customerPrices(customer);
  const next = { ...base, discountRental: base.discountRental ?? 0 };
  if (p.discountHours != null && !projectOverrides(project, 'discountHours')) next.discountHours = p.discountHours;
  if (p.discountProducts != null && !projectOverrides(project, 'discountProducts')) next.discountProducts = p.discountProducts;
  if (p.discountRental != null) next.discountRental = p.discountRental;
  return next;
}
