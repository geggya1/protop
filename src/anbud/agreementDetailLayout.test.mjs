import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../screens/anbud/AgreementDetail.jsx', import.meta.url), 'utf8');

assert.match(src, /agreement-detail-split/);
assert.match(src, /AgreementDocumentPreview/);
assert.match(src, /styles\.splitRight/);
assert.match(src, /styles\.splitLeft/);
assert.match(src, /Dokumenter \(\$/);
assert.match(src, /function FieldGroup/);
assert.equal(src.includes('flexBasis: 200'), false);
assert.match(src, /factRow/);
assert.match(src, /AgreementCustomerField/);
assert.match(src, /AgreementPersonField/);
assert.match(src, /AgreementProjectField/);
assert.equal(src.includes('OwnerPicker'), false);
assert.match(src, /postalCode: source\.postalCode/);
assert.match(src, /customerId: source\.customerId \|\| ''/);

console.log('agreementDetailLayout.test.mjs: ok');
