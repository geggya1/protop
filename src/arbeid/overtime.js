/**
 * Timearter / overtid for timeføring (PowerOffice/Visma-inspirert).
 */

export const TIME_TYPES = [
  { id: 'ordinary', label: 'Ordinær tid', multiplier: 1, account: '5010', billableDefault: true },
  { id: 'overtime_50', label: 'Overtid 50 %', multiplier: 1.5, account: '5400', billableDefault: true },
  { id: 'overtime_100', label: 'Overtid 100 %', multiplier: 2, account: '5400', billableDefault: true },
  { id: 'travel', label: 'Reisetid', multiplier: 1, account: '5010', billableDefault: true },
  { id: 'internal', label: 'Intern tid', multiplier: 1, account: '5010', billableDefault: false },
];

export function timeTypeById(id) {
  return TIME_TYPES.find((row) => row.id === id) || TIME_TYPES[0];
}

/** Effektiv fakturerbar tid etter påslag (multiplier på timepris, ikke timer). */
export function effectiveBillableHours(hours, timeTypeId = 'ordinary') {
  const n = Number(hours) || 0;
  // Timer føres 1:1; multiplier brukes på timepris ved fakturering
  return Math.round(n * 100) / 100;
}

export function rateWithOvertime(baseRate, timeTypeId = 'ordinary') {
  const type = timeTypeById(timeTypeId);
  const rate = Number(baseRate) || 0;
  return Math.round(rate * type.multiplier * 100) / 100;
}

export function isOvertime(timeTypeId) {
  return String(timeTypeId || '').startsWith('overtime');
}
