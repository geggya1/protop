/**
 * Kjørebok — yrkeskjøring, sats og viderefakturering.
 * Ref: Skatte-ABC B-5-4, forskrift om satser 2026 (kr 3,50 / km).
 */

import { calcLineVat, roundMoney } from './vat.js';
import { text } from './invoices.js';

/** Skattefri km-godtgjørelse 2026 (privat bil, også el). */
export const MILEAGE_RATE_TAX_FREE = 3.5;
/** Firmabil privat fordel, individuell verdsettelse 2026. */
export const FIRM_CAR_PRIVATE_RATE = 3.4;
export const PASSENGER_RATE = 1;
export const YEARLY_RATE_LIMIT_KM = 6000;

export const TRIP_PURPOSES = [
  { id: 'duty', label: 'Yrkeskjøring' },
  { id: 'private', label: 'Privat' },
  { id: 'commute', label: 'Hjem–arbeid' },
];

export const VEHICLE_KINDS = [
  { id: 'private', label: 'Privat bil' },
  { id: 'company', label: 'Firmabil' },
];

export const TRIP_STATUSES = [
  { id: 'draft', label: 'Utkast' },
  { id: 'submitted', label: 'Sendt' },
  { id: 'approved', label: 'Godkjent' },
  { id: 'invoiced', label: 'Fakturert' },
];

export function emptyTrip(overrides = {}) {
  return normalizeTrip({
    id: '',
    date: '',
    employeeId: '',
    employeeName: '',
    vehicleKind: 'private',
    electric: false,
    purpose: 'duty',
    from: '',
    via: '',
    to: '',
    notes: '',
    km: 0,
    odometerStart: 0,
    odometerEnd: 0,
    passengers: 0,
    tolls: 0,
    parking: 0,
    rate: MILEAGE_RATE_TAX_FREE,
    billable: true,
    billableRate: 0,
    customerId: '',
    customerNumber: '',
    customerName: '',
    projectId: '',
    projectNumber: '',
    projectName: '',
    status: 'draft',
    invoiceId: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  });
}

export function normalizeTrip(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  const kmFromOdo = Number(row.odometerEnd) - Number(row.odometerStart);
  const km = Number(row.km);
  const distance = Number.isFinite(km) && km > 0
    ? roundMoney(km)
    : (Number.isFinite(kmFromOdo) && kmFromOdo > 0 ? roundMoney(kmFromOdo) : 0);
  const purpose = TRIP_PURPOSES.some((p) => p.id === row.purpose) ? row.purpose : 'duty';
  const vehicleKind = row.vehicleKind === 'company' ? 'company' : 'private';
  const rate = Number(row.rate) > 0 ? Number(row.rate) : MILEAGE_RATE_TAX_FREE;
  const passengers = Math.max(0, Number(row.passengers) || 0);
  const tolls = Math.max(0, Number(row.tolls) || 0);
  const parking = Math.max(0, Number(row.parking) || 0);
  const allowance = roundMoney(distance * rate + passengers * PASSENGER_RATE * distance);
  const extras = roundMoney(tolls + parking);
  const status = TRIP_STATUSES.some((s) => s.id === row.status) ? row.status : 'draft';
  return {
    id: text(row.id),
    date: text(row.date),
    employeeId: text(row.employeeId),
    employeeName: text(row.employeeName),
    vehicleKind,
    electric: !!row.electric,
    purpose,
    from: text(row.from),
    via: text(row.via),
    to: text(row.to),
    notes: text(row.notes),
    km: distance,
    odometerStart: Number(row.odometerStart) || 0,
    odometerEnd: Number(row.odometerEnd) || 0,
    passengers,
    tolls: roundMoney(tolls),
    parking: roundMoney(parking),
    rate,
    allowance,
    extras,
    amount: roundMoney(allowance + extras),
    taxable: purpose === 'private' || purpose === 'commute'
      ? roundMoney(distance * (vehicleKind === 'company' ? FIRM_CAR_PRIVATE_RATE : 0))
      : 0,
    taxFree: purpose === 'duty' ? Math.min(allowance, roundMoney(distance * MILEAGE_RATE_TAX_FREE)) : 0,
    billable: row.billable !== false && purpose === 'duty',
    billableRate: Number(row.billableRate) > 0 ? Number(row.billableRate) : rate,
    customerId: text(row.customerId),
    customerNumber: text(row.customerNumber),
    customerName: text(row.customerName),
    projectId: text(row.projectId),
    projectNumber: text(row.projectNumber),
    projectName: text(row.projectName),
    status,
    invoiceId: text(row.invoiceId),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

export function validateTrip(trip) {
  const row = normalizeTrip(trip);
  if (!row.date) return { ok: false, error: 'Dato mangler.' };
  if (!row.from || !row.to) return { ok: false, error: 'Fra og til er påkrevd (Skatte-ABC).' };
  if (!(row.km > 0)) return { ok: false, error: 'Kjørelengde (km) mangler.' };
  if (!row.notes && row.purpose === 'duty') {
    return { ok: false, error: 'Yrkeskjøring krever formål (firma/byggeplass).' };
  }
  return { ok: true, error: null, trip: row };
}

export function tripInvoiceLine(trip, { vatCode = 'HIGH' } = {}) {
  const row = normalizeTrip(trip);
  const qty = row.km;
  const unitPrice = row.billableRate || row.rate;
  const calc = calcLineVat({ quantity: qty, unitPrice, vatCode });
  const extras = calcLineVat({ quantity: 1, unitPrice: row.extras, vatCode });
  const lines = [{
    id: `trip_${row.id || 'x'}`,
    description: `Kjøring ${row.from} – ${row.to}${row.notes ? ` (${row.notes})` : ''}`,
    quantity: qty,
    unit: 'km',
    unitPrice,
    vatCode,
    account: '3000',
    tripIds: row.id ? [row.id] : [],
    ...calc,
  }];
  if (row.extras > 0) {
    lines.push({
      id: `trip_${row.id || 'x'}_bom`,
      description: 'Bom / parkering',
      quantity: 1,
      unit: 'stk',
      unitPrice: row.extras,
      vatCode,
      account: '3000',
      tripIds: row.id ? [row.id] : [],
      ...extras,
    });
  }
  return lines;
}

export function yearlyDutyKm(trips = [], year) {
  return (trips || []).reduce((sum, raw) => {
    const row = normalizeTrip(raw);
    if (row.purpose !== 'duty') return sum;
    if (year && !String(row.date).startsWith(String(year))) return sum;
    return roundMoney(sum + row.km);
  }, 0);
}

export function tripsToCsv(rows = []) {
  const header = [
    'Dato', 'Fra', 'Via', 'Til', 'Formål', 'Km', 'Teller start', 'Teller slutt',
    'Sats', 'Godtgjørelse', 'Bom/parkering', 'Totalt', 'Kunde', 'Prosjekt',
  ];
  const lines = rows.map((raw) => {
    const row = normalizeTrip(raw);
    return [
      row.date, row.from, row.via, row.to,
      TRIP_PURPOSES.find((p) => p.id === row.purpose)?.label,
      row.km, row.odometerStart, row.odometerEnd,
      row.rate, row.allowance, row.extras, row.amount,
      row.customerName, row.projectName,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';');
  });
  return `\uFEFF${header.join(';')}\n${lines.join('\n')}`;
}
