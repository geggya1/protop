import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AGREEMENT_DOC_MIN, agreementDocHeight, agreementDocMaxWidth, sideWidthFromDrag } from './sideWidth.js';

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

// Dokumentkolonnen kan dras bredere, som kartet på anbud.
assert.match(src, /startDocResize/);
assert.match(src, /role: 'separator'/);
assert.match(src, /AGREEMENT_DOC_WIDTH_KEY/);
assert.match(src, /setPointerCapture/);
assert.equal(agreementDocMaxWidth(1700), 1326);
assert.equal(agreementDocMaxWidth(600), AGREEMENT_DOC_MIN);
assert.equal(agreementDocMaxWidth(0), 1200);
assert.equal(sideWidthFromDrag(420, 1000, 600, { min: AGREEMENT_DOC_MIN, max: agreementDocMaxWidth(1700) }), 820);
assert.equal(sideWidthFromDrag(420, 1000, 1300, { min: AGREEMENT_DOC_MIN, max: 1326 }), AGREEMENT_DOC_MIN);
assert.equal(agreementDocHeight(0, 1000), 560);
assert.equal(agreementDocHeight(500, 1000), 560);
assert.equal(agreementDocHeight(800, 1200), 720);
assert.equal(agreementDocHeight(1200, 1000), 680);
assert.equal(agreementDocHeight(1200, 700), 560);

console.log('agreementDetailLayout.test.mjs: ok');
