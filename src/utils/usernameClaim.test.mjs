/**
 * SEC-19 (rest): brukernavn tas på serveren (claimUsername), ett aktivt navn per konto.
 * Appen skriver ikke usernames/{navn} selv. Den gamle veien står i reglene til en fast dato.
 * Serveren testes i functions/usernameClaim.emulator.test.mjs, reglene i tests/rules/usernames.rules.test.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('appen tar brukernavn via claimUsername på serveren', () => {
  const src = read('src/utils/usernames.js');
  assert.match(src, /httpsCallable\(functions, 'claimUsername'/);
  assert.doesNotMatch(src, /runTransaction|tx\.set\(/, 'ingen direkte skriving av usernames');
  // Et voksent navn tas bare av kontoen selv (familieadmin som lager en voksen konto, får ikke navnet selv).
  assert.match(src, /type !== 'child' && auth\?\.currentUser\?\.uid && auth\.currentUser\.uid !== uid/);
});

test('ingen skjerm skriver usernames/{navn} direkte', () => {
  const offenders = [];
  for (const dir of ['src', 'screens', 'components']) {
    for (const rel of readdirSync(join(root, dir), { recursive: true })) {
      if (!/\.(js|jsx)$/.test(rel) || /\.test\./.test(rel)) continue;
      const code = readFileSync(join(root, dir, rel), 'utf8');
      if (/(setDoc|updateDoc|tx\.set|tx\.update|batch\.set)\(\s*doc\(db,\s*'usernames'/.test(code)) offenders.push(`${dir}/${rel}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('profilsteget og registreringen lagrer profilen også når navnet ikke kan tas', () => {
  const setup = read('screens/onboarding/ProfileSetupScreen.jsx');
  assert.match(setup, /try \{\s*uname = await claimUsername\(/);
  assert.match(read('screens/RegisterScreen.jsx'), /username = await claimUsername\(/);
});

test('reglene: direkte opprettelse har en sluttdato, og callablen ligger i slim-deployen', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /function legacyUsernameCreate\(\) \{\s*return request\.time < timestamp\.date\(2027, 3, 1\);/);
  assert.match(rules, /allow create: if isSignedIn\(\) && usernameDocOk\(name\) && legacyUsernameCreate\(\)/);
  assert.match(read('scripts/deploy-slim-functions.sh'), /functions:claimUsername/);
  assert.match(read('functions/membershipIndex.js'), /export \{ claimUsername \} from '\.\/usernameClaim\.js'/);
  assert.match(read('docs/utrulling-regler.md'), /SEC-19/);
});
