import assert from 'node:assert/strict';
import { DPA_VERSION } from '../i18n/langs.js';
import {
  ACTIVITY_USAGE_TYPES, AI_OFF_MESSAGE, USAGE_RETENTION_DAYS, canAcceptDpa, companyAiAllowed, companyAiCall,
  companyPrivacySettings,
  companyUsageLogEnabled, dpaAccepted, dpaAcceptedLabel, dpaAcceptance, dpaAcceptanceRecord,
  usageCutoffIso, usageEventAllowed, usageLogNotice, withCompanyPrivacy, withinUsageRetention,
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

// Brukslogg og AI er på for selskaper som ikke har valgt noe (som før).
assert.deepEqual(companyPrivacySettings({}), { usageLog: true, ai: true });
assert.deepEqual(companyPrivacySettings({ privacy: { usageLog: false } }), { usageLog: false, ai: true });
assert.equal(companyAiAllowed({ privacy: { ai: false } }), false);
assert.equal(companyAiAllowed(null), true);
assert.equal(companyUsageLogEnabled({ privacy: { usageLog: 'nei' } }), true, 'bare false slår av');
assert.deepEqual(withCompanyPrivacy({ privacy: { ai: false } }, 'usageLog', false), { ai: false, usageLog: false });

// Av: innlogging, aktivitet og sidevisninger lagres ikke. Timer og invitasjoner er endringsspor.
const off = { privacy: { usageLog: false } };
for (const type of ACTIVITY_USAGE_TYPES) assert.equal(usageEventAllowed(off, type), false, type);
assert.equal(usageEventAllowed(off, 'hour'), true);
assert.equal(usageEventAllowed(off, 'invite_sent'), true);
assert.equal(usageEventAllowed({}, 'login'), true);

// Lagringstid 90 dager.
const now = new Date('2026-10-27T12:00:00.000Z');
assert.equal(USAGE_RETENTION_DAYS, 90);
assert.equal(usageCutoffIso(now), '2026-07-29T12:00:00.000Z');
const events = [
  { id: 'ny', at: '2026-10-26T08:00:00.000Z' },
  { id: 'grense', at: '2026-07-29T12:00:00.000Z' },
  { id: 'gammel', at: '2026-07-01T08:00:00.000Z' },
  { id: 'uten' },
];
assert.deepEqual(withinUsageRetention(events, now).map((row) => row.id), ['ny', 'grense']);
assert.match(usageLogNotice({}), /IP-adresse/);
assert.match(usageLogNotice({}), /90 dager/);
assert.match(usageLogNotice(off), /slått av/);

// «Tillat AI-funksjoner»: av gir et kall som feiler med forklaring, uten å kalle AI.
let calls = 0;
const call = async (value) => { calls += 1; return value; };
assert.equal(await companyAiCall({}, call)('svar'), 'svar');
await assert.rejects(() => companyAiCall({ privacy: { ai: false } }, call)('svar'), (err) => {
  assert.equal(err.message, AI_OFF_MESSAGE);
  assert.equal(err.code, 'failed-precondition');
  return true;
});
assert.equal(calls, 1);

console.log('companyPrivacy.test.mjs: ok');
