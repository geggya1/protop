/**
 * E-postrelé: indeksbrevet krever medlemskap i bedriften, grense og få mottakere.
 * Anbudsvarselet escaper alt innhold og lenker bare til kjente portaler.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCompanyMemberRecord, cleanFamilyId, assertCompanyMember } from './companyMember.js';
import { indeksRecipients, INDEKS_MAX_CC } from './indeksLetter.js';
import { buildTenderAlert, escapeMailHtml, safeNoticeUrl } from '../src/anbud/alertMail.js';

test('medlemskap leses fra selskapsdokumentet', () => {
  assert.equal(isCompanyMemberRecord({ ownerUid: 'u1' }, 'u1'), true);
  assert.equal(isCompanyMemberRecord({ members: ['u2'] }, 'u2'), true);
  assert.equal(isCompanyMemberRecord({ activeUsers: ['u3'] }, 'u3'), true);
  assert.equal(isCompanyMemberRecord({ memberIds: ['u4'] }, 'u4'), true);
  assert.equal(isCompanyMemberRecord({ members: ['u2'] }, 'x'), false);
  assert.equal(isCompanyMemberRecord({ members: ['u2'], deleted: true }, 'u2'), false);
  // Selvskrevne felt teller ikke.
  assert.equal(isCompanyMemberRecord({ createdBy: 'u5', adminUid: 'u5' }, 'u5'), false);
  assert.equal(cleanFamilyId('a/b'), '');
  assert.equal(cleanFamilyId(' f1 '), 'f1');
});

test('assertCompanyMember avviser ikke-medlemmer', async () => {
  const db = {
    doc: (path) => ({
      get: async () => (path === 'families/f1'
        ? { exists: true, data: () => ({ members: ['u1'] }) }
        : { exists: false, data: () => null }),
    }),
  };
  assert.deepEqual(await assertCompanyMember(db, 'f1', 'u1'), { members: ['u1'] });
  await assert.rejects(assertCompanyMember(db, 'f1', 'fremmed'), (err) => err.code === 'permission-denied');
  await assert.rejects(assertCompanyMember(db, 'mangler', 'u1'), (err) => err.code === 'not-found');
  await assert.rejects(assertCompanyMember(db, '', 'u1'), (err) => err.code === 'invalid-argument');
});

test('indeksbrevet går til kunden og høyst noen få kopier', () => {
  assert.deepEqual(indeksRecipients('Kunde@Firma.no', ['a@b.no', 'kunde@firma.no', 'a@b.no', 'ugyldig']), {
    to: 'kunde@firma.no',
    cc: ['a@b.no'],
  });
  assert.throws(() => indeksRecipients('ikke-epost', []), (err) => err.code === 'invalid-argument');
  const many = Array.from({ length: INDEKS_MAX_CC + 1 }, (_, i) => `k${i}@firma.no`);
  assert.throws(() => indeksRecipients('kunde@firma.no', many), (err) => err.code === 'invalid-argument');
});

test('sendIndeksLetter sjekker medlemskap og grense før sending', () => {
  const src = readFileSync(new URL('./indeksLetter.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export const sendIndeksLetter'));
  assert.ok(fn.indexOf('assertCompanyMember(') > 0);
  assert.ok(fn.indexOf('limitSending(') > 0);
  assert.ok(fn.indexOf('assertCompanyMember(') < fn.indexOf('sendMail('));
  assert.ok(fn.indexOf('limitSending(') < fn.indexOf('sendMail('));
  const client = readFileSync(new URL('../src/indeksregulering/mailClient.js', import.meta.url), 'utf8');
  assert.match(client, /call\(\{ \.\.\.message, familyId \}\)/);
});

test('anbudsvarselet escaper innholdet og lenker bare til kjente portaler', () => {
  assert.equal(escapeMailHtml('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
  assert.equal(safeNoticeUrl('https://www.doffin.no/notices/1'), 'https://www.doffin.no/notices/1');
  assert.equal(safeNoticeUrl('https://ted.europa.eu/no/notice/1-2026'), 'https://ted.europa.eu/no/notice/1-2026');
  assert.equal(safeNoticeUrl('javascript:alert(1)'), '');
  assert.equal(safeNoticeUrl('http://www.doffin.no/x'), '');
  assert.equal(safeNoticeUrl('https://doffin.no.evil.example/x'), '');
  assert.equal(safeNoticeUrl('https://evil.example/doffin.no'), '');

  const mail = buildTenderAlert({
    companyName: '<b>Firma</b>',
    notices: [{
      title: '<img src=x onerror=alert(1)>Logg inn her',
      buyer: '"><script>alert(2)</script>',
      url: 'https://evil.example/phish',
      description: '<a href="https://evil.example">klikk</a>',
      source: 'doffin',
    }, {
      title: 'Ekte',
      url: 'https://www.doffin.no/notices/2',
      source: 'doffin',
    }],
  });
  assert.equal(/<img|<script|<b>Firma|<a href="https:\/\/evil/i.test(mail.html), false, mail.html);
  assert.equal(mail.html.includes('evil.example/phish'), false);
  assert.match(mail.html, /<a href="https:\/\/www\.doffin\.no\/notices\/2"/);
  assert.equal(mail.text.includes('https://evil.example/phish'), false);
});
