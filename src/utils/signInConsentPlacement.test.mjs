/**
 * Innlogging (EGEN-02): samtykket står over knappene, så første trykk på «Logg inn»
 * ikke gir feil, og en versjon som allerede er godtatt på enheten huskes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acceptedConsentRecord, consentsComplete } from './consentState.js';

const login = readFileSync(new URL('../../screens/LoginScreen.jsx', import.meta.url), 'utf8');
const consentAt = login.indexOf('<SignInLegalConsent');
assert.ok(consentAt > 0, 'innloggingen har samtykket');
assert.ok(consentAt < login.indexOf('<SocialAuthButtons'), 'samtykket står over Google/Microsoft');
assert.ok(consentAt < login.indexOf('onPress={handleLogin}'), 'samtykket står over «Logg inn»');
assert.equal((login.match(/<SignInLegalConsent/g) || []).length, 1, 'bare ett samtykke på kortet');
assert.match(login, /remembered=\{legalRemembered\}/);
assert.match(login, /consentsComplete\(stored\)/, 'bare gjeldende versjon huskes');

// Gjeldende versjon er komplett; en eldre versjon må godtas på nytt.
assert.equal(consentsComplete(acceptedConsentRecord('nb', null)), true);
assert.equal(consentsComplete({ ...acceptedConsentRecord('nb', null), version: '2.0.0' }), false);

// Registrering og «Logg inn eller lag profil» har samtykket over sendeknappen fra før.
const register = readFileSync(new URL('../../screens/RegisterScreen.jsx', import.meta.url), 'utf8');
assert.ok(register.indexOf('<SignInLegalConsent') < register.indexOf('onPress={handleRegister}'));

console.log('signInConsentPlacement.test.mjs ok');
