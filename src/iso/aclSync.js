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
import { resolveActorAccess } from '../access/companyAccess.js';

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

/** Er ACL-dokumentet gyldig nå? (samme sjekk som reglene gjør) */
export function aclIsFresh(acl, now = new Date()) {
  if (!acl) return false;
  const exp = acl.expiresAt?.toDate ? acl.expiresAt.toDate() : (acl.expiresAt ? new Date(acl.expiresAt) : null);
  return !!exp && exp.getTime() > (now instanceof Date ? now : new Date(now)).getTime();
}
