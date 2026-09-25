import assert from 'node:assert/strict';
import { applyScan, createDirectInquiry, createManualInquiry, tenderFromScan } from './intake.js';

const scan = tenderFromScan({
  title: 'Tak over inngang',
  buyer: 'Sortland kommune',
  email: 'Post@Kommune.no',
  phone: '76 00 00 00',
  amount: '14000000',
});
assert.equal(scan.email, 'post@kommune.no');
assert.equal(scan.amount, 14000000);

const manual = createManualInquiry({
  channel: 'brev',
  contactName: 'Kari',
  email: 'kari@firma.no',
}, [{ name: 'brev.jpg', mime: 'image/jpeg', size: 1200 }]);
assert.equal(manual.ok, true);
assert.equal(manual.inquiry.source, 'manuell');
assert.equal(manual.inquiry.channel, 'brev');
assert.equal(manual.inquiry.attachments[0].name, 'brev.jpg');
assert.equal(createManualInquiry({}).ok, false);

const filled = applyScan(manual.inquiry, { title: 'Rehabilitering', phone: '90000000' });
assert.equal(filled.title, 'Rehabilitering');
assert.equal(filled.contactName, 'Kari');
assert.equal(filled.ocrStatus, 'done');

const direct = createDirectInquiry({
  title: 'Rør til nybygg',
  toOrgnr: '917 103 801',
  fromName: 'Veidekke ASA',
  message: 'Kan dere gi pris?',
});
assert.equal(direct.ok, true);
assert.equal(direct.inquiry.source, 'protop');
assert.equal(direct.inquiry.toOrgnr, '917103801');
assert.equal(createDirectInquiry({ title: 'X', toOrgnr: '12' }).ok, false);

console.log('intake.test.mjs ok');
