/**
 * Personlig timeliste viser et lite navn. Under Arbeid står navnet som før,
 * og admin kan bla mellom ansatte.
 */

export function timesheetCrumb({ personal = false, locked = false, companyLabel = '' } = {}) {
  if (personal) {
    const name = String(companyLabel || '').trim();
    return name ? `Timeliste · ${name}` : 'Timeliste';
  }
  return locked ? 'Ansatte / Timeføring' : 'Arbeid / Timeføring';
}

export function timesheetIdentity({ personal = false } = {}) {
  if (personal) {
    return { fontSize: 13, fontWeight: '600', numberOfLines: 2, avatar: 20, icon: 12 };
  }
  return { fontSize: 22, fontWeight: '700', numberOfLines: undefined, avatar: 32, icon: 16 };
}

export function canSwitchTimesheetPerson({ personal = false, locked = false, manager = false } = {}) {
  return !personal && !locked && !!manager;
}
