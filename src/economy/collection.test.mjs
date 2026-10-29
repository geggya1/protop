/**
 * Purring, inkassovarsel, inkasso og rentefaktura: frister, gebyr og forsinkelsesrente.
 */
import assert from 'node:assert/strict';
import {
  addCollectionStep, buildInterestInvoice, canTakeStep, checkDeadline, collectionLetter, collectionStatus, collectionSteps,
  lateInterest, lateInterestRate, overdueBalances,
} from './collection.js';
import { normalizeInvoice } from './invoices.js';

// Satsene per halvår.
assert.equal(lateInterestRate('2026-07-01').rate, 12.25);
assert.equal(lateInterestRate('2026-06-30').rate, 12);
assert.equal(lateInterestRate('2023-12-31'), null);

// Rente over et satsskifte: 20 dager i juni à 12 % og 10 dager i juli à 12,25 %.
{
  const result = lateInterest([{ from: '2026-06-10', to: '2026-07-10', principal: 100000 }]);
  assert.deepEqual(result.parts.map((row) => [row.from, row.to, row.days, row.rate]), [
    ['2026-06-10', '2026-06-30', 20, 12],
    ['2026-06-30', '2026-07-10', 10, 12.25],
  ]);
  assert.equal(result.parts[0].amount, 657.53); // 100 000 × 12 % × 20/365
  assert.equal(result.parts[1].amount, 335.62); // 100 000 × 12,25 % × 10/365
  assert.equal(result.amount, 993.15);
  assert.equal(result.days, 30);
}

const invoice = (extra = {}) => normalizeInvoice({
  id: 'inv1', invoiceNumber: '10000', status: 'sent', sentAt: '2026-10-29', invoiceDate: '2026-10-29', dueDate: '2026-11-12',
  amountInclVat: 215678.75, outstandingAmount: 215678.75, kid: '8951100666', customerName: 'Hillevågsveien 59-63 AS',
  customerEmail: 'faktura@kunde.no', orgnr: '918269819', currency: 'NOK', ...extra,
});

{
  // Ubetalt: rente fra forfall til i dag.
  assert.deepEqual(overdueBalances(invoice(), { today: '2026-11-30' }), [{ from: '2026-11-12', to: '2026-11-30', principal: 215678.75 }]);
  // Betalt for sent (fra PowerOffice: bare betalingsdagen).
  assert.deepEqual(
    overdueBalances(invoice({ status: 'paid', paidAt: '2026-11-20', outstandingAmount: 0 }), { today: '2026-12-01' }),
    [{ from: '2026-11-12', to: '2026-11-20', principal: 215678.75 }],
  );
  // Delbetaling i ProTop: lavere hovedstol etter betalingen.
  const part = overdueBalances(invoice({ payments: [{ date: '2026-11-22', amount: 100000 }], outstandingAmount: 115678.75 }), { today: '2026-12-02' });
  assert.deepEqual(part, [
    { from: '2026-11-12', to: '2026-11-22', principal: 215678.75 },
    { from: '2026-11-22', to: '2026-12-02', principal: 115678.75 },
  ]);
  // Ikke forfalt: ingen rente.
  assert.deepEqual(overdueBalances(invoice(), { today: '2026-11-12' }), []);
}

