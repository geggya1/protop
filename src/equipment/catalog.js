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

/**
 * Kontroller på utstyr (ISO 9001 7.1.5 og forskrift om utførelse av arbeid, sakkyndig kontroll).
 * blocks: utstyret kan ikke reserveres etter at fristen er passert.
 */
export const CONTROL_KINDS = [
  { id: 'kalibrering', label: 'Kalibrering', blocks: true, hint: 'Måleutstyr: totalstasjon, laser, fuktmåler, momentnøkkel, gassmåler' },
  { id: 'sakkyndig', label: 'Sakkyndig kontroll', blocks: true, hint: 'Løfteutstyr, stillas, lift og maskiner med krav om sakkyndig kontroll' },
  { id: 'eu', label: 'EU-kontroll', blocks: true, hint: 'Periodisk kjøretøykontroll' },
  { id: 'service', label: 'Service', blocks: false, hint: 'Planlagt vedlikehold' },
];

export function controlKind(id) {
  return CONTROL_KINDS.find((row) => row.id === id) || CONTROL_KINDS[3];
}

export function equipmentGroup(id) {
  const direct = EQUIPMENT_GROUPS.find((row) => row.id === id);
  if (direct) return direct;
  const fromCategory = EQUIPMENT_CATEGORIES.find((row) => row.id === id);
  return EQUIPMENT_GROUPS.find((row) => row.id === fromCategory?.group) || EQUIPMENT_GROUPS[1];
}
