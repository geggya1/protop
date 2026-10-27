/**
 * Endringer på selskapet (families/{id}.company) skrives felt for felt.
 * Før ble hele company-objektet skrevet tilbake. En eldre kopi (en annen fane eller enhet)
 * kunne da stille tilgangsmatrisen og andre innstillinger tilbake uten at noen merket det.
 *
 * `base` er selskapet slik skjermen kjente det, `next` er det samme med endringen.
 * Svaret er toppnivåfeltene som faktisk er endret, og feltene som er fjernet.
 */
export function companyFieldChanges(base, next) {
  const before = base && typeof base === 'object' ? base : {};
  const after = next && typeof next === 'object' ? next : {};
  const set = {};
  const remove = [];
  for (const key of Object.keys(after)) {
    if (after[key] === undefined) continue;
    if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) set[key] = after[key];
  }
  for (const key of Object.keys(before)) {
    if (before[key] !== undefined && (!(key in after) || after[key] === undefined)) remove.push(key);
  }
  return { set, remove };
}