{
  // Løpet: påminnelse → purring → inkassovarsel → inkasso, ett steg om gangen.
  const settings = { reminderFee: 60, friendlyReminderDays: 3 };
  const early = collectionStatus(invoice(), { today: '2026-11-14', settings });
  assert.equal(early.open, true);
  assert.deepEqual(early.plan.map((row) => [row.kind, row.state]), [
    ['friendly', 'next'], ['reminder', 'locked'], ['notice', 'locked'], ['debt', 'locked'],
  ]);
  assert.equal(early.next.kind, 'friendly');
  assert.equal(early.next.availableFrom, '2026-11-13');
  assert.equal(early.suggestedFee, 0, 'påminnelsen har ikke gebyr');
  assert.equal(early.settings.reminderFee, 38, 'gebyret har et tak');
  assert.equal(early.settings.reminderDays, 14, 'med gebyr tidligst 14 dager etter forfall');
  assert.equal(early.defaultDeadline, '2026-11-28');
  assert.match(early.debtHint, /inkassovarselet er sendt/);
  // Ikke betalt, ikke forfalt, eller utkast: ingen steg.
  assert.equal(collectionStatus(invoice({ status: 'paid', outstandingAmount: 0 }), { today: '2026-11-26' }).next, null);
  assert.equal(collectionStatus(invoice(), { today: '2026-11-12' }).next, null);
  assert.equal(collectionStatus(invoice({ status: 'draft' }), { today: '2026-11-26' }).canInterest, false);
  // Påminnelsen kan slås av. Da er purringen neste, tidligst 14 dager etter forfall med gebyr.
  const off = collectionStatus(invoice(), { today: '2026-11-20', settings: { reminderFee: 38, friendlyReminderDays: 0 } });
  assert.deepEqual(off.plan.map((row) => row.state), ['off', 'waiting', 'locked', 'locked']);
  assert.equal(off.next.kind, 'reminder');
  assert.equal(off.next.availableFrom, '2026-11-26');
  assert.equal(canTakeStep(invoice(), 'reminder', { today: '2026-11-20', settings: { reminderFee: 38, friendlyReminderDays: 0 } }).error, 'Kan sendes fra 26.11.2026.');
  assert.match(canTakeStep(invoice(), 'notice', { today: '2026-11-30', settings }).error, /Send påminnelse først/);
  assert.equal(canTakeStep(invoice(), 'friendly', { today: '2026-11-30', settings }).ok, true);
  // På vent: ingen steg kan tas.
  const held = invoice({ collection: { hold: true } });
  assert.match(canTakeStep(held, 'friendly', { today: '2026-11-30', settings }).error, /på vent/);

  assert.equal(checkDeadline('2026-12-09', '2026-11-26').ok, false);
  assert.equal(checkDeadline('2026-12-10', '2026-11-26').ok, true);
}

