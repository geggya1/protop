/**
 * setMemberPassword: hvem kan sette passord på en annen konto (SEC-01).
 */
import assert from 'node:assert/strict';
import { childHomeAnchored, isGroupSubAccount, memberPasswordDecision } from './memberPassword.js';

const child = { email: 'ola12@konto.protop.no', providerData: [{ providerId: 'password' }] };
const adult = { email: 'eier@firma.no', providerData: [{ providerId: 'password' }] };
const google = { email: 'ola12@konto.protop.no', providerData: [{ providerId: 'password' }, { providerId: 'google.com' }] };

assert.equal(isGroupSubAccount(child), true);
assert.equal(isGroupSubAccount(adult), false);
assert.equal(isGroupSubAccount(google), false);
assert.equal(isGroupSubAccount(null), false);

const family = {
  id: 'F', type: 'family', ownerUid: 'mor', adminUids: ['mor', 'far'], members: ['mor', 'far', 'besta', 'kid', 'tante'],
};
const kidDoc = { uid: 'kid', active: true };
const base = {
  caller: 'mor', uid: 'kid', family, memberDoc: kidDoc, groups: [family], authUser: child,
};

// Foresatt med admin i familien setter passord på barnet.
assert.deepEqual(memberPasswordDecision(base), { ok: true });
assert.deepEqual(memberPasswordDecision({ ...base, caller: 'far' }), { ok: true });

// Vanlig medlem (ikke i adminUids) kan ikke, uansett hva medlemsdokumentet sier.
assert.equal(memberPasswordDecision({ ...base, caller: 'besta' }).ok, false);

// En voksen konto med egen e-post kan aldri få passord av andre (kontoovertakelse).
assert.equal(memberPasswordDecision({ ...base, uid: 'tante', memberDoc: { active: true }, authUser: adult }).ok, false);
assert.equal(memberPasswordDecision({ ...base, authUser: google }).ok, false);

// Eieren av gruppen, og den som eier en annen gruppe, er egne voksne kontoer.
assert.equal(memberPasswordDecision({ ...base, uid: 'mor', caller: 'far', memberDoc: { active: true } }).ok, false);
assert.equal(memberPasswordDecision({
  ...base, groups: [family, { id: 'M', ownerUid: 'kid', adminUids: ['kid'], members: ['kid'] }],
}).ok, false);

// Kontoen må være et aktivt medlem: et selvskrevet medlemsdokument uten medlemslisten holder ikke.
assert.equal(memberPasswordDecision({ ...base, family: { ...family, members: ['mor', 'far'] } }).ok, false);
assert.equal(memberPasswordDecision({ ...base, memberDoc: null }).ok, false);
assert.equal(memberPasswordDecision({ ...base, memberDoc: { active: false } }).ok, false);

// Angriperen eier sin egen gruppe og har lagt offeret inn der: offeret er med i en gruppe
// angriperen ikke styrer, så passordet kan ikke settes.
const mal = { id: 'M', ownerUid: 'mal', adminUids: ['mal'], members: ['mal', 'kid'] };
assert.equal(memberPasswordDecision({
  caller: 'mal', uid: 'kid', family: mal, memberDoc: { active: true }, groups: [mal, family], authUser: child,
}).ok, false);

// Administrator (ikke eier) kan ikke sette passord på en annen administrator.
const withLocalAdmin = { ...family, adminUids: ['mor', 'far', 'besta'] };
assert.equal(memberPasswordDecision({
  ...base, caller: 'far', uid: 'besta', family: withLocalAdmin, memberDoc: { active: true }, groups: [withLocalAdmin],
}).ok, false);
assert.equal(memberPasswordDecision({
  ...base, caller: 'mor', uid: 'besta', family: withLocalAdmin, memberDoc: { active: true }, groups: [withLocalAdmin],
}).ok, true);

// REV-14: barnet er også med i fars familie og i et lag. Foresatt med admin i barnets egen
// familie (children/{uid}.familyId) kan bytte passordet likevel.
{
  const fars = { id: 'G', type: 'family', ownerUid: 'farsen', adminUids: ['farsen'], members: ['farsen', 'kid'] };
  const lag = { id: 'L', type: 'team', ownerUid: 'trener', adminUids: ['trener'], members: ['trener', 'kid'] };
  const groups = [family, fars, lag];
  assert.deepEqual(memberPasswordDecision({ ...base, groups, home: family }), { ok: true });
  // Fra lagets side (mor er ikke admin i laget): nei, admin i gruppen kallet gjelder trengs fortsatt.
  assert.equal(memberPasswordDecision({ ...base, family: lag, groups, home: family }).ok, false);
  // Faren (admin i sin egen familie, ikke i barnets): nei.
  assert.equal(memberPasswordDecision({ ...base, caller: 'farsen', family: fars, groups, home: family }).ok, false);
  // Vanlig medlem av barnets familie: nei.
  assert.equal(memberPasswordDecision({ ...base, caller: 'besta', groups, home: family }).ok, false);
  // Barnet må stå i barnets familie, og eier ikke en gruppe.
  assert.equal(memberPasswordDecision({ ...base, groups, home: { ...family, members: ['mor', 'far'] } }).ok, false);
  assert.equal(memberPasswordDecision({
    ...base, groups: [...groups, { id: 'X', ownerUid: 'kid', adminUids: ['kid'], members: ['kid'] }], home: family,
  }).ok, false);
  // Uten kjent egen familie gjelder regelen for alle grupper som før.
  assert.equal(memberPasswordDecision({ ...base, groups }).ok, false);
  // Angriperens egen familie som «barnets familie» godtas ikke (se childHomeAnchored).
  assert.equal(memberPasswordDecision({
    caller: 'mal', uid: 'kid', family: mal, memberDoc: { active: true }, groups: [mal, family], authUser: child, home: null,
  }).ok, false);
}

// Barnets familie teller bare når children/{uid} ble laget sammen med kontoen (addChildMember).
// Et children-dokument laget senere (av en annen) gir ingen egen familie.
{
  const created = Date.parse('2026-01-01T10:00:00.000Z');
  assert.equal(childHomeAnchored({ childCreatedMs: created + 5000, authCreatedMs: created }), true);
  assert.equal(childHomeAnchored({ childCreatedMs: created + 30 * 24 * 3600e3, authCreatedMs: created }), false);
  assert.equal(childHomeAnchored({ childCreatedMs: 0, authCreatedMs: created }), false);
  assert.equal(childHomeAnchored({ childCreatedMs: created, authCreatedMs: NaN }), false);
}

// Eget passord: bare for brukernavn-kontoer. Andre bruker «Glemt passord».
assert.deepEqual(memberPasswordDecision({ caller: 'kid', uid: 'kid', authUser: child }), { ok: true });
assert.equal(memberPasswordDecision({ caller: 'mor', uid: 'mor', authUser: adult }).ok, false);

console.log('memberPassword.test.mjs: ok');
