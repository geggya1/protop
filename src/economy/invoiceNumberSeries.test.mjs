/**
 * Hopp framover i fakturanummerserien krever begrunnelse som logges (bokføringsforskriften § 5-1-1 nr. 1).
 */
import assert from 'node:assert/strict';
import {
  JUMP_REASON_MIN,
  UNDOCUMENTED_GAP_REASON,
  appendNumberJump,
  expectedNextNumber,
  formatNumberRange,
  isJumpDocumented,
  issueGapRecord,
  jumpReasonFor,
  normalizeNumberJumps,
  numberJumpEntry,
  numberJumpError,
  plannedNumberJump,
  seriesGapOnIssue,
} from './invoiceNumberSeries.js';
import { normalizeCompanyInvoiceDefaults, resolveCompanyInvoiceDefaults } from './companyInvoiceDefaults.js';
import { saveCompanyInvoiceDefaults } from '../company/setupState.js';

// Neste nummer uten hopp.
assert.equal(expectedNextNumber({}), 1);
assert.equal(expectedNextNumber({ last: 104, highest: 100 }), 105);
assert.equal(expectedNextNumber({ last: 0, highest: 230 }), 231, 'importerte fakturaer teller med');

// Startnummer før serien er i gang: fritt valg, ikke et hopp.
assert.equal(plannedNumberJump({ last: 0, highest: 0, start: 10001 }), null);
// Startnummer lavere enn neste nummer: ikke et hopp.
assert.equal(plannedNumberJump({ last: 104, start: 50 }), null);
assert.equal(plannedNumberJump({ last: 104, start: 105 }), null);
// Startnummer over neste nummer: hopp som må begrunnes.
const jump = plannedNumberJump({ last: 104, highest: 100, start: 110 });
assert.deepEqual(jump, { from: 105, to: 109, next: 110, count: 5 });
assert.equal(formatNumberRange(jump), '105–109');
assert.equal(formatNumberRange({ from: 7, to: 7 }), '7');

// Begrunnelse kreves, og må si noe.
assert.match(numberJumpError(jump, ''), /nummerne 105–109/);
assert.match(numberJumpError({ from: 5, to: 5, next: 6, count: 1 }, ''), /nummer 5\./);
assert.match(numberJumpError(jump, 'test'), /for kort/);
assert.equal(numberJumpError(jump, 'x'.repeat(JUMP_REASON_MIN)), '');
assert.equal(numberJumpError(null, ''), '');

// Loggraden og loggen.
const entry = numberJumpEntry(jump, {
  reason: 'Nummer 105–109 er brukt i forrige fakturasystem.',
  actor: { byUid: 'u1', byName: 'Geir' },
  at: '2026-10-27T10:00:00.000Z',
});
assert.equal(entry.from, 105);
assert.equal(entry.to, 109);
assert.equal(entry.next, 110);
assert.equal(entry.byName, 'Geir');
assert.equal(entry.at, '2026-10-27T10:00:00.000Z');
const log = appendNumberJump([], entry);
assert.equal(log.length, 1);
assert.equal(isJumpDocumented(log, jump), true);
assert.equal(numberJumpError(jump, '', log), '', 'hoppet er allerede begrunnet');
assert.equal(isJumpDocumented(log, { from: 105, to: 119, next: 120 }), false, 'nytt hopp må begrunnes på nytt');
assert.deepEqual(appendNumberJump(log, null), log);
assert.deepEqual(normalizeNumberJumps([{ from: 1, to: 2, reason: '' }, 'x', null]), [], 'rader uten begrunnelse er ikke en logg');

// Lagret med fakturastandardene. Loggen tas fra lagret tilstand og kan ikke fjernes ved lagring.
{
  let state = saveCompanyInvoiceDefaults({}, { invoiceNumberStart: 110 }, { numberJump: entry }).state;
  assert.equal(resolveCompanyInvoiceDefaults(state).numberJumps.length, 1);
  state = saveCompanyInvoiceDefaults(state, { invoiceNumberStart: 110, numberJumps: [] }).state;
  assert.equal(resolveCompanyInvoiceDefaults(state).numberJumps.length, 1, 'utkastet kan ikke tømme loggen');
  assert.deepEqual(normalizeCompanyInvoiceDefaults({}).numberJumps, []);
}

// Ved ferdigstilling: hull mot telleren og listen.
assert.equal(seriesGapOnIssue({ last: 0, highest: 0, number: 10001 }), null, 'første nummer');
assert.equal(seriesGapOnIssue({ last: 104, number: 105 }), null);
assert.equal(seriesGapOnIssue({ last: 100, highest: 150, number: 151 }), null, 'nummer brukt i importerte fakturaer er ikke hull');
const gap = seriesGapOnIssue({ last: 104, highest: 100, number: 110 });
assert.deepEqual(gap, { from: 105, to: 109, next: 110, count: 5 });
assert.equal(jumpReasonFor(log, gap), entry.reason);
assert.equal(jumpReasonFor(log, { from: 200, to: 201, next: 202 }), '');

const record = issueGapRecord(gap, { reason: jumpReasonFor(log, gap), invoiceId: 'inv_1', actor: { byUid: 'u2', byName: 'Silje' }, at: '2026-10-28T08:00:00.000Z' });
assert.deepEqual(record.entry, {
  from: 105, to: 109, next: 110, reason: entry.reason, invoiceId: 'inv_1', byUid: 'u2', byName: 'Silje', at: '2026-10-28T08:00:00.000Z',
});
assert.equal(record.event, `nummerserien hoppet over 105–109: ${entry.reason}`);
assert.equal(issueGapRecord(gap, {}).entry.reason, UNDOCUMENTED_GAP_REASON, 'uten begrunnelse logges hvor den skal stå');
assert.equal(issueGapRecord(null), null);

console.log('invoiceNumberSeries.test.mjs: ok');
