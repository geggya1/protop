/**
 * Fraværstyper for timeføring.
 * paid: betalt fravær (lønnsgrunnlag).
 * deductBalance: trekkes fra timebalansen (timebank).
 * billable: teller som fakturerbart arbeid.
 * startMonth: måned fraværsåret starter (1 = januar).
 * flex speiler deductBalance. salary speiler paid. vacation er ferie.
 */

export const ABSENCE_CATEGORIES = [
  'Permisjon',
  'Avspasering',
  'Ferie',
  'Annet fravær',
  'Sykdom',
];

export const ABSENCE_MONTHS = [
  { id: 1, label: 'januar' },
  { id: 2, label: 'februar' },
  { id: 3, label: 'mars' },
  { id: 4, label: 'april' },
  { id: 5, label: 'mai' },
  { id: 6, label: 'juni' },
  { id: 7, label: 'juli' },
  { id: 8, label: 'august' },
  { id: 9, label: 'september' },
  { id: 10, label: 'oktober' },
  { id: 11, label: 'november' },
  { id: 12, label: 'desember' },
];

const DEFAULT_ROWS = [
  { id: 'annet_med', label: 'Annet fravær med lønn', category: 'Permisjon', paid: true, deductBalance: false, billable: true },
  { id: 'annet_uten', label: 'Annet fravær uten lønn', category: 'Permisjon', paid: false, deductBalance: true, billable: false },
  { id: 'avspasering', label: 'Avspasering', category: 'Avspasering', paid: false, deductBalance: true, billable: false },
  { id: 'ferie', label: 'Ferie', category: 'Ferie', paid: false, deductBalance: false, billable: true },
  { id: 'foreldre', label: 'Foreldrepermisjon', category: 'Permisjon', paid: true, deductBalance: false, billable: true },
  { id: 'intern_admin', label: 'Interntid - Administrasjon (Ikke til timebank)', category: 'Annet fravær', paid: false, deductBalance: true, billable: false },
  // Standardnavnene er generiske. Selskaper som har endret typene, har egne navn lagret (absenceTypesCustom).
  { id: 'intern_smart', label: 'Interntid - Internprosjekt (Ikke til timebank)', category: 'Annet fravær', paid: false, deductBalance: true, billable: false },
  { id: 'lege_med', label: 'Legebesøk med lønn', category: 'Annet fravær', paid: true, deductBalance: false, billable: true },
  { id: 'lege_uten', label: 'Legebesøk uten lønn', category: 'Annet fravær', paid: false, deductBalance: true, billable: false },
  { id: 'permittert', label: 'Permittert', category: 'Annet fravær', paid: false, deductBalance: false, billable: false },
  { id: 'reise_uten_lonn', label: 'Reisetid (Ikke til lønn)', category: 'Annet fravær', paid: false, deductBalance: true, billable: false },
  { id: 'seminar_med', label: 'Seminar med lønn', category: 'Annet fravær', paid: true, deductBalance: false, billable: true },
  { id: 'seminar_uten', label: 'Seminar uten lønn', category: 'Annet fravær', paid: false, deductBalance: true, billable: false },
  { id: 'egenmelding', label: 'Sykdom med egenmelding', category: 'Sykdom', paid: true, deductBalance: false, billable: true },
  { id: 'syk_melding', label: 'Sykdom med sykemelding', category: 'Sykdom', paid: true, deductBalance: false, billable: true },
  { id: 'syk_uten', label: 'Sykefravær uten lønn', category: 'Sykdom', paid: false, deductBalance: true, billable: false },
  { id: 'sykt_barn', label: 'Sykt barn', category: 'Sykdom', paid: true, deductBalance: false, billable: true },
  { id: 'sykdom', label: 'Sykdom', category: 'Sykdom', paid: true, deductBalance: false, billable: true, legacy: true },
  { id: 'permisjon', label: 'Permisjon', category: 'Permisjon', paid: true, deductBalance: false, billable: true, legacy: true },
  { id: 'annet', label: 'Annet fravær', category: 'Annet fravær', paid: true, deductBalance: false, billable: true, legacy: true },
];

function monthName(month) {
  return ABSENCE_MONTHS.find((row) => row.id === Number(month))?.label || 'januar';
}

export function normalizeAbsenceType(row = {}) {
  const paid = !!row.paid;
  const deductBalance = !!(row.deductBalance ?? row.flex);
  const category = ABSENCE_CATEGORIES.includes(row.category) ? row.category : 'Annet fravær';
  const startMonth = Math.min(12, Math.max(1, Number(row.startMonth) || 1));
  const label = String(row.label || '').trim() || 'Fravær';
  return {
    id: String(row.id || '').trim(),
    label,
    category,
    paid,
    deductBalance,
    billable: !!row.billable,
    startMonth,
    startMonthLabel: monthName(startMonth),
    salary: paid,
    flex: deductBalance,
    vacation: category === 'Ferie',
    timebank: !deductBalance,
    legacy: !!row.legacy,
    builtin: row.builtin !== false && !row.custom,
    custom: !!row.custom,
  };
}

export const ABSENCE_TYPES = DEFAULT_ROWS.map((row) => normalizeAbsenceType({ ...row, builtin: !row.legacy }));

const BY_ID = new Map(ABSENCE_TYPES.map((row) => [row.id, row]));

export function defaultAbsenceTypes() {
  return ABSENCE_TYPES.filter((row) => !row.legacy).map((row) => ({ ...row }));
}

export function absenceTypeTitle(row) {
  const label = String(row?.label || 'Fravær').trim();
  const category = String(row?.category || '').trim();
  if (!category || label.endsWith(`(${category})`)) return label;
  return `${label} (${category})`;
}

export function resolveAbsenceTypes(state) {
  const custom = state?.absenceTypesCustom === true;
  const stored = Array.isArray(state?.absenceTypes) ? state.absenceTypes : [];
  if (!custom) return defaultAbsenceTypes();
  return stored.map((row) => normalizeAbsenceType(row)).filter((row) => row.id && !row.legacy);
}

export function absenceTypeById(id, catalog) {
  const key = String(id || '').trim();
  const list = Array.isArray(catalog) ? catalog : null;
  const found = list?.find((row) => row.id === key);
  if (found) return normalizeAbsenceType(found);
  return BY_ID.get(key) || normalizeAbsenceType({
    id: key || 'annet',
    label: key || 'Fravær',
    category: 'Annet fravær',
    paid: true,
    deductBalance: false,
    billable: true,
    custom: true,
    builtin: false,
  });
}

/** Legebesøk og sykdom er helseopplysninger (GDPR art. 9), også når typen er laget av bedriften. */
const HEALTH_TYPE_IDS = new Set(['egenmelding', 'syk_melding', 'syk_uten', 'sykt_barn', 'sykdom', 'lege_med', 'lege_uten']);

export function isHealthAbsence(typeId, catalog) {
  const key = String(typeId || '').trim();
  if (!key) return false;
  if (HEALTH_TYPE_IDS.has(key)) return true;
  const row = absenceTypeById(key, catalog);
  return row.category === 'Sykdom' || /lege|syk/i.test(row.label);
}

/** Vises ved fritekst når fraværet gjelder sykdom eller legebesøk. */
export const HEALTH_FREE_TEXT_NOTICE = 'Ikke skriv diagnose eller andre helseopplysninger her. Typen fravær er nok.';

/** Typer som vises når man legger fravær inn i timelisten. */
export function absencePickerTypes(catalog) {
  const list = Array.isArray(catalog) ? catalog : defaultAbsenceTypes();
  return list.filter((row) => !row.legacy);
}
