/**
 * Navnet på den som sender en invitasjon (e-post og SMS). Navnet hentes på serveren fra den
 * innloggede avsenderen, aldri fra fritekst klienten sender (L-33, ANSATT-05):
 * 1. bedriftens egen medarbeiderpost for avsenderen (satt av bedriften), når invitasjonen gjelder en bedrift,
 * 2. profilen (users/{uid}.displayName, parents/{uid}.name),
 * 3. navnet i innloggingen (Auth).
 * Navnet renses: ingen lenker, e-postadresser eller linjeskift, og høyst 60 tegn.
 */

const MAX = 60;

/** Et navn som kan stå i «Ola Nordmann inviterer deg …», eller '' hvis det ikke er et navn. */
export function cleanSenderName(raw) {
  const text = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length < 2) return '';
  // Ingen lenker eller adresser i avsendernavnet (phishing i e-post og SMS).
  if (/@|:\/\/|www\.|[a-z0-9-]\.(no|com|net|org|io|se|dk|info|biz|xyz|app|link)\b/i.test(text)) return '';
  if (/^(bruker|noen|user)$/i.test(text)) return '';
  return text.length > MAX ? `${text.slice(0, MAX - 1).trim()}…` : text;
}

/** Første brukbare navn i prioritert rekkefølge. */
export function pickSenderName(candidates = []) {
  for (const value of candidates) {
    const name = cleanSenderName(value);
    if (name) return name;
  }
  return '';
}

function employeeName(row) {
  const person = row?.person || {};
  return [person.firstName, person.lastName].map((v) => String(v || '').trim()).filter(Boolean).join(' ')
    || String(person.name || row?.name || '').trim();
}

/**
 * Avsenderens navn fra databasen. `familyId`: bedriften invitasjonen gjelder (valgfri).
 * `tokenName`: navnet i Auth-tokenet (req.auth.token.name).
 */
export async function loadSenderName(db, uid, { familyId = '', tokenName = '' } = {}) {
  if (!uid) return pickSenderName([tokenName]);
  const reads = [
    db.doc(`users/${uid}`).get().catch(() => null),
    db.doc(`parents/${uid}`).get().catch(() => null),
    familyId
      ? db.collection(`families/${familyId}/employees`).where('personUid', '==', uid).limit(3).get().catch(() => null)
      : Promise.resolve(null),
  ];
  const [userSnap, parentSnap, employeesSnap] = await Promise.all(reads);
  const user = userSnap?.exists ? userSnap.data() || {} : {};
  const parent = parentSnap?.exists ? parentSnap.data() || {} : {};
  const employees = (employeesSnap?.docs || []).map((row) => row.data() || {});
  return pickSenderName([
    ...employees.map(employeeName),
    user.displayName,
    user.name,
    parent.name,
    tokenName,
  ]);
}