{
  // Steg: påminnelse, purring med gebyr, inkassovarsel når purrefristen er ute, så inkasso.
  const actor = { byUid: 'u1', byName: 'Geir Ove Andersen' };
  const settings = { reminderFee: 38 };
  let row = invoice();
  row = addCollectionStep(row, { kind: 'friendly', to: 'faktura@kunde.no', auto: true }, { actor, at: '2026-11-15T07:30:00.000Z' }).invoice;
  const afterFriendly = collectionStatus(row, { today: '2026-11-20', settings });
  assert.equal(afterFriendly.next.kind, 'reminder');
  assert.equal(afterFriendly.next.state, 'waiting');
  row = addCollectionStep(row, { kind: 'reminder', fee: 38, deadline: '2026-12-10', to: 'faktura@kunde.no' }, { actor, at: '2026-11-26T10:00:00.000Z' }).invoice;
  // Inkassovarsel først dagen etter fristen i purringen.
  assert.equal(collectionStatus(row, { today: '2026-12-10', settings }).next.state, 'waiting');
  const noticeDay = collectionStatus(row, { today: '2026-12-11', settings });
  assert.equal(noticeDay.next.kind, 'notice');
  assert.equal(noticeDay.next.ready, true);
  assert.equal(noticeDay.feeAllowed, true, 'andre gebyr: fristen i purringen er oversittet');
  row = addCollectionStep(row, { kind: 'notice', fee: 38, deadline: '2026-12-24', channel: 'manual' }, { actor, at: '2026-12-11T10:00:00.000Z' }).invoice;
  assert.equal(row.collection.friendlySent, true);
  assert.equal(row.collection.reminderSent, true);
  assert.equal(row.collection.noticeSent, true);
  assert.deepEqual(collectionSteps(row).map((s) => s.kind), ['friendly', 'reminder', 'notice']);
  assert.deepEqual(row.events.map((e) => [e.text, e.byName || '']), [
    ['ProTop sendte betalingspåminnelse til faktura@kunde.no automatisk', ''],
    ['sendte purring med gebyr 38,00 kr, frist 10.12.2026 til faktura@kunde.no', 'Geir Ove Andersen'],
    ['sendte inkassovarsel med gebyr 38,00 kr, frist 24.12.2026 (lastet ned og sendt selv)', 'Geir Ove Andersen'],
  ]);
  const before = collectionStatus(row, { today: '2026-12-20', settings });
  assert.equal(before.feeAllowed, false, 'gebyr for to varsler er brukt');
  assert.equal(before.fees, 76);
  assert.match(before.debtHint, /25\.12\.2026/);
  assert.equal(before.next.kind, 'debt');
  assert.equal(before.next.ready, false);
  const after = collectionStatus(row, { today: '2026-12-28' });
  assert.equal(after.next.ready, true);
  assert.equal(after.debtHint, '');

  // Brevene.
  const letter = collectionLetter(row, 'reminder', { fee: 38, deadline: '2026-12-10', today: '2026-11-26', supplier: { bankAccount: '12345678903' } });
  assert.equal(letter.title, 'PURRING');
  assert.match(letter.paragraphs[0], /faktura 10000 med forfall 12\.11\.2026/);
  const plain = (value) => String(value).replace(/\s/g, ' ');
  assert.equal(plain(letter.facts.find((f) => f[0] === 'Å betale')[1]), '215 716,75 kr');
  assert.deepEqual(letter.facts.find((f) => f[0] === 'KID'), ['KID', '8951100666']);
  const notice = collectionLetter(row, 'notice', { fee: 0, deadline: '2026-12-24', today: '2026-12-10' });
  assert.equal(notice.title, 'INKASSOVARSEL');
  assert.match(notice.paragraphs.join(' '), /sendt til inkasso/);
  const claim = collectionLetter(row, 'debt', { today: '2026-12-28', supplier: { name: 'CONSULT1 AS', orgnr: '916538804' } });
  assert.equal(claim.title, 'KRAVSOPPSTILLING');
  assert.ok(claim.facts.some((f) => f[0] === 'Forsinkelsesrente' && /til 28\.12\.2026/.test(f[1])));
  assert.ok(claim.facts.some((f) => f[0] === 'Purregebyr' && plain(f[1]) === '76,00 kr'));

  // Rentefaktura: rente og gebyrene, utenfor mva. Gebyrene merkes så de ikke tas med to ganger.
  const built = buildInterestInvoice(row, { today: '2026-12-28', actor, at: '2026-12-28T09:00:00.000Z' });
  assert.equal(built.ok, true);
  assert.equal(built.invoice.status, 'draft');
  assert.equal(built.invoice.customerName, 'Hillevågsveien 59-63 AS');
  assert.ok(built.invoice.lines.every((line) => line.vatCode === 'OUTSIDE'));
  assert.equal(built.invoice.lines.filter((line) => /gebyr/i.test(line.description)).length, 2);
  assert.match(built.invoice.lines[0].description, /Forsinkelsesrente faktura 10000: 12\.11\.2026–28\.12\.2026, 46 dager à 12,25 %/);
  assert.equal(built.feeStepIds.length, 2);
  const marked = addCollectionStep(row, { kind: 'interest', amount: built.amount, invoiceId: built.invoice.id, feeStepIds: built.feeStepIds }, { actor }).invoice;
  assert.equal(collectionStatus(marked, { today: '2026-12-28' }).unbilledFees, 0);
  const again = buildInterestInvoice(marked, { today: '2026-12-28' });
  assert.equal(again.invoice.lines.filter((line) => /gebyr/i.test(line.description)).length, 0);
}

{
  // Eldre fakturaer med bare avkrysning vises som steg.
  const old = invoice({ collection: { reminderSent: true, reminderSentAt: '2026-11-01T10:00:00Z' } });
  assert.deepEqual(collectionSteps(old).map((s) => [s.kind, s.legacy]), [['reminder', true]]);
}
