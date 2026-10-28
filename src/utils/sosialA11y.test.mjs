import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABLE } from '../i18n/strings.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

// UX-funn fra testbot «sosial»: tilgjengelige navn og tilstand, og vei tilbake fra e-postlenken.
test('avkrysningsboksen på oppgaver har navn og avkrysset-tilstand', () => {
  const src = read('screens/v2/RewardsScreen.jsx');
  const box = src.slice(src.indexOf('function TaskCheckbox'), src.indexOf('function ChoreTaskRow'));
  assert.match(box, /accessibilityRole="checkbox"/);
  assert.match(box, /aria-checked=\{!!done\}/);
  assert.match(box, /accessibilityLabel=\{name \? `Ferdig: \$\{name\}` : 'Ferdig'\}/);
  const calls = src.match(/<TaskCheckbox\b[^>]*/g) || [];
  assert.ok(calls.length >= 6);
  for (const call of src.split('<TaskCheckbox').slice(1)) {
    assert.match(call.slice(0, 120), /title=\{(task|t)\.title\}/);
  }
});

test('tannhjulet i notater har et navn', () => {
  assert.match(read('screens/v2/NoteEditorScreen.jsx'), /accessibilityLabel="Notatinnstillinger: deling, arkivering og sletting"/);
});

test('Privat/Bedrift-bryteren sier hvilken side som er valgt (aria-selected)', () => {
  const src = read('components/PlatformSwitch.jsx');
  const seg = src.slice(src.indexOf('function Seg('));
  assert.match(seg, /aria-selected=\{!!active\}/);
  assert.match(seg, /aria-expanded=\{caret \? !!expanded : undefined\}/);
  assert.match(src, /accessibilityRole="menuitem"\s*accessibilityState=\{\{ selected \}\}\s*aria-selected=\{selected\}/);
});

test('/friend-invite har vei tilbake og viser ikke Godta/Avslå for en trukket forespørsel', () => {
  const src = read('screens/v2/FriendInviteRespondScreen.jsx');
  assert.match(src, /<CompactBackLink/);
  assert.match(src, /nav\.canGoBack\?\.\(\) \? nav\.goBack\(\)|if \(nav\.canGoBack\?\.\(\)\) nav\.goBack\(\);\s*else nav\.navigate\('Home', FRIENDS_SHELL\)/);
  assert.match(src, /onSnapshot\(doc\(db, 'users', uid, 'friendRequests', requestId\)/);
  assert.match(src, /status === 'withdrawn' \? t\('friend\.withdrawnBody'\) : t\('friend\.alreadyHandled'\)/);
  assert.match(TABLE.friend.withdrawnBody.nb, /trukket tilbake/);
});
