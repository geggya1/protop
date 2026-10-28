import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INVITE_CONTEXT_MS, inviteContextRecord, joinInviteRecord, joinVerifyState, joinWelcomeVisible, pickJoinInvite,
  shouldAutoJoin, TIMESHEET_TIPS,
} from './inviteLinkJoin.js';
import { registrationProfile } from './registrationProfile.js';

const now = new Date('2026-10-28T08:00:00.000Z');

test('ønsket fra invitasjonslenken lagres med bedrift og e-post', () => {
  const rec = joinInviteRecord({
    familyId: ' helpbot-bygg ', email: 'Kari@Bygg.no', groupType: 'organization', groupName: 'Hjelpebot Bygg AS', now,
  });
  assert.deepEqual(rec, {
    familyId: 'helpbot-bygg',
    email: 'kari@bygg.no',
    groupType: 'organization',
    familyName: 'Hjelpebot Bygg AS',
    status: 'pending',
    createdAt: '2026-10-28T08:00:00.000Z',
  });
  assert.equal(joinInviteRecord({ familyId: '' }), null);
});

test('invitasjonen godtas først når e-posten er bekreftet, og bare én gang', () => {
  const joinInvite = joinInviteRecord({ familyId: 'co', email: 'a@b.no', now });
  assert.equal(shouldAutoJoin({ joinInvite, emailVerified: false, families: [] }), false);
  assert.equal(shouldAutoJoin({ joinInvite, emailVerified: true, families: [] }), true);
  // Allerede med i bedriften.
  assert.equal(shouldAutoJoin({ joinInvite, emailVerified: true, families: [{ id: 'co' }] }), false);
  // Skjult (forlatt) bedrift teller ikke som medlem.
  assert.equal(shouldAutoJoin({ joinInvite, emailVerified: true, families: [{ id: 'co', hiddenFromApp: true }] }), true);
  // Godtatt eller ikke noe ønske.
  assert.equal(shouldAutoJoin({ joinInvite: { ...joinInvite, status: 'joined' }, emailVerified: true, families: [] }), false);
  assert.equal(shouldAutoJoin({ joinInvite: null, emailVerified: true, families: [] }), false);
});

test('bare invitasjonen til bedriften i lenken godtas', () => {
  const invites = [
    { familyId: 'annen', inviteId: 'i1', groupType: 'organization' },
    { familyId: 'co', inviteId: 'i2', status: 'accepted' },
    { familyId: 'co', inviteId: 'i3', groupType: 'organization' },
  ];
  assert.equal(pickJoinInvite(invites, 'co')?.inviteId, 'i3');
  assert.equal(pickJoinInvite(invites, 'mangler'), null);
  assert.equal(pickJoinInvite([], 'co'), null);
  assert.equal(pickJoinInvite(invites, ''), null);
});

test('kortet «Slik fører du timer» vises i bedriften personen ble med i', () => {
  const joined = { familyId: 'co', status: 'joined' };
  assert.equal(joinWelcomeVisible(joined, 'co'), true);
  assert.equal(joinWelcomeVisible(joined, 'privat'), false);
  assert.equal(joinWelcomeVisible({ familyId: 'co', status: 'pending' }, 'co'), false);
  assert.equal(joinWelcomeVisible(null, 'co'), false);
  assert.equal(TIMESHEET_TIPS.length, 3);
});

test('registreringen gir ferdig profil uten kjønn, så profilsteget hoppes over', () => {
  const profile = registrationProfile({
    uid: 'u1', name: '  Kari Nordmann ', email: 'Kari@Bygg.no', username: 'kari', language: 'nb',
    joinInvite: { familyId: 'co', status: 'pending' },
  });
  assert.equal(profile.displayName, 'Kari Nordmann');
  assert.equal(profile.email, 'kari@bygg.no');
  assert.equal(profile.profileComplete, true);
  assert.equal(profile.gender, 'unspecified');
  assert.equal(profile.role, 'adult');
  assert.equal(profile.usernameLower, 'kari');
  assert.deepEqual(profile.joinInvite, { familyId: 'co', status: 'pending' });
  assert.equal('joinInvite' in registrationProfile({ uid: 'u2', name: 'Ola' }), false);
  // Uten navn: profilsteget vises som før.
  assert.equal(registrationProfile({ uid: 'u3', name: ' ' }).profileComplete, false);
});

test('Microsoft-konto uten bekreftet e-post etter lenken: «Bekreft e-posten din for å bli med»', () => {
  const context = inviteContextRecord({
    familyId: 'co', email: 'Kari@Bygg.no', groupType: 'organization', groupName: 'Bygg AS', now,
  });
  assert.equal(context.at, '2026-10-28T08:00:00.000Z');
  const ms = { email: 'kari@bygg.no', emailVerified: false, providerData: [{ providerId: 'microsoft.com' }] };
  const at = now.getTime() + 1000;
  assert.deepEqual(joinVerifyState({ context, user: ms, families: [], now: at }), {
    kind: 'verify', familyId: 'co', familyName: 'Bygg AS', email: 'kari@bygg.no',
  });
  // Annen e-post enn invitasjonen.
  assert.equal(joinVerifyState({ context, user: { ...ms, email: 'kari@annet.no' }, families: [], now: at }).kind, 'wrong-email');
  // Bekreftet, passordbruker (egen side), allerede med, gammel lenke, ingen lenke: ingenting.
  assert.equal(joinVerifyState({ context, user: { ...ms, emailVerified: true }, now: at }), null);
  assert.equal(joinVerifyState({ context, user: { ...ms, providerData: [{ providerId: 'password' }] }, now: at }), null);
  assert.equal(joinVerifyState({ context, user: ms, families: [{ id: 'co' }], now: at }), null);
  assert.equal(joinVerifyState({ context, user: ms, now: at + INVITE_CONTEXT_MS }), null);
  assert.equal(joinVerifyState({ user: ms, now: at }), null);
  // Ønsket på profilen gjelder også uten lenken på enheten.
  const joinInvite = joinInviteRecord({ familyId: 'co', email: 'kari@bygg.no', groupName: 'Bygg AS', now });
  assert.equal(joinVerifyState({ joinInvite, user: ms, now: at }).kind, 'verify');
});
