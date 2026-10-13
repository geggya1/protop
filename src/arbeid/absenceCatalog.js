/**
 * Fraværskategorier for timeføring.
 * paid: med lønn. timebank: teller i timebanken.
 * salary: teller i lønnsgrunnlag. vacation: feriedager. flex: avspasering.
 */

export const ABSENCE_TYPES = [
  { id: 'lege_med', label: 'Legebesøk med lønn', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'sykt_barn', label: 'Sykt barn', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'annet_med', label: 'Annet fravær med lønn', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'permittert', label: 'Permittert', paid: false, timebank: false, salary: false, vacation: false, flex: false },
  { id: 'intern_admin', label: 'Interntid - Administrasjon (Ikke til timebank)', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'syk_melding', label: 'Sykdom med sykemelding', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'ferie', label: 'Ferie', paid: true, timebank: false, salary: true, vacation: true, flex: false },
  { id: 'foreldre', label: 'Foreldrepermisjon', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'seminar_uten', label: 'Seminar uten lønn', paid: false, timebank: false, salary: false, vacation: false, flex: false },
  { id: 'egenmelding', label: 'Sykdom med egenmelding', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'avspasering', label: 'Avspasering', paid: true, timebank: false, salary: true, vacation: false, flex: true },
  { id: 'seminar_med', label: 'Seminar med lønn', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'intern_smart', label: 'Interntid - Smartplan (Ikke til timebank)', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'reise_uten_lonn', label: 'Reisetid - Frøya (Ikke til lønn) (Annet fravær)', paid: false, timebank: false, salary: false, vacation: false, flex: false },
  { id: 'annet_uten', label: 'Annet fravær uten lønn', paid: false, timebank: false, salary: false, vacation: false, flex: false },
  { id: 'lege_uten', label: 'Legebesøk uten lønn', paid: false, timebank: false, salary: false, vacation: false, flex: false },
  { id: 'syk_uten', label: 'Sykefravær uten lønn', paid: false, timebank: false, salary: false, vacation: false, flex: false },
  { id: 'sykdom', label: 'Sykdom', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'permisjon', label: 'Permisjon', paid: true, timebank: false, salary: true, vacation: false, flex: false },
  { id: 'annet', label: 'Annet fravær', paid: true, timebank: false, salary: true, vacation: false, flex: false },
];

const BY_ID = new Map(ABSENCE_TYPES.map((row) => [row.id, row]));

export function absenceTypeById(id) {
  return BY_ID.get(String(id || '').trim()) || {
    id: String(id || 'annet'),
    label: String(id || 'Fravær'),
    paid: true,
    timebank: false,
    salary: true,
    vacation: false,
    flex: false,
  };
}

/** Kategorier som vises når man legger fravær inn i timelisten. */
export function absencePickerTypes() {
  const legacy = new Set(['sykdom', 'permisjon', 'annet']);
  return ABSENCE_TYPES.filter((row) => !legacy.has(row.id));
}
