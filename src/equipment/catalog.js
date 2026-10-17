/**
 * Utstyr selskapet eier og kan reservere til prosjekt.
 * Poolbil er også kjøretøyvalget i kjøreboken.
 */

/** Det brukeren velger først når noe skal registreres. */
export const EQUIPMENT_GROUPS = [
  { id: 'kjoretoy', label: 'Kjøretøy' },
  { id: 'utstyr', label: 'Utstyr' },
  { id: 'rom', label: 'Rom' },
];

export const EQUIPMENT_CATEGORIES = [
  { id: 'poolbil', label: 'Poolbil', group: 'kjoretoy', kind: 'vehicle', icon: 'car' },
  { id: 'drone', label: 'Drone', group: 'utstyr', kind: 'tool', icon: 'airplane' },
  { id: 'ipad', label: 'Nettbrett', group: 'utstyr', kind: 'device', icon: 'tablet-portrait' },
  { id: 'termokamera', label: 'Termokamera', group: 'utstyr', kind: 'tool', icon: 'thermometer' },
  { id: 'verktoy', label: 'Verktøy', group: 'utstyr', kind: 'tool', icon: 'construct' },
  { id: 'annet', label: 'Annet utstyr', group: 'utstyr', kind: 'other', icon: 'cube' },
  { id: 'rom', label: 'Rom', group: 'rom', kind: 'room', icon: 'business' },
];

export const EQUIPMENT_STATUSES = [
  { id: 'available', label: 'Tilgjengelig' },
  { id: 'service', label: 'Service' },
  { id: 'retired', label: 'Ute av drift' },
];

export function equipmentCategory(id) {
  return EQUIPMENT_CATEGORIES.find((row) => row.id === id)
    || EQUIPMENT_CATEGORIES.find((row) => row.id === 'annet');
}

export function equipmentGroup(id) {
  const direct = EQUIPMENT_GROUPS.find((row) => row.id === id);
  if (direct) return direct;
  const fromCategory = EQUIPMENT_CATEGORIES.find((row) => row.id === id);
  return EQUIPMENT_GROUPS.find((row) => row.id === fromCategory?.group) || EQUIPMENT_GROUPS[1];
}
