/**
 * Speiler selskapets tilgangsmatrise til serveren (families/{id}/accessAcl/{uid}).
 *
 * Firestore-reglene kan ikke regne ut nivåer, avvik og overstyringer selv, så en
 * Cloud Function (syncCompanyAccess) beregner hver persons rettigheter med nøyaktig
 * samme kode som appen (resolveActorAccess) og skriver resultatet. Reglene for ISO
 * leser dette dokumentet. Mangler det eller er det utløpt, gis ingen ISO-tilgang.
 *
 * Ren modul – brukes av Cloud Function, av eierens reserve-synk i appen og av tester.
 */
import { accountDeactivated, employeeLevelIds, resolveActorAccess } from '../access/companyAccess.js';

/** Dokumentet utløper og må fornyes. Tilbaketrekking slår da inn senest etter dette. */
export const ACL_TTL_HOURS = 12;

const RANK = { none: 0, see: 1, read: 2, write: 3, delete: 3 };

export function isoRankFromGrant(grant) {
  return RANK[String(grant || 'none')] || 0;
}

export function companyMemberUids(family) {
  const out = new Set();
  for (const key of ['members', 'activeUsers', 'memberIds']) {
    for (const uid of Array.isArray(family?.[key]) ? family[key] : []) {
      if (typeof uid === 'string' && uid) out.add(uid);
    }
  }
  return [...out];
}

export function isCompanyOwner(family, uid) {
  return !!uid && !!family && (family.ownerUid === uid || family.ownerId === uid);
}

/** Rettigheter for én person, i formen reglene leser. */
export function aclFor({ family, employees = [], uid, now = new Date() }) {
  const owner = isCompanyOwner(family, uid);
  const access = resolveActorAccess({
    policy: family?.company?.accessPolicy,
    employees,
    uid,
    bypass: owner,
  });
  const grants = access?.grants && typeof access.grants === 'object' ? { ...access.grants } : {};
  const at = now instanceof Date ? now : new Date(now);
  return {
    uid,
    iso: owner ? 3 : isoRankFromGrant(grants.iso),
    grants,
    levelId: String(access?.levelId || ''),
    owner,
    employeeId: String(access?.employee?.id || ''),
    computedAt: at.toISOString(),
    expiresAt: new Date(at.getTime() + ACL_TTL_HOURS * 3600 * 1000),
  };
}

/**
 * Alle dokumenter som skal finnes, og hvilke som skal bort (personer som ikke lenger er medlemmer).
 * existingUids: uid-ene som har accessAcl-dokument i dag.
 */
export function planAclSync({ family, employees = [], existingUids = [], now = new Date() }) {
  const members = companyMemberUids(family);
  const memberSet = new Set(members);
  const write = members.map((uid) => aclFor({ family, employees, uid, now }));
  const remove = (existingUids || []).filter((uid) => !memberSet.has(uid));
  return { write, remove };
}

/**
 * Administratorlisten (families/{id}.adminUids) følger nivået Administrator i tilgangsstyringen.
 * - Eieren står alltid på listen.
 * - Et medlem med en aktiv ansattpost med nivået Administrator legges til.
 * - En på listen som har koblet ansattpost, men ikke lenger er aktiv administrator (nedgradert,
 *   deaktivert eller slettet), tas bort. Det samme gjelder den som ikke lenger er medlem.
 * - En på listen uten koblet ansattpost røres ikke: det finnes ikke noe nivå å følge.
 */
export function planAdminUids({ family, employees = [] }) {
  const owners = [family?.ownerUid, family?.ownerId].filter((uid) => typeof uid === 'string' && uid);
  const current = (Array.isArray(family?.adminUids) ? family.adminUids : []).filter((uid) => typeof uid === 'string' && uid);
  const members = new Set(companyMemberUids(family));
  const linked = new Map();
  for (const row of employees || []) {
    const uid = String(row?.personUid || '').trim();
    if (!uid) continue;
    linked.set(uid, [...(linked.get(uid) || []), row]);
  }
  const activeAdmin = (uid) => (linked.get(uid) || [])
    .some((row) => !accountDeactivated(row) && employeeLevelIds(row).includes('administrator'));
  const next = [];
  const add = (uid) => { if (!next.includes(uid)) next.push(uid); };
  owners.forEach(add);
  for (const uid of current) {
    if (!members.has(uid)) continue;
    if (linked.has(uid) && !activeAdmin(uid)) continue;
    add(uid);
  }
  for (const uid of members) {
    if (activeAdmin(uid)) add(uid);
  }
  return {
    adminUids: next,
    add: next.filter((uid) => !current.includes(uid)),
    remove: current.filter((uid) => !next.includes(uid)),
  };
}

/** Er ACL-dokumentet gyldig nå? (samme sjekk som reglene gjør) */
export function aclIsFresh(acl, now = new Date()) {
  if (!acl) return false;
  const exp = acl.expiresAt?.toDate ? acl.expiresAt.toDate() : (acl.expiresAt ? new Date(acl.expiresAt) : null);
  return !!exp && exp.getTime() > (now instanceof Date ? now : new Date(now)).getTime();
}
