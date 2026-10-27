/**
 * Selskapets kontoplan for salg og kjøp, og standardkontoer på fakturalinjer.
 * Tom liste betyr standardkatalogen. Når selskapet har endret planen,
 * er companyAccountsCustom sann og listen er hele planen.
 */

export const DEFAULT_COMPANY_ACCOUNTS = [
  account('3000', 'sale', 25, 'S', 'Honorar avgiftspliktig', '1', '3'),
  account('3001', 'sale', 25, 'S', 'Viderefakturerte utlegg avgiftspliktig', '1', '3'),
  account('3002', 'sale', 25, 'S', 'Leieinntekter lokaler m/mva', '1', '3'),
  account('3100', 'sale', 0, 'Z', 'Salgsinntekter avgiftsfritt', '2', '4'),
  account('3101', 'sale', 0, 'Z', 'Viderefakturerte utlegg avgiftsfritt (utland)', '2', '4'),
  account('3200', 'sale', 0, 'Z', 'Salgsinntekter utenfor avgiftsområdet', '16', '9'),
  account('3600', 'sale', 0, 'Z', 'Leie lokaler u/mva', '', '6'),
  account('3620', 'sale', 0, 'Z', 'Leie kjøretøy u/mva', '', '7'),
  account('3811', 'sale', 0, 'Z', 'Salg anleggsmidler uten moms', '2', '5'),
  account('3900', 'sale', 0, 'Z', 'Utlegg/Kjøp avgiftsfritt (Kjøretøy)', '2', '7'),
  account('4000', 'sale', 0, 'Z', 'Utlegg viderefakturert (Utgått)', '2', '7'),
  account('5990', 'sale', 0, 'Z', 'Viderefakturert utlegg utland (ny)', '2', '4'),
  account('6301', 'sale', 0, 'Z', 'Salgsinntekt utlegg avgiftsfritt (innland)', '2', '7'),
  account('7141', 'purchase', 25, 'S', 'Reisekostnader, høy sats', '', '', 'Automatisk lagt til ved aktivering av Reise & Utlegg.'),
  account('7142', 'purchase', 15, 'S', 'Reisekostnader, middels sats', '', '', 'Automatisk lagt til ved aktivering av Reise & Utlegg.'),
  account('7143', 'purchase', 12, 'S', 'Reisekostnader, lav sats', '', '', 'Automatisk lagt til ved aktivering av Reise & Utlegg.'),
  account('7771', 'sale', 0, 'Z', 'Øreavrunding avgiftsfritt', '16', ''),
  account('7799', 'purchase', 0, 'E', 'Andre kostnader, ingen mva.', '', '', 'Automatisk lagt til ved aktivering av Reise & Utlegg.'),
];

function account(code, kind, vatRate, vatLetter, name, turnoverClass, vatCode, note = '') {
  return {
    id: code,
    code,
    kind,
    vatRate,
    vatLetter,
    name,
    turnoverClass,
    vatCode,
    note,
  };
}

export function normalizeCompanyAccount(row = {}) {
  const code = String(row.code || row.id || '').trim();
  const kind = row.kind === 'purchase' ? 'purchase' : 'sale';
  const rateRaw = row.vatRate === '' || row.vatRate == null ? null : Number(row.vatRate);
  const vatRate = Number.isFinite(rateRaw) ? rateRaw : null;
  const letter = String(row.vatLetter || '').trim().toUpperCase();
  return {
    id: String(row.id || code).trim(),
    code,
    kind,
    vatRate,
    vatLetter: ['S', 'Z', 'E'].includes(letter) ? letter : '',
    name: String(row.name || '').trim(),
    turnoverClass: String(row.turnoverClass || '').trim(),
    vatCode: String(row.vatCode || '').trim(),
    note: String(row.note || '').trim(),
  };
}

export function defaultCompanyAccounts() {
  return DEFAULT_COMPANY_ACCOUNTS.map((row) => normalizeCompanyAccount(row));
}

export function resolveCompanyAccounts(state) {
  const custom = state?.companyAccountsCustom === true;
  const stored = Array.isArray(state?.companyAccounts) ? state.companyAccounts : [];
  if (!custom) return defaultCompanyAccounts();
  return stored.map((row) => normalizeCompanyAccount(row)).filter((row) => row.code && row.name);
}

