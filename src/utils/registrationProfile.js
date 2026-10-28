/**
 * Profilen som lagres ved registrering med e-post og passord (UX-30).
 * Navnet kommer fra registreringsskjemaet, så profilsteget («Velkommen») hoppes over.
 * Kjønn spørres ikke om; det kan legges inn under profilen senere.
 * Samme felt som profilsteget skriver (screens/onboarding/ProfileSetupScreen.jsx).
 * Samtykket lagres for seg (persistUserConsents), som i profilsteget.
 */
export function registrationProfile({
  uid, name, email, username = '', language = 'nb', joinInvite = null,
}) {
  const displayName = String(name || '').trim();
  const profile = {
    uid,
    role: 'adult',
    displayName,
    username,
    usernameLower: username,
    email: String(email || '').trim().toLowerCase(),
    phone: '',
    birthday: '',
    age: null,
    gender: 'unspecified',
    location: null,
    photoURL: '',
    avatarId: '',
    language,
    profileComplete: !!displayName,
  };
  if (joinInvite) profile.joinInvite = joinInvite;
  return profile;
}
