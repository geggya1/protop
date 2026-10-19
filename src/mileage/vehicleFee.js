/**
 * Gebyrgruppe for bom og ferje.
 * NVDB har egen takst for liten bil, liten elbil og stor bil.
 * Mangler gruppens takst, brukes takst for lett kjøretøy, og beløpet kan endres på turen.
 */

export const VEHICLE_FEE_CLASSES = [
  { id: 'elbil', label: 'Elbil' },
  { id: 'lett', label: 'Lett kjøretøy' },
  { id: 'tung', label: 'Tungt kjøretøy' },
  { id: 'mc', label: 'Motorsykkel' },
];

const CLASS_IDS = new Set(VEHICLE_FEE_CLASSES.map((row) => row.id));

function text(value) {
  return String(value ?? '').trim();
}

export function normalizeFeeClass(value) {
  const id = text(value).toLowerCase();
  return CLASS_IDS.has(id) ? id : '';
}

export function feeClassLabel(id) {
  return VEHICLE_FEE_CLASSES.find((row) => row.id === id)?.label || '';
}

/**
 * Valgt gruppe vinner. Ellers leses drivstoff, teknisk kode og totalvekt.
 * Elbil, lett kjøretøy (gruppe 1), tungt kjøretøy og motorsykkel.
 */
export function feeClassFromSignals(input = {}) {
  const chosen = normalizeFeeClass(input?.feeClass);
  if (chosen) return chosen;
  const fuel = text(input?.fuel || input?.fuelLabel).toLowerCase();
  const type = text(input?.vehicleType).toLowerCase();
  const kode = text(input?.tekniskKode).toUpperCase();
  if (input?.electric === true || input?.fuelType === 'electric' || /elektr|elbil/.test(fuel)) return 'elbil';
  if (/^L[1-7]/.test(kode) || type === 'motorcycle' || type === 'moped' || type === 'escooter') return 'mc';
  const weight = Number(input?.totalWeight);
  if ((Number.isFinite(weight) && weight > 3500) || /^N[23]|^M[23]|^O[34]/.test(kode)) return 'tung';
  return 'lett';
}

function fare(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Takst for gebyrgruppen. 0 er en gyldig elbil-takst. */
export function tollPriceForClass(station, feeClass = 'lett') {
  const group = normalizeFeeClass(feeClass) || 'lett';
  const light = fare(station?.price);
  const electric = fare(station?.priceElectric);
  const heavy = fare(station?.priceHeavy);
  const motorcycle = fare(station?.priceMotorcycle);
  if (group === 'elbil' && electric != null) return electric;
  if (group === 'tung' && heavy != null) return heavy;
  if (group === 'mc' && motorcycle != null) return motorcycle;
  return light != null ? light : 0;
}

/** Gruppen har en egen registrert takst, ikke bare lett-kjøretøy-prisen. */
export function tariffIsExact(station, feeClass = 'lett') {
  const group = normalizeFeeClass(feeClass) || 'lett';
  if (group === 'elbil') return fare(station?.priceElectric) != null;
  if (group === 'tung') return fare(station?.priceHeavy) != null;
  if (group === 'mc') return fare(station?.priceMotorcycle) != null;
  return fare(station?.price) != null;
}