export function accountKindLabel(kind) {
  return kind === 'purchase' ? 'Kjøp' : 'Salg';
}

export function accountTitle(row) {
  const kind = accountKindLabel(row?.kind);
  const rate = row?.vatRate == null || row?.vatRate === '' ? '' : `${row.vatRate}%`;
  const letter = row?.vatLetter ? `(${row.vatLetter})` : '';
  const vat = [rate, letter].filter(Boolean).join(' ');
  return [row?.code, kind, vat, row?.name].filter(Boolean).join(' - ');
}

export function accountOptionLabel(row) {
  const rate = row?.vatRate == null || row?.vatRate === '' ? '' : `${row.vatRate}%`;
  return [row?.code, rate, row?.name].filter(Boolean).join(' - ');
}

/**
 * Kontogruppene på fakturalinjene. Alle settes under Økonomi → Innstillinger → Standard
 * regnskapskontoer, og fakturamotoren bruker bare disse (eller prosjektets overstyring).
 * Mangler en konto, kan ikke det som hører til den faktureres.
 */
export const STANDARD_ACCOUNT_SLOTS = [
  { id: 'hours', label: 'Timer', hint: 'Timer etter timepris' },
  { id: 'fees', label: 'Honorar og fastpris', hint: 'Fastpris, fast avtale og enhetspris' },
  { id: 'expenses', label: 'Viderefakturerte utlegg', hint: 'Kjøp i eget navn som faktureres videre, med mva og eventuelt påslag' },
  { id: 'outlays', label: 'Utlegg på vegne av kunden', hint: 'Kjøp i kundens navn. Bruttobeløp, uten påslag og mva (mval. § 4-1 annet ledd)' },
  { id: 'mileage', label: 'Kjøring', hint: 'Kilometer, bom, ferje og parkering' },
  { id: 'products', label: 'Produkter og varesalg' },
  { id: 'admin', label: 'Adm. kostnader' },
  { id: 'deduction', label: 'Fratrekk for andre fakturamottakere' },
  { id: 'aconto', label: 'A-konto' },
];

const DOMESTIC_DEFAULTS = {
  fees: '3000',
  hours: '3000',
  expenses: '3001',
  outlays: '6301',
  mileage: '3001',
  products: '3001',
  admin: '3000',
  deduction: '',
  aconto: '3000',
};

const FOREIGN_DEFAULTS = {
  fees: '3100',
  hours: '3100',
  expenses: '3101',
  outlays: '6301',
  mileage: '3101',
  products: '3101',
  admin: '3100',
  deduction: '',
  aconto: '3100',
};

export function defaultStandardAccounts() {
  return {
    domestic: { ...DOMESTIC_DEFAULTS },
    foreign: { ...FOREIGN_DEFAULTS },
    rounding: '7771',
  };
}

export function resolveStandardAccounts(state) {
  const defaults = defaultStandardAccounts();
  const stored = Array.isArray(state?.standardAccounts) ? state.standardAccounts : [];
  if (!stored.length) return defaults;
  const map = new Map(stored.map((row) => [`${row.scope}:${row.slot}`, String(row.code ?? '')]));
  function fill(scope, base) {
    const next = { ...base };
    for (const slot of Object.keys(base)) {
      const key = `${scope}:${slot}`;
      if (map.has(key)) next[slot] = map.get(key);
    }
    return next;
  }
  return {
    domestic: fill('domestic', defaults.domestic),
    foreign: fill('foreign', defaults.foreign),
    rounding: map.has('other:rounding') ? map.get('other:rounding') : defaults.rounding,
  };
}

export function standardAccountRows(resolved) {
  const rows = [];
  for (const slot of STANDARD_ACCOUNT_SLOTS) {
    rows.push({ id: `domestic:${slot.id}`, scope: 'domestic', slot: slot.id, code: resolved.domestic[slot.id] || '' });
    rows.push({ id: `foreign:${slot.id}`, scope: 'foreign', slot: slot.id, code: resolved.foreign[slot.id] || '' });
  }
  rows.push({ id: 'other:rounding', scope: 'other', slot: 'rounding', code: resolved.rounding || '' });
  return rows;
}
