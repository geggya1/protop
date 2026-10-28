// Alert.alert gjør ingenting på web (react-native-web). Skjermene under er en del av
// ProTop-flytene på protop.no og skal vise feil via src/utils/dialog.js eller i skjemaet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCREENS = [
  'screens/RegisterScreen.jsx',
  'screens/VerifyEmailScreen.jsx',
  'screens/FamilyInviteRespondScreen.jsx',
  'screens/settings/GroupSettingsScreen.jsx',
  'screens/onboarding/AuthChoiceScreen.jsx',
  'screens/EmailActionScreen.jsx',
  'screens/ConfirmationScreen.jsx',
  'screens/FamilyOverviewScreen.jsx',
  'screens/v2/FriendQrScreen.jsx',
  'screens/v2/ParentTaskScreen.jsx',
];

function read(rel) {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

test('ProTop-skjermene bruker ikke Alert.alert direkte', () => {
  for (const rel of SCREENS) {
    const code = read(rel).replace(/\/\/.*$/gm, '');
    assert.equal(/\bAlert\.alert\(/.test(code), false, `${rel} kaller Alert.alert`);
  }
});

test('Registrering viser feil i skjemaet', () => {
  const code = read('screens/RegisterScreen.jsx');
  assert.match(code, /setSubmitError\(msg\)/);
  assert.match(code, /auth\/network-request-failed/);
  assert.match(code, /\{!!submitError && \(/);
});

test('Sletting av oppgave spør via confirmUser', () => {
  const code = read('screens/v2/ParentTaskScreen.jsx');
  assert.match(code, /await confirmUser\('Slett oppgave'/);
});
