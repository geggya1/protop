/**
 * Utvidet kontoplan for faktura/bilag (norsk standard-inspirert, forenklet).
 * Komplementerer prosjektkatalogens NS-koder.
 */

export const LEDGER_ACCOUNTS = [
  { code: '1500', name: 'Kundefordringer', kind: 'asset' },
  { code: '1920', name: 'Bankinnskudd', kind: 'asset' },
  { code: '2400', name: 'Leverandørgjeld', kind: 'liability' },
  { code: '2701', name: 'Utgående MVA høy sats', kind: 'liability' },
  { code: '2702', name: 'Utgående MVA middels sats', kind: 'liability' },
  { code: '2703', name: 'Utgående MVA lav sats', kind: 'liability' },
  { code: '2704', name: 'Utgående MVA nullsats', kind: 'liability' },
  { code: '3000', name: 'Salgsinntekt tjenester', kind: 'income' },
  { code: '3001', name: 'Salgsinntekt timer', kind: 'income' },
  { code: '3100', name: 'Salgsinntekt endringer', kind: 'income' },
  { code: '3200', name: 'Salgsinntekt varer', kind: 'income' },
  { code: '3600', name: 'Leieinntekter', kind: 'income' },
  { code: '3900', name: 'Annen driftsinntekt', kind: 'income' },
  { code: '4000', name: 'Varekostnad', kind: 'cost' },
  { code: '5000', name: 'Lønn til ansatte', kind: 'cost' },
  { code: '5010', name: 'Egne timer (prosjekt)', kind: 'cost' },
  { code: '5400', name: 'Overtid', kind: 'cost' },
  { code: '6500', name: 'Verktøy og inventar', kind: 'cost' },
  { code: '7000', name: 'Kontorkostnad', kind: 'cost' },
  { code: '7080', name: 'Bruk av privat bil i næring', kind: 'cost' },
  { code: '7140', name: 'Reisekostnad', kind: 'cost' },
  { code: '7370', name: 'Representasjon', kind: 'cost' },
  { code: '7770', name: 'Bank og kortgebyr', kind: 'cost' },
  { code: '7790', name: 'Annen kostnad', kind: 'cost' },
];

export function ledgerAccount(code) {
  const id = String(code || '').trim();
  return LEDGER_ACCOUNTS.find((row) => row.code === id) || null;
}

export function incomeAccountForHours() {
  return '3001';
}

export function vatPayableAccount(vatCode = 'HIGH') {
  const map = {
    HIGH: '2701',
    MID: '2702',
    LOW: '2703',
    ZERO: '2704',
    EXEMPT: '',
    OUTSIDE: '',
  };
  const code = String(vatCode || 'HIGH').toUpperCase();
  if (Object.prototype.hasOwnProperty.call(map, code)) return map[code];
  return '2701';
}

export function receivableAccount() {
  return '1500';
}
