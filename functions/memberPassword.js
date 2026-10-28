/**
 * Hvem kan sette passord på en annen konto (setMemberPassword).
 *
 * Bare underkontoer som gruppen har laget: barn og voksne uten egen e-post, som logger inn
 * med brukernavn (brukernavn-e-post på konto.protop.no) og bare har passord som innlogging.
 * Den som setter passordet må være eier eller administrator (ownerUid/adminUids) i alle
 * gruppene kontoen er med i, og kontoen må være et aktivt medlem av gruppen.
 * En konto med egen e-post, eller med Google, Microsoft eller Apple, bytter passord selv
 * med «Glemt passord».
 *
 * Ren modul – brukes av functions/authCallables.js og av tester.
 */
import { isSyntheticEmail } from '../src/utils/usernamesLogic.js';
import { isFamilyOwnerOrAdmin, listedOnFamily, memberDocGrantsAccess } from './security.js';

/** Brukernavn-konto med bare passord som innlogging. */
export function isGroupSubAccount(authUser) {
  if (!authUser || !isSyntheticEmail(authUser.email)) return false;
  const providers = (authUser.providerData || []).map((row) => row?.providerId).filter(Boolean);
  return providers.every((id) => id === 'password');
}

const NOT_IN_GROUP = 'Personen er ikke i gruppen.';
const OWN_LOGIN = 'Personen har egen innlogging og må bytte passord selv med «Glemt passord».';
const NOT_ADMIN = 'Bare administrator i alle gruppene personen er med i kan bytte passordet.';

/**
 * Avgjør om caller kan sette passord på uid i familyId.
 * family: gruppen. memberDoc: families/{familyId}/children|parents/{uid} (data eller null).
 * groups: alle grupper kontoen er med i ({ id, ...data }). authUser: Auth-kontoen til uid.
 */
export function memberPasswordDecision({
  caller, uid, family, memberDoc, groups = [], authUser,
} = {}) {
  if (!caller || !uid) return { ok: false, error: 'Du må være innlogget.' };
  if (uid === caller) {
    return isGroupSubAccount(authUser) ? { ok: true } : { ok: false, error: OWN_LOGIN };
  }
  if (!family) return { ok: false, error: NOT_IN_GROUP };
  if (!isFamilyOwnerOrAdmin(family, caller)) return { ok: false, error: 'Bare admin kan gjøre dette.' };
  if (family.ownerUid === uid || family.ownerId === uid) return { ok: false, error: OWN_LOGIN };
  if (!listedOnFamily(family, uid) || !memberDoc || !memberDocGrantsAccess(memberDoc)) {
    return { ok: false, error: NOT_IN_GROUP };
  }
  for (const group of groups) {
    if (!group || group.deleted === true) continue;
    // Eier eller administrator av en gruppe er en egen voksen konto.
    if (group.ownerUid === uid || group.ownerId === uid) return { ok: false, error: OWN_LOGIN };
    if (!isFamilyOwnerOrAdmin(group, caller)) return { ok: false, error: NOT_ADMIN };
    if (Array.isArray(group.adminUids) && group.adminUids.includes(uid)
      && group.ownerUid !== caller && group.ownerId !== caller) {
      return { ok: false, error: NOT_ADMIN };
    }
  }
  if (!isGroupSubAccount(authUser)) return { ok: false, error: OWN_LOGIN };
  return { ok: true };
}
