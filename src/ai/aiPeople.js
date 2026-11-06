/**
 * Hvem kan få tilgang til AI-assistenten, ut fra ansattpostene (families/{c}/employees).
 * Brukes både på AI-abonnement-siden og i gatewayen på serveren, så de er enige.
 *
 * - Bare personer med bruker i ProTop (personUid) kan få tilgang.
 * - Bare personer som er i arbeid nå (employmentState 'active'). Permisjon, passert sluttdato,
 *   deaktivert eller slettet gir ikke tilgang, selv om personen står i listen.
 * - Egne ansatte og innleide/eksterne holdes adskilt: de siste gis tilgang én og én.
 * - Eier og administratorer uten ansattpost regnes som aktive egne ansatte. Har de en
 *   ansattpost, gjelder statusen der som for alle andre.
 */
import {
  displayName, employmentState, isDeletedEmployee, isHiredPersonnel,
} from '../employees/model.js';

/** I arbeid nå. Strengere enn isActiveEmployee, som også regner permisjon som aktiv. */
function workingNow(employee, now) {
  return employmentState(employee, { now }) === 'active';
}

/** Personen bak en bruker: { active, external, name, employeeId }. */
export function aiPersonFor(uid, employees = [], { isAdmin = false, now = new Date() } = {}) {
  const rows = (employees || []).filter((row) => uid && row?.personUid === uid && !isDeletedEmployee(row));
  // Har personen flere poster (f.eks. ny ansettelse), teller den aktive.
  const row = rows.find((r) => workingNow(r, now)) || rows[0] || null;
  if (!row) {
    return { active: !!isAdmin, external: false, name: '', employeeId: '' };
  }
  return {
    // Har personen en ansattpost, avgjør statusen der, også for eier og administratorer.
    active: workingNow(row, now),
    external: isHiredPersonnel(row),
    name: displayName(row),
    employeeId: row.id || '',
  };
}

function emailOf(row) {
  return String(row?.person?.email || row?.company?.email || '').trim();
}

/**
 * Listene på AI-abonnement-siden: alle aktive egne ansatte og alle aktive innleide/eksterne.
 * Hver rad: { key, uid, name, detail, hasUser, external, employeeId }. Sortert på navn.
 * - hasUser false: personen har ikke akseptert invitasjonen (ingen bruker), og kan ikke få
 *   tilgang før det. Raden vises likevel, så administrator ser hvem som mangler.
 * - detail: e-post, så to med samme navn kan skilles.
 * - `admins` ([{ uid, name, email }]) tas med som egne ansatte når de ikke har noen ansattpost.
 */
export function aiCandidates(employees = [], { admins = [], now = new Date() } = {}) {
  const seen = new Set();
  const own = [];
  const external = [];
  for (const row of employees || []) {
    const uid = row?.personUid || '';
    if (!workingNow(row, now) || (uid && seen.has(uid))) continue;
    if (uid) seen.add(uid);
    const item = {
      key: uid || `employee:${row.id || displayName(row)}`,
      uid,
      name: displayName(row),
      detail: emailOf(row),
      hasUser: !!uid,
      external: isHiredPersonnel(row),
      employeeId: row.id || '',
    };
    (item.external ? external : own).push(item);
  }
  const withPost = new Set((employees || []).filter((row) => !isDeletedEmployee(row)).map((row) => row?.personUid).filter(Boolean));
  for (const admin of admins || []) {
    if (!admin?.uid || seen.has(admin.uid) || withPost.has(admin.uid)) continue;
    seen.add(admin.uid);
    own.push({
      key: admin.uid,
      uid: admin.uid,
      name: admin.name || 'Administrator',
      detail: [admin.email, 'Eier eller administrator, uten ansattpost'].filter(Boolean).join(' · '),
      hasUser: true,
      external: false,
      employeeId: '',
    });
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'nb') || a.detail.localeCompare(b.detail, 'nb');
  return { own: own.sort(byName), external: external.sort(byName) };
}
