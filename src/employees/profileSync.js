/**
 * «Rediger profil» (DS-07): navn, bilde og telefon er personens egne, med users/{uid} som
 * fasit. syncMyProfile (functions/profileSync.js) legger dem på medlemskapet i hvert selskap
 * (families/{id}/parents/{uid}) og på ansattkortet som er koblet til personen
 * (families/{id}/employees/{empId}.person).
 *
 * Ansattkortet eies av bedriften. Et felt der oppdateres bare når det er tomt, eller når det
 * er likt det personen hadde før (det fulgte profilen), så HR sitt fulle navn eller et
 * jobbnummer ikke byttes ut med et kallenavn. Avsluttede medlemskap og ansettelser får ikke
 * nye opplysninger.
 * Rene funksjoner, brukt av callablen og testene.
 */
import { isActiveEmployee } from './employmentState.js';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function fold(value) {
  return text(value).toLocaleLowerCase('nb-NO');
}

/** Profilfeltene fra users/{uid} (og det klienten nettopp lagret). */
export function profileFromUser(user = {}) {
  return {
    name: text(user?.displayName || user?.name).slice(0, 120),
    photoURL: text(user?.photoURL || user?.photoUrl).slice(0, 2000),
    phone: text(user?.phone).slice(0, 40),
    avatarId: text(user?.avatarId).slice(0, 40),
  };
}

/** Det personen hadde før (klienten sender verdiene skjermen åpnet med). */
export function previousProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return profileFromUser({ displayName: raw.name, photoURL: raw.photoURL, phone: raw.phone, avatarId: raw.avatarId });
}

/** Et medlemskap som fortsatt gir tilgang (samme regel som memberDocGrantsAccess på serveren). */
export function memberStillActive(member) {
  if (!member || typeof member !== 'object') return false;
  if (member.deleted === true || member.leftAt != null) return false;
  if (member.placeholder === true || member.inviteStatus === 'pending') return false;
  return member.active !== false;
}

/** Endringene på medlemsdokumentet, eller null. */
export function memberProfilePatch(member, profile) {
  if (!memberStillActive(member) || !profile?.name) return null;
  const patch = {};
  if (text(member.name) !== profile.name) patch.name = profile.name;
  if (text(member.photoURL) !== profile.photoURL) patch.photoURL = profile.photoURL;
  if (profile.avatarId && text(member.avatarId) !== profile.avatarId) patch.avatarId = profile.avatarId;
  if (profile.phone && text(member.phone) !== profile.phone) patch.phone = profile.phone;
  return Object.keys(patch).length ? patch : null;
}

/** «Geir Ove Andersen» → fornavn «Geir Ove», etternavn «Andersen». */
export function splitPersonName(name) {
  const parts = text(name).split(' ').filter(Boolean);
  if (!parts.length) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), middleName: '', lastName: parts[parts.length - 1] };
}

function personFullName(person = {}) {
  return [person.firstName, person.middleName, person.lastName].map(text).filter(Boolean).join(' ');
}

/** Feltet fulgte profilen: tomt, eller likt en verdi personen hadde før. */
function following(current, befores) {
  const now = fold(current);
  return !now || befores.some((before) => !!fold(before) && now === fold(before));
}

/**
 * Endringene på ansattkortets person, eller null. previous: profilen før endringen, én eller
 * flere (fra klienten og fra medlemsdokumentet i selskapet).
 */
export function employeePersonPatch(employee, profile, previous = null) {
  if (!employee || !profile?.name || !isActiveEmployee(employee)) return null;
  const befores = (Array.isArray(previous) ? previous : [previous]).filter(Boolean);
  const pick = (key) => befores.map((row) => row?.[key]);
  const person = employee.person || {};
  const patch = {};
  const fullName = personFullName(person);
  if (fold(fullName) !== fold(profile.name) && following(fullName, pick('name'))) {
    Object.assign(patch, splitPersonName(profile.name));
  }
  if (profile.photoURL && text(person.photoUrl) !== profile.photoURL && following(person.photoUrl, pick('photoURL'))) {
    patch.photoUrl = profile.photoURL;
  }
  if (profile.phone && text(person.phone) !== profile.phone && following(person.phone, pick('phone'))) {
    patch.phone = profile.phone;
  }
  return Object.keys(patch).length ? patch : null;
}
