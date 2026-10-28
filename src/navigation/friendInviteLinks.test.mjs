import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFriendInviteFromPath, registerFriendInviteParams } from './friendInviteLinks.js';

test('/register?friendInvite=… er en invitasjon til ny bruker, ikke et svar (SOS-01)', () => {
  const path = '/register?friendInvite=dbd5530&email=nina%40protop.test';
  assert.equal(parseFriendInviteFromPath(path), null);
  assert.deepEqual(registerFriendInviteParams(path), { friendInvite: 'dbd5530', email: 'nina@protop.test' });
  assert.deepEqual(registerFriendInviteParams('register/?friendInvite=t1'), { friendInvite: 't1' });
  assert.deepEqual(registerFriendInviteParams('/register?friendInvite=t1&email=Nina@Firma.NO'), {
    friendInvite: 't1',
    email: 'nina@firma.no',
  });
  assert.equal(registerFriendInviteParams('/register'), null);
  assert.equal(registerFriendInviteParams('/register?email=a%40b.no'), null);
  assert.equal(registerFriendInviteParams('/hjem?friendInvite=t1'), null);
  // Innlogging eier også ?friendInvite=.
  assert.equal(parseFriendInviteFromPath('/login?friendInvite=t1'), null);
  assert.equal(parseFriendInviteFromPath('/signup?friendInvite=t1'), null);
});

test('svarlenkene virker som før', () => {
  assert.deepEqual(parseFriendInviteFromPath('/friend-invite/abc123'), { requestId: 'abc123', token: '' });
  assert.deepEqual(parseFriendInviteFromPath('friend-invite/a%20b?token=tok'), { requestId: 'a b', token: 'tok' });
  assert.deepEqual(parseFriendInviteFromPath('/hjem?friendInvite=req9'), { requestId: 'req9', token: '' });
  assert.deepEqual(parseFriendInviteFromPath('/?requestId=req9&token=x'), { requestId: 'req9', token: 'x' });
  assert.equal(parseFriendInviteFromPath('/hjem'), null);
  assert.equal(parseFriendInviteFromPath('/my-friends'), null);
});

test('linking og invitasjonsvinduet bruker samme tolkning', () => {
  const linking = readFileSync(new URL('./linking.js', import.meta.url), 'utf8');
  assert.match(linking, /from '\.\/friendInviteLinks\.js'/);
  assert.doesNotMatch(linking, /function parseFriendInviteFromPath/);
  // Utlogget går registreringslenken til Register med token og e-post.
  assert.match(linking, /registerInvite && !linkingSignedIn/);
  const overlay = readFileSync(new URL('../../components/InviteRespondOverlay.jsx', import.meta.url), 'utf8');
  assert.match(overlay, /parseFriendInviteFromPath\(/);
  assert.doesNotMatch(overlay, /params\.get\('friendInvite'\)/);
  // Registreringen godtar invitasjonen via serveren etter at kontoen er laget.
  const register = readFileSync(new URL('../../screens/RegisterScreen.jsx', import.meta.url), 'utf8');
  assert.match(register, /claimPendingFriendInvite\(\{/);
  assert.match(register, /const friendInvite = String\(p\.friendInvite \|\| qs\.friendInvite/);
  // Verdiene holdes fast selv om ruten nullstilles, og overlever en omlasting i samme fane.
  assert.match(register, /setInvite\(\(prev\) => keepInviteParams\(prev, readInviteParams\(route\)\)\)/);
  assert.match(register, /storeFriendInvite\(\{ friendInvite: invite\.friendInvite, email: invite\.email \}\)/);
  assert.match(register, /friendInvite \|\| String\(stored\.friendInvite/);
  assert.match(register, /storeFriendInvite\(null\);/);
});
