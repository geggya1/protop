import assert from 'node:assert/strict';
import {
  documentFileHref,
  documentHasOriginalFile,
  documentIsOpenable,
  documentLooksBinary,
} from './documentAccess.js';

assert.equal(documentLooksBinary({ name: 'C1-H-03-001 Oppdragsavtale NS8403.pdf' }), true);
assert.equal(documentLooksBinary({ name: 'notat.txt' }), false);
assert.equal(documentLooksBinary({ mimeType: 'application/pdf', name: 'uten-endelse' }), true);

const textOnlyPdf = {
  name: 'C1-H-03-001 Oppdragsavtale NS8403.pdf',
  mimeType: 'application/pdf',
  text: 'Oppdragsbekreftelse Consult1 AS Madlalia',
};
assert.equal(documentHasOriginalFile(textOnlyPdf), false);
assert.equal(documentIsOpenable(textOnlyPdf), false);
assert.equal(documentFileHref(textOnlyPdf), '');

const withUrl = { ...textOnlyPdf, url: 'https://example.com/avtale.pdf' };
assert.equal(documentHasOriginalFile(withUrl), true);
assert.equal(documentIsOpenable(withUrl), true);
assert.equal(documentFileHref(withUrl), 'https://example.com/avtale.pdf');

const pasted = { name: 'Innlimt tekst', text: 'Bare tekst uten fil' };
assert.equal(documentLooksBinary(pasted), false);
assert.equal(documentIsOpenable(pasted), true);

console.log('openDocument ok');
