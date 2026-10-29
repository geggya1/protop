/**
 * Kjøregodtgjørelse for bruk av egen bil i jobben.
 *
 * Bedriften velger sats under Økonomi → Innstillinger:
 * - state: statens sats (særavtalen for reiser innenlands). Opptil den trekkfrie satsen er trekkfritt,
 *   resten er skattepliktig og går på lønn.
 * - taxfree: Skatteetatens trekkfrie sats.
 * - custom: bedriftens egen sats. Det som overstiger den trekkfrie satsen, er skattepliktig.
 * Satsene hentes automatisk (mileageRates.js), så de følger statens regulativ hvert år.
 *
 * Den ansatte har sin avtale under HR → Lønn:
 * - company (standard): godtgjørelse etter bedriftens sats.
 * - none: kjøringen er dekket av lønnen. Turen føres for dokumentasjon og fakturering, men
 *   km-godtgjørelsen refunderes ikke. Bom, ferje og parkering refunderes.
 * - custom: egen sats i arbeidsavtalen.
 * Registrer kjøretur viser ingen av valgene. Satsen bare følger med.
 *
 * mileagePolicies i prosjektstaten: { id: 'company', compensation, ratePerKm } og
 * { id: 'employee:<ansatt-id>', employeeId, compensation, ratePerKm }.
 * Ref: Skatte-ABC «Bilgodtgjørelse», særavtale reiser innenlands § 6.
 */
import { mileageRatesFor } from './mileageRates.js';
import { roundMoney } from '../economy/vat.js';

export const COMPANY_COMPENSATIONS = [
  { id: 'state', label: 'Statens regulativ' },
  { id: 'taxfree', label: 'Skattefri sats' },
  { id: 'custom', label: 'Egen sats' },
];

/**
 * Hvordan utlegg og kjøregodtgjørelse betales ut til den ansatte (src/economy/expensePayout.js).
 * Bedriften har en standard (expensePayout på { id: 'company' }), den ansatte kan ha sin egen (payout).
 */
export const PAYOUT_METHODS = [
  { id: 'payroll', label: 'Med lønnen' },
  { id: 'direct', label: 'Egen utbetaling' },
];

const PAYOUTS = new Set(PAYOUT_METHODS.map((row) => row.id));

export function companyPayout(policies = []) {
  const row = (policies || []).find((item) => item?.id === 'company') || null;
  return PAYOUTS.has(row?.expensePayout) ? row.expensePayout : 'payroll';
}

/** Utbetalingen for en ansatt: egen avtale, ellers bedriftens standard. */
export function employeePayout(policies = [], employeeId = '') {
  const own = employeeId
    ? (policies || []).find((item) => item?.id === employeePolicyId(employeeId)) || null
    : null;
  return PAYOUTS.has(own?.payout) ? own.payout : companyPayout(policies);
}

export function payoutLabel(method) {
  return PAYOUT_METHODS.find((row) => row.id === method)?.label || '';
}

export const EMPLOYEE_COMPENSATIONS = [
  { id: 'company', label: 'Etter bedriftens sats' },
  { id: 'none', label: 'Dekket av lønn' },
  { id: 'custom', label: 'Egen sats' },
];

const COMPANY_MODES = new Set(COMPANY_COMPENSATIONS.map((row) => row.id));

function rateOf(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? roundMoney(n) : 0;
}

function kr(value) {
  return Number(value).toFixed(2).replace('.', ',');
}

export function employeePolicyId(employeeId) {
  return `employee:${String(employeeId || '').trim()}`;
}

/** Hint til et valg, med satsene som gjelder nå. */
export function companyCompensationHint(mode, rates) {
  if (mode === 'state') return `${kr(rates.state)} kr/km (${rates.year}). ${kr(rates.taxFree)} kr/km er trekkfritt, resten er skattepliktig og går på lønn.`;
  if (mode === 'taxfree') return `${kr(rates.taxFree)} kr/km, uten skatt.`;
  return `Bedriftens sats per km. Det som er over ${kr(rates.taxFree)} kr/km, er skattepliktig.`;
}

/** Bedriftens valg. Uten valg: egen sats når den er satt, ellers skattefri sats (som før). */
export function companyCompensation(policies = []) {
  const row = (policies || []).find((item) => item?.id === 'company') || null;
  const custom = rateOf(row?.ratePerKm);
  const mode = COMPANY_MODES.has(row?.compensation) ? row.compensation : (custom ? 'custom' : 'taxfree');
  return { mode, ratePerKm: custom };
}

