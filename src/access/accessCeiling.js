/**
 * Tak for hvem som kan endre tilgang, og hvor høyt.
 *
 * - Eieren av selskapet kan alt.
 * - Ingen andre kan endre sin egen tilgang (verken nivå, avvik eller status).
 * - Den som endrer andres tilgang, kan aldri gi mer enn hen har selv, område for område.
 * - Den som har mer tilgang enn deg i et område, kan du ikke endre.
 *
 * Hvem som i det hele tatt kan endre personer, styres av «Tilgangsstyring» i matrisen:
 * Begrenset redigering = endre personer (Øverste leder har det som standard),
 * Admin = også endre selve nivåene. Admin settes individuelt etter selskapets ønske.
 *
 * Ren modul – brukes av tilgangsstyringen og testene.
 */
import {
  ACCESS_LEVELS,
  RESOURCE_IDS,
  grantsForEmployee,
  levelById,
  levelGrants,
  rankValue,
} from './companyAccess.js';

/** «delete» er eldre lagring av Admin og telles som Admin. */
function rankOf(grant) {
  return Math.min(rankValue(grant), 3);
}

/** Områdene der `grants` gir mer enn `ceiling`. */
export function grantsAbove(grants, ceiling) {
  return RESOURCE_IDS.filter((id) => rankOf(grants?.[id]) > rankOf(ceiling?.[id]));
}

export function isSelf(actor, employee) {
  const uid = String(actor?.uid || '');
  return !!uid && !!employee && String(employee.personUid || '') === uid;
}

const SELF = 'Du kan ikke endre din egen tilgang. Be eieren av selskapet om det.';

/**
 * Kan aktøren lagre denne endringen på en person?
 * before = personen slik den er lagret, after = slik den blir.
 */
export function checkPersonChange({ actor, policy, before, after }) {
  if (actor?.bypass) return { ok: true };
  if (isSelf(actor, before) || isSelf(actor, after)) return { ok: false, reason: SELF };
  const ceiling = actor?.grants || {};
  if (before && grantsAbove(grantsForEmployee(policy, before), ceiling).length) {
    return { ok: false, reason: 'Personen har høyere tilgang enn deg på ett eller flere områder. Bare eieren eller en med minst like høy tilgang kan endre den.' };
  }
  if (after && grantsAbove(grantsForEmployee(policy, after), ceiling).length) {
    return { ok: false, reason: 'Du kan ikke gi høyere tilgang enn du har selv.' };
  }
  return { ok: true };
}

/** Kan aktøren sette dette nivået på personen (krysse av / flytte dit)? */
export function canGrantLevel({ actor, policy, levelId }) {
  if (actor?.bypass) return true;
  if (!levelById(levelId)) return false;
  return grantsAbove(levelGrants(policy, levelId), actor?.grants || {}).length === 0;
}

/** Nivåene aktøren kan gi andre. */
export function grantableLevels({ actor, policy }) {
  return ACCESS_LEVELS.filter((level) => canGrantLevel({ actor, policy, levelId: level.id }));
}

/**
 * Kan aktøren sette en celle i et nivå (eller i en persons avvik) til `grant`?
 * Å senke er alltid lov; å heve går bare opp til aktørens eget trinn i området.
 */
export function canSetGrant({ actor, resourceId, grant, current = 'none' }) {
  if (actor?.bypass) return true;
  if (rankOf(grant) <= rankOf(current)) return true;
  return rankOf(grant) <= rankOf(actor?.grants?.[resourceId]);
}

/** Høyeste trinn (0–3) aktøren kan sette i et område. */
export function grantCeiling(actor, resourceId) {
  if (actor?.bypass) return 3;
  return rankOf(actor?.grants?.[resourceId]);
}
