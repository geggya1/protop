import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legacyNewNoteState, legacyRegisterInvitedState } from './legacyPaths.js';

test('/register-invited går til vanlig registrering, også uten parametre', () => {
  assert.deepEqual(legacyRegisterInvitedState('/register-invited'), {
    routes: [{ name: 'Register', params: {} }],
  });
  assert.deepEqual(legacyRegisterInvitedState('/register-invited?email=Kari@Firma.no&familyId=f1&name=Kari'), {
    routes: [{ name: 'Register', params: { email: 'kari@firma.no', familyId: 'f1' } }],
  });
  assert.deepEqual(legacyRegisterInvitedState('register-invited/', { signedIn: true }), {
    routes: [{ name: 'Home' }],
  });
  assert.equal(legacyRegisterInvitedState('/register'), null);
  assert.equal(legacyRegisterInvitedState('/hjem'), null);
});

test('/note/new åpner Notater med nytt notat, ikke barnas dagsnotat', () => {
  assert.deepEqual(legacyNewNoteState('/note/new'), {
    routes: [{ name: 'Home', params: { openShell: { tab: 'notes', subView: null, intent: 'create' } } }],
  });
  assert.ok(legacyNewNoteState('note/new?x=1'));
  assert.equal(legacyNewNoteState('/note/newer'), null);
  assert.equal(legacyNewNoteState('/hjem/notes'), null);
});

test('linking peker ikke lenger på de gamle skjermene', () => {
  const linking = readFileSync(new URL('./linking.js', import.meta.url), 'utf8');
  assert.equal(linking.includes("RegisterInvitedUser: 'register-invited'"), false);
  assert.equal(linking.includes("AddNote: 'note/new'"), false);
  assert.match(linking, /legacyRegisterInvitedState\(path, \{ signedIn: linkingSignedIn \}\)/);
  assert.match(linking, /legacyNewNoteState\(path\)/);
  const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
  assert.equal(app.includes('RegisterInvitedUserScreen'), false);
  // Notater åpner opprettingen når skallet får intent «create».
  const hub = readFileSync(new URL('../../screens/v2/NotesHubScreen.jsx', import.meta.url), 'utf8');
  assert.match(hub, /shellIntent !== 'create'/);
});
