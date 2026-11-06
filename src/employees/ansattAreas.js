/**
 * Den røde tråden i Bedrift › Ansatt: hvert område har samme navn, ikon og farge overalt
 * (menyen, Min side, Gjøremål, Innstillinger, snarveier). Ikonene følger ANSATT_MENU.
 * Fargene er mettede nok til å leses i både lyst og mørkt utseende, og brukes med tint()
 * for myke flater.
 * Ren modul – brukes av skjermene og testene.
 */

export const ANSATT_AREAS = {
  home: { id: 'home', label: 'Min side', icon: 'person-circle', color: '#0284c7' },
  todo: { id: 'todo', label: 'Gjøremål', icon: 'checkbox', color: '#2563eb' },
  hours: { id: 'hours', label: 'Timer', icon: 'time', color: '#7c3aed' },
  absence: { id: 'absence', label: 'Fravær', icon: 'sunny', color: '#d97706' },
  expenses: { id: 'expenses', label: 'Utlegg', icon: 'card', color: '#16a34a' },
  mileage: { id: 'mileage', label: 'Kjørebok', icon: 'car', color: '#0891b2' },
  projects: { id: 'projects', label: 'Prosjekter', icon: 'layers', color: '#db2777' },
  settings: { id: 'settings', label: 'Innstillinger', icon: 'settings', color: '#475569' },
};

export function ansattArea(id) {
  return ANSATT_AREAS[id] || ANSATT_AREAS.home;
}

/** Farge med gjennomsiktighet, for myke flater. Bare #rrggbb, ellers fargen som den er. */
export function tint(color, alpha) {
  const raw = String(color || '');
  if (!/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `${raw}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
}

function hours(value) {
  const n = Math.round((Number(value) || 0) * 10) / 10;
  return `${String(n).replace('.', ',')} t`;
}

/**
 * Flisene øverst på Min side: ett område per flis, med tallet som betyr mest der nå.
 * Bare områder med en vei inn (handler) tas med, i fast rekkefølge.
 *   todo: { open, urgent } | null   week: { worked, planned } | null
 *   absenceDays: tall | null        profilePct: tall | null
 */
export function ansattTiles({
  todo = null, week = null, absenceDays = null, profilePct = null, open = {},
} = {}) {
  const tiles = [];
  if (open.todo) {
    const count = todo ? todo.open : null;
    tiles.push({
      ...ANSATT_AREAS.todo,
      value: count == null ? '…' : String(count),
      caption: count == null ? 'Henter …' : (count ? `${count === 1 ? 'punkt' : 'punkter'} venter` : 'Alt er på plass'),
      alert: !!(todo && todo.urgent),
      onPress: open.todo,
    });
  }
  if (open.hours) {
    tiles.push({
      ...ANSATT_AREAS.hours,
      label: 'Timer denne uken',
      value: week ? hours(week.worked) : '…',
      caption: week && week.planned ? `av ${hours(week.planned)} planlagt` : 'Før timer',
      progress: week && week.planned ? Math.min(1, week.worked / week.planned) : null,
      onPress: open.hours,
    });
  }
  if (open.absence) {
    tiles.push({
      ...ANSATT_AREAS.absence,
      label: 'Fravær i år',
      value: absenceDays == null ? '…' : String(absenceDays).replace('.', ','),
      caption: 'dager, ferie inkludert',
      onPress: open.absence,
    });
  }
  if (open.expenses) {
    tiles.push({ ...ANSATT_AREAS.expenses, value: '', caption: 'Registrer og se utlegg', onPress: open.expenses });
  }
  if (open.mileage) {
    tiles.push({ ...ANSATT_AREAS.mileage, value: '', caption: 'Registrer kjøretur', onPress: open.mileage });
  }
  if (open.settings) {
    tiles.push({
      ...ANSATT_AREAS.settings,
      value: profilePct == null ? '' : `${profilePct} %`,
      caption: profilePct == null ? 'Profil og konto' : (profilePct >= 100 ? 'Profilen er komplett' : 'av profilen er utfylt'),
      progress: profilePct == null ? null : profilePct / 100,
      onPress: open.settings,
    });
  }
  return tiles;
}