/** Den ansattes avtale: 'company', 'none' eller 'custom' (med sats). */
export function employeeCompensation(policies = [], employeeId = '') {
  const own = employeeId
    ? (policies || []).find((item) => item?.id === employeePolicyId(employeeId)) || null
    : null;
  const mode = own?.compensation === 'none' || own?.compensation === 'salary'
    ? 'none'
    : (own?.compensation === 'custom' && rateOf(own?.ratePerKm) ? 'custom' : 'company');
  return { mode, ratePerKm: mode === 'custom' ? rateOf(own.ratePerKm) : 0 };
}

/**
 * Satsen for en ansatt på en dato: { mode, rate, taxFreeRate, reimburse, label }.
 * rate er kr/km for kjøringen (og standard fakturasats). reimburse er false når lønnen dekker
 * kjøringen. fetched: satsene serveren har hentet ({ 2026: { state, taxFree } }).
 */
export function mileageCompensation(policies = [], employeeId = '', { date = '', fetched = {} } = {}) {
  const rates = mileageRatesFor(date || new Date().toISOString().slice(0, 10), fetched);
  const company = companyCompensation(policies);
  const own = employeeCompensation(policies, employeeId);
  let rate = rates.taxFree;
  let label = 'Skattefri sats';
  if (own.mode === 'custom') {
    rate = own.ratePerKm;
    label = 'Avtalt sats';
  } else if (company.mode === 'state') {
    rate = rates.state;
    label = 'Statens regulativ';
  } else if (company.mode === 'custom' && company.ratePerKm) {
    rate = company.ratePerKm;
    label = 'Selskapssats';
  }
  return {
    mode: own.mode === 'none' ? 'none' : (own.mode === 'custom' ? 'custom' : company.mode),
    rate,
    taxFreeRate: rates.taxFree,
    reimburse: own.mode !== 'none',
    label,
  };
}

/**
 * Det den ansatte skal ha for en tur: refusjon totalt, trekkfri og skattepliktig del.
 * allowance: km × sats (+ passasjertillegg), extras: bom, ferje, parkering m.m.
 */
export function tripReimbursement({ km = 0, allowance = 0, extras = 0, reimburse = true, taxFreeRate = 3.5 } = {}) {
  const pay = reimburse ? roundMoney(Number(allowance) || 0) : 0;
  const taxFree = Math.min(pay, roundMoney((Number(km) || 0) * taxFreeRate));
  const outlay = roundMoney(Number(extras) || 0);
  return {
    total: roundMoney(pay + outlay),
    allowance: pay,
    taxFree: roundMoney(taxFree),
    taxable: roundMoney(pay - taxFree),
    extras: outlay,
  };
}

/** Bedriftens valg (og sats for «Egen sats»), og standard utbetaling av utlegg. */
export function companyPolicyRow(current = {}, { compensation, ratePerKm, expensePayout } = {}) {
  const mode = COMPANY_MODES.has(compensation) ? compensation : 'taxfree';
  return {
    ...current,
    id: 'company',
    compensation: mode,
    ratePerKm: mode === 'custom' ? rateOf(ratePerKm) : rateOf(current?.ratePerKm),
    expensePayout: PAYOUTS.has(expensePayout) ? expensePayout : companyPayout([current]),
  };
}

/**
 * Den ansattes avtale. Uten egen sats og uten egen utbetaling gir den null: ingen egen rad,
 * bedriftens valg gjelder. payout: 'payroll', 'direct' eller tom (som bedriften).
 */
export function employeePolicyRow(employeeId, { compensation, ratePerKm, employeeName = '', payout = '' } = {}) {
  const id = String(employeeId || '').trim();
  const own = compensation === 'none' || compensation === 'custom';
  const ownPayout = PAYOUTS.has(payout) ? payout : '';
  if (!id || (!own && !ownPayout)) return null;
  return {
    id: employeePolicyId(id),
    employeeId: id,
    employeeName: String(employeeName || '').slice(0, 120),
    compensation: own ? compensation : 'company',
    ratePerKm: compensation === 'custom' ? rateOf(ratePerKm) : 0,
    payout: ownPayout,
  };
}
