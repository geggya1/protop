import assert from 'node:assert/strict';
import {
  agreementSummary,
  emailLooksLikeSupplier,
  indexLabel,
  registerConfirmText,
  reviewFlags,
} from './fieldReview.js';

assert.equal(indexLabel('ppi-byggeteknisk'), 'Byggeteknisk konsulentvirksomhet (SSB 14335)');
assert.equal(emailLooksLikeSupplier('post@consult1.no', 'Consult1 AS', 'Igang Totalentreprenør As'), true);
assert.equal(emailLooksLikeSupplier('oyvind@igang.no', 'Consult1 AS', 'Igang Totalentreprenør As'), false);

const flags = reviewFlags({
  description: 'Anleggsleder Om oppdragsgiver Oppdragsgiver Igang',
  email: 'post@consult1.no',
  supplier: 'Consult1 AS',
  buyer: 'Igang Totalentreprenør As',
  orgnr: '922987106',
}, { registerHit: { name: 'IGANG TOTALENTREPRENØR AS', orgnr: '922987106' } });
assert.match(flags.description, /etikett/i);
assert.match(flags.email, /oppdragstaker/i);
assert.equal(flags.buyer, undefined);

const mismatch = reviewFlags({
  buyer: 'Feil Navn AS',
  orgnr: '922987106',
}, { registerHit: { name: 'IGANG TOTALENTREPRENØR AS', orgnr: '922987106' } });
assert.match(mismatch.buyer, /Enhetsregisteret/);

assert.match(agreementSummary({
  kind: 'oppdrag',
  title: 'Madlalia · Anleggsleder',
  buyer: 'Igang Totalentreprenør As',
  standard: 'NS 8403',
  value: 1080,
  start: '2025-11-17',
  end: '2028-12-31',
}), /Oppdragsavtale/);

assert.match(
  registerConfirmText({ orgnr: '922987106', buyer: 'Igang Totalentreprenør As' }, { status: 'new' }, { name: 'IGANG TOTALENTREPRENØR AS', orgnr: '922987106' }),
  /bekreftet i Enhetsregisteret/,
);

console.log('fieldReview ok');
