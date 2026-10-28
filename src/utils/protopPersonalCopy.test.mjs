import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABLE } from '../i18n/strings.js';
import { synligForSummary, wholeGroupLabel } from './eventSharing.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

// UX-funn fra testbot «sosial»: familierester i de personlige ProTop-modulene.
test('Venner: tekstene nevner ikke familien eller familieplattformen', () => {
  const f = TABLE.friend;
  for (const key of ['subtitle', 'friendsHint', 'privacyNotice', 'removeBody', 'addLead', 'pendingQrBody']) {
    assert.doesNotMatch(f[key].nb, /famili|spill|album/i, key);
    assert.doesNotMatch(f[key].en, /famil|games|albums/i, key);
  }
  assert.match(f.removeBody.nb, /Bedriften/);
  // QR-teksten peker på knappen slik den faktisk heter.
  assert.match(f.addFromQrLead.nb, new RegExp(`«${f.sendInvite.nb}»`));
  assert.match(f.pendingQrBody.nb, new RegExp(`«${f.sendInvite.nb}»`));
  assert.doesNotMatch(f.addFromQrLead.nb, /trykk Inviter/);
  // Hjelpen bruker samme navn som knappen.
  assert.match(read('src/help/protopPages.js'), new RegExp(`«${f.myQrShort.nb}» viser en kode`));
});

test('Legg til venn forklarer ugyldig e-post og brukernavn', () => {
  const src = read('screens/v2/AddFriendScreen.jsx');
  assert.match(src, /classified\.kind === 'invalid-email' \? \(/);
  assert.match(src, /t\('friend\.identifierInvalidUsername'\)/);
  assert.ok(TABLE.friend.identifierInvalidUsername.nb.length > 10);
});

test('Kalender: «Alle i bedriften» i en bedrift', () => {
  assert.equal(wholeGroupLabel('company'), 'Alle i bedriften');
  assert.equal(wholeGroupLabel('family'), 'Hele familien');
  assert.equal(synligForSummary({ wholeFamily: true, groupType: 'company' }), 'Synlig for: alle i bedriften');
  assert.equal(synligForSummary({ wholeFamily: true }), 'Synlig for: hele familien');
  const form = read('screens/v2/EventFormScreen.jsx');
  assert.doesNotMatch(form, />Hele familien</);
  assert.match(form, /wholeGroupLabel\(family\?\.type\)/);
  const plan = read('screens/v2/PlanScreen.jsx');
  assert.match(plan, /isProtopShellModule\('meals'\) \? \[\['meals', 'Mat'\]\] : \[\]/);
  const settings = read('screens/v2/CalendarSettingsScreen.jsx');
  assert.match(settings, /isParent && activeKids\.length > 0 \? \(/);
});

test('Oppgaver: ingen belønning eller familiemedlemmer', () => {
  for (const rel of ['screens/v2/ParentTaskScreen.jsx', 'screens/v2/RewardsScreen.jsx']) {
    const src = read(rel);
    assert.doesNotMatch(src, /belønningsprogram|uten belønning|Inviter familiemedlemmer|'Hele familien'/, rel);
  }
});
