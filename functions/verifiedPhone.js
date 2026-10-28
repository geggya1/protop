/**
 * Telefonoppslag ved invitasjon (REV-22). Bare et nummer kontoen har bekreftet med SMS teller:
 * Firebase Auth phoneNumber (telefoninnlogging). users.phone og parents.phone skriver brukeren
 * selv, så en annen kunne ført opp nummeret ditt og fått invitasjonen som var ment for deg.
 * Ren modul: auth er Admin Auth (getUserByPhoneNumber), eller en erstatning i tester.
 */

/** Auth lagrer telefonnummer som E.164 (+ og 8–15 sifre). Andre former slås ikke opp. */
export function e164Candidates(candidates) {
  const out = [];
  for (const raw of candidates || []) {
    const value = String(raw || '').trim();
    if (/^\+[1-9]\d{7,14}$/.test(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * uid-en til kontoen som har bekreftet ett av numrene, eller ''. Feiler oppslaget i Auth, gis
 * ingen treff (aldri et nummer fra profilen i stedet); den som inviterer, sender da SMS-invitasjon.
 */
export async function findVerifiedPhoneUid(candidates, auth) {
  if (!auth || typeof auth.getUserByPhoneNumber !== 'function') return '';
  for (const phone of e164Candidates(candidates)) {
    try {
      const user = await auth.getUserByPhoneNumber(phone);
      if (user?.uid && user.phoneNumber === phone) return user.uid;
    } catch (error) {
      if (error?.code === 'auth/user-not-found') continue;
      return '';
    }
  }
  return '';
}
