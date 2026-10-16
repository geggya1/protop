/**
 * Utstyr selskapet eier og kan reservere til prosjekt.
 * Poolbil er også kjøretøyvalget i kjøreboken.
 */

export const EQUIPMENT_CATEGORIES = [
  { id: 'poolbil', label: 'Poolbil', kind: 'vehicle', icon: 'car' },
  { id: 'drone', label: 'Drone', kind: 'tool', icon: 'airplane' },
  { id: 'ipad', label: 'Nettbrett', kind: 'device', icon: 'tablet-portrait' },
  { id: 'termokamera', label: 'Termokamera', kind: 'tool', icon: 'thermometer' },
  { id: 'verktoy', label: 'Verktøy', kind: 'tool', icon: 'construct' },
  { id: 'annet', label: 'Annet utstyr', kind: 'other', icon: 'cube' },
];

export const EQUIPMENT_STATUSES = [
  { id: 'available', label: 'Tilgjengelig' },
  { id: 'service', label: 'Service' },
  { id: 'retired', label: 'Ute av drift' },
];

export function equipmentCategory(id) {
  return EQUIPMENT_CATEGORIES.find((row) => row.id === id) || EQUIPMENT_CATEGORIES[EQUIPMENT_CATEGORIES.length - 1];
}
