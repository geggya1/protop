import assert from 'node:assert/strict';
import {
  FAMILY_NUDGE_DELAY_MS,
  PERSONAL_SHELL_DEFAULT_NAME,
  findPersonalShell,
  hasNonPersonalGroup,
  isPersonalShell,
  personalShellDisplayName,
  shouldShowFamilyNudge,
  ensurePersonalShellForUser,
} from './personalShell.js';

assert.equal(isPersonalShell(null), false);
assert.equal(isPersonalShell({ isPersonal: true }), true);
assert.equal(isPersonalShell({ isPersonal: true, deleted: true }), false);
assert.equal(isPersonalShell({ isPersonal: true, hiddenFromApp: true }), false);
assert.equal(isPersonalShell({ isPersonal: false, name: 'Hansen' }), false);

const list = [
  { id: 'a', isPersonal: true, active: true },
  { id: 'b', isPersonal: false, name: 'Familie', active: true },
];
assert.equal(findPersonalShell(list)?.id, 'a');
assert.equal(hasNonPersonalGroup(list), true);
assert.equal(hasNonPersonalGroup([{ id: 'a', isPersonal: true, active: true }]), false);

assert.equal(personalShellDisplayName({ displayName: 'Geir Hansen' }), 'Geir');
assert.equal(personalShellDisplayName({}), PERSONAL_SHELL_DEFAULT_NAME);

const now = 1_000_000;
assert.equal(shouldShowFamilyNudge({
  family: { isPersonal: true },
  firstHomeAt: now - FAMILY_NUDGE_DELAY_MS - 1,
  now,
  hasActivity: true,
}), true);

assert.equal(shouldShowFamilyNudge({
  family: { isPersonal: true },
  firstHomeAt: now - 1000,
  now,
  hasActivity: true,
}), false);

assert.equal(shouldShowFamilyNudge({
  family: { isPersonal: true },
  firstHomeAt: now - FAMILY_NUDGE_DELAY_MS - 1,
  now,
  hasActivity: false,
}), false);

assert.equal(shouldShowFamilyNudge({
  family: { isPersonal: true },
  firstHomeAt: now - FAMILY_NUDGE_DELAY_MS * 2 - 1,
  now,
  hasActivity: false,
}), true);

assert.equal(shouldShowFamilyNudge({
  family: { isPersonal: true },
  families: [{ id: 'x', isPersonal: false, active: true }],
  firstHomeAt: now - FAMILY_NUDGE_DELAY_MS * 3,
  now,
  hasActivity: true,
}), false);

assert.equal(shouldShowFamilyNudge({
  family: { isPersonal: true },
  firstHomeAt: now - FAMILY_NUDGE_DELAY_MS * 3,
  now,
  hasActivity: true,
  dismissed: true,
}), false);

assert.equal(shouldShowFamilyNudge({
  family: { isPersonal: true },
  firstHomeAt: now - FAMILY_NUDGE_DELAY_MS * 3,
  now,
  hasActivity: true,
  snoozedUntil: now + 1000,
}), false);

{
  const {
    markHomeSetupCompleteSession,
    isHomeSetupCompleteSession,
  } = await import('./personalShell.js');
  markHomeSetupCompleteSession('u-session');
  assert.equal(isHomeSetupCompleteSession('u-session'), true);
  assert.equal(isHomeSetupCompleteSession('other'), false);
}

{
  let created = null;
  const result = await ensurePersonalShellForUser({
    user: { uid: 'u1', email: 'a@b.no', emailVerified: true },
    profile: { displayName: 'Ada', username: 'ada' },
    existingFamilies: [],
    createGroupFn: async (args) => {
      created = args;
      return 'fam-new';
    },
  });
  assert.equal(result.id, 'fam-new');
  assert.equal(result.created, true);
  assert.equal(result.isPersonal, true);
  assert.equal(created.isPersonal, true);
  assert.equal(created.name, 'Ada');
}

{
  const result = await ensurePersonalShellForUser({
    user: { uid: 'u1' },
    existingFamilies: [{ id: 'invited', isPersonal: false, active: true, name: 'Hansen' }],
    createGroupFn: async () => {
      throw new Error('should-not-create');
    },
  });
  assert.equal(result.id, 'invited');
  assert.equal(result.created, false);
  assert.equal(result.isPersonal, false);
}

{
  const result = await ensurePersonalShellForUser({
    user: { uid: 'u1' },
    existingFamilies: [{ id: 'solo', isPersonal: true, active: true, name: 'Mitt hjem' }],
    createGroupFn: async () => {
      throw new Error('should-not-create');
    },
  });
  assert.equal(result.id, 'solo');
  assert.equal(result.created, false);
  assert.equal(result.isPersonal, true);
}

// ANSATT-02: profilsteget og RootNav ber om skallet samtidig. Bare ett lages.
{
  let calls = 0;
  const createGroupFn = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return `fam-${calls}`;
  };
  const user = { uid: 'u-race' };
  const [a, b] = await Promise.all([
    ensurePersonalShellForUser({ user, existingFamilies: [], createGroupFn }),
    ensurePersonalShellForUser({ user, existingFamilies: [], createGroupFn }),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.id, 'fam-1');
  assert.equal(b.id, 'fam-1');
  // Listen er ikke oppdatert ennå (tom): samme skall, ingen ny opprettelse.
  const c = await ensurePersonalShellForUser({ user, existingFamilies: [], createGroupFn });
  assert.equal(c.id, 'fam-1');
  assert.equal(calls, 1);
}

// Feilet opprettelse kan prøves igjen.
{
  let calls = 0;
  const user = { uid: 'u-retry' };
  await assert.rejects(ensurePersonalShellForUser({
    user,
    existingFamilies: [],
    createGroupFn: async () => { calls += 1; throw new Error('offline'); },
  }));
  const ok = await ensurePersonalShellForUser({
    user,
    existingFamilies: [],
    createGroupFn: async () => { calls += 1; return 'fam-retry'; },
  });
  assert.equal(ok.id, 'fam-retry');
  assert.equal(calls, 2);
}

// Et skall brukeren eier i databasen (men som listen mangler) brukes om igjen.
{
  const result = await ensurePersonalShellForUser({
    user: { uid: 'u-owned' },
    existingFamilies: [],
    findOwnShellsFn: async () => [
      { id: 'company', type: 'organization', ownerUid: 'u-owned', active: true },
      { id: 'old', isPersonal: true, ownerUid: 'u-owned', deleted: true },
      { id: 'shell', isPersonal: true, ownerUid: 'u-owned', active: true },
    ],
    createGroupFn: async () => {
      throw new Error('should-not-create');
    },
  });
  assert.equal(result.id, 'shell');
  assert.equal(result.created, false);
}

{
  const { pickOwnPersonalShell } = await import('./personalShell.js');
  assert.equal(pickOwnPersonalShell([{ id: 'x', isPersonal: true, ownerUid: 'other', active: true }], 'me'), null);
  assert.equal(pickOwnPersonalShell([{ id: 'x', isPersonal: true, ownerUid: 'me', archived: true }], 'me'), null);
}

console.log('personalShell.test.mjs: ok');
