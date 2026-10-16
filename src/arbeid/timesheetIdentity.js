/**
 * På mobil er navnet én linje, i både timeliste og når det er personlig.
 * På stor skjerm under Arbeid står navnet større, og admin kan bla mellom ansatte.
 */

export function timesheetCrumb({ personal = false, locked = false, companyLabel = '' } = {}) {
  if (personal) {
    const name = String(companyLabel || '').trim();
    return name ? `Timeliste · ${name}` : 'Timeliste';
  }
  return locked ? 'Ansatte / Timeføring' : 'Arbeid / Timeføring';
}

export function timesheetIdentity({ personal = false, compact = false } = {}) {
  if (compact) {
    return { fontSize: 15, fontWeight: '600', numberOfLines: 1, avatar: 22, icon: 12 };
  }
  if (personal) {
    return { fontSize: 13, fontWeight: '600', numberOfLines: 1, avatar: 20, icon: 12 };
  }
  return { fontSize: 22, fontWeight: '700', numberOfLines: undefined, avatar: 32, icon: 16 };
}

export function canSwitchTimesheetPerson({ personal = false, locked = false, manager = false } = {}) {
  return !personal && !locked && !!manager;
}

/**
 * Steg 1 før timeliste/timesaldo: leder må velge person først.
 * `chosen === false` holder steget oppe selv om en id allerede er satt,
 * så timesaldo ikke kan hoppe rett til tabellen.
 */
export function needsTimesheetPersonStep({
  personal = false,
  locked = false,
  manager = false,
  employeeId = '',
  chosen = null,
} = {}) {
  if (!canSwitchTimesheetPerson({ personal, locked, manager })) return false;
  if (chosen != null) return !chosen;
  return !String(employeeId || '').trim();
}
