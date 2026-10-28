import assert from 'node:assert/strict';
import {
  CLOSURE_GRACE_DAYS, canCloseCompany, closureConfirmMatches, closureNotice, closureRecord, closureRequestError,
  companyClosure, companyExportName, daysLeft, deleteAfterIso, isClosableCompany, purgeDecision, reopenError,
} from './companyClosure.js';

const company = {
  name: 'bygg', type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'], company: { navn: 'Bygg  og Anlegg AS' },
};
const now = new Date('2026-10-28T10:00:00.000Z');

assert.equal(CLOSURE_GRACE_DAYS, 90);
assert.equal(deleteAfterIso('2026-10-28T10:00:00.000Z'), '2027-01-26T10:00:00.000Z');
assert.equal(deleteAfterIso('ikke en dato'), '');

assert.equal(isClosableCompany(company), true);
assert.equal(isClosableCompany({ type: 'family', name: 'Familien' }), false);
assert.equal(canCloseCompany(company, 'adm'), true);
// createdBy og adminUid kan medlemmer skrive selv: teller ikke.
assert.equal(canCloseCompany({ ...company, createdBy: 'bob', adminUid: 'bob' }, 'bob'), false);

// Bekreftelsen er bedriftens navn, uten hensyn til store bokstaver og mellomrom.
assert.equal(closureConfirmMatches('bygg og anlegg as', company), true);
assert.equal(closureConfirmMatches(' Bygg og  Anlegg AS ', company), true);
assert.equal(closureConfirmMatches('Bygg AS', company), false);
assert.equal(closureConfirmMatches('', company), false);

const ok = { family: company, uid: 'own', confirm: 'Bygg og Anlegg AS' };
assert.equal(closureRequestError(ok), '');
assert.match(closureRequestError({ ...ok, uid: 'bob' }), /eier eller administrator/);
assert.match(closureRequestError({ ...ok, confirm: 'feil' }), /«Bygg og Anlegg AS»/);
assert.match(closureRequestError({ ...ok, family: { type: 'family', ownerUid: 'own' } }), /Bare bedrifter/);
// Med utstedte fakturaer må regnskapsmaterialet bekreftes (bokføringsloven § 13).
assert.match(closureRequestError({ ...ok, hasAccounting: true }), /bokføringsloven § 13/);
assert.equal(closureRequestError({ ...ok, hasAccounting: true, accountingConfirmed: true }), '');

const record = closureRecord({ uid: 'own', name: 'Ola Eier', now, reason: 'Avviklet' });
assert.deepEqual(record, {
  status: 'closed',
  closedAt: '2026-10-28T10:00:00.000Z',
  deleteAfter: '2027-01-26T10:00:00.000Z',
  closedByUid: 'own',
  closedByName: 'Ola Eier',
  reason: 'Avviklet',
  exportedBeforeClose: false,
});
const closed = { ...company, closure: record, closedAt: record.closedAt, deleteAfter: record.deleteAfter };
assert.equal(companyClosure(company), null);
assert.equal(companyClosure(closed).deleteAfter, record.deleteAfter);
assert.match(closureRequestError({ ...ok, family: closed }), /allerede avsluttet/);
assert.equal(daysLeft(closed, now), 90);
assert.equal(daysLeft(closed, new Date('2027-02-01T00:00:00.000Z')), 0);
const notice = closureNotice(closed, now);
assert.match(notice, /28\. oktober 2026 av Ola Eier/);
assert.match(notice, /26\. januar 2027 \(om 90 dager\)/);
assert.match(notice, /Last ned eksporten/);
assert.equal(closureNotice(company, now), '');

// Angre til fristen er ute.
assert.equal(reopenError({ family: closed, uid: 'adm', now }), '');
assert.match(reopenError({ family: closed, uid: 'bob', now }), /eier eller administrator/);
assert.match(reopenError({ family: company, uid: 'own', now }), /ikke avsluttet/);
assert.match(reopenError({ family: closed, uid: 'own', now: new Date('2027-01-27T00:00:00.000Z') }), /Fristen er ute/);

// Sletting: serverens frist og bedriftens frist må være like, og fristen må være ute.
const late = new Date('2027-01-27T00:00:00.000Z');
assert.deepEqual(purgeDecision({ record, family: closed, now }), { purge: false, reason: 'not-due' });
assert.deepEqual(purgeDecision({ record, family: closed, now: late }), { purge: true, reason: 'due' });
assert.deepEqual(purgeDecision({ record, family: null, now: late }), { purge: true, reason: 'due' }, 'halvveis slettet: fortsett');
assert.deepEqual(purgeDecision({ record, family: company, now: late }), { purge: false, reason: 'mismatch' }, 'angret');
assert.deepEqual(
  purgeDecision({ record, family: { ...closed, closure: { ...record, deleteAfter: '2099-01-01T00:00:00.000Z' } }, now: late }),
  { purge: false, reason: 'mismatch' },
);
assert.deepEqual(purgeDecision({ record: { ...record, status: 'reopened' }, family: closed, now: late }), { purge: false, reason: 'not-closed' });
assert.deepEqual(purgeDecision({ record: null, family: closed, now: late }), { purge: false, reason: 'not-closed' });

assert.equal(companyExportName(company, now), 'protop-bedrift-bygg-og-anlegg-as-2026-10-28');
assert.equal(companyExportName({ company: { navn: 'Bæ Øy Å AS' } }, now), 'protop-bedrift-bae-oy-a-as-2026-10-28');

console.log('companyClosure.test.mjs: ok');
