import assert from 'node:assert/strict';
import { DPA_VERSION } from '../i18n/langs.js';
import {
  canAcceptDpa, dpaAccepted, dpaAcceptedLabel, dpaAcceptance, dpaAcceptanceRecord,
} from './companyPrivacy.js';

// Databehandleravtalen: eier eller administrator godtar på vegne av bedriften.
const family = { ownerUid: 'boss', adminUids: ['adm'], members: ['boss', 'adm', 'emp'] };
assert.equal(canAcceptDpa(family, 'boss'), true);
assert.equal(canAcceptDpa(family, 'adm'), true);
assert.equal(canAcceptDpa(family, 'emp'), false);
assert.equal(canAcceptDpa(null, 'boss'), false);

const record = dpaAcceptanceRecord({ uid: 'boss', name: ' Kari Nordmann ', now: new Date('2026-10-27T09:30:00.000Z') });
assert.deepEqual(record, {
  version: DPA_VERSION,
  acceptedAtClient: '2026-10-27T09:30:00.000Z',
  acceptedByUid: 'boss',
  acceptedByName: 'Kari Nordmann',
});
assert.equal(dpaAccepted({ dpaAcceptance: record }), true);
assert.equal(dpaAccepted({ dpaAcceptance: { ...record, version: '0.9.0' } }), false, 'ny versjon må godtas på nytt');
assert.equal(dpaAccepted({}), false);
assert.equal(dpaAcceptance({ dpaAcceptance: { acceptedByUid: 'x' } }), null);

// Servertiden vinner over klokkeslettet på enheten når den finnes.
const server = { ...record, acceptedAt: { toDate: () => new Date('2026-10-28T12:00:00.000Z') } };
assert.match(dpaAcceptedLabel({ dpaAcceptance: server }), /^Godtatt 28\. okt\.? 2026 av Kari Nordmann · versjon /);
// Rett etter opprettelse ligger serverTimestamp()-plassholderen lokalt: bruk enhetens tid.
assert.match(dpaAcceptedLabel({ dpaAcceptance: { ...record, acceptedAt: {} } }), /27\. okt/);
assert.equal(dpaAcceptedLabel({}), '');

console.log('companyPrivacy.test.mjs: ok');
