/**
 * Hvem er administrator i en gruppe (REV-19): appen bruker samme kilde som serveren og reglene,
 * eier og adminUids. admin/superAdmin på medlemsdokumentet gir ikke admin-knapper.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isGroupAdmin, isTeamAdmin } from './groupLifecycleLogic.js';
// Serverens regel (canApproveJoin, assertFamilyAdmin, setMemberPassword).
import { isFamilyOwnerOrAdmin } from '../../functions/security.js';

test('lagadministrator er eier eller står i adminUids', () => {
  const team = { type: 'team', ownerUid: 'trener', adminUids: ['trener', 'leder'], members: ['trener', 'leder', 'gammel', 'mor'] };
  const parents = [
    { id: 'gammel', uid: 'gammel', admin: true, active: true },
    { id: 'mor', uid: 'mor', superAdmin: true, active: true },
  ];
  assert.equal(isTeamAdmin(team, 'trener', parents), true);
  assert.equal(isTeamAdmin(team, 'leder', parents), true);
  // Eldre admin-flagg på medlemsdokumentet (ikke i adminUids): serveren avviser, og appen viser ikke knappene.
  assert.equal(isTeamAdmin(team, 'gammel', parents), false);
  assert.equal(isTeamAdmin(team, 'mor', parents), false);
  assert.equal(isTeamAdmin(team, '', parents), false);
  for (const uid of ['trener', 'leder', 'gammel', 'mor']) {
    assert.equal(isTeamAdmin(team, uid, parents), isFamilyOwnerOrAdmin(team, uid), uid);
    assert.equal(isTeamAdmin(team, uid, parents), isGroupAdmin(team, uid), uid);
  }
});

test('lagskjermene og medlemsinnstillingene viser admin fra samme kilde', () => {
  const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
  const members = read('../../screens/team/TeamMembersScreen.jsx');
  const messages = read('../../screens/team/TeamMessagesScreen.jsx');
  const settings = read('../../screens/settings/GroupSettingsScreen.jsx');
  assert.match(members, /isGroupAdmin\(team, p\.uid \|\| p\.id\)\s*\? 'Administrator'/);
  assert.equal(/p\.admin \|\| p\.superAdmin/.test(messages), false);
  assert.match(settings, /const memberIsAdmin = isGroupAdmin\(family, m\.uid \|\| m\.id\);/);
  assert.match(settings, /admin: !memberIsAdmin/);
});
