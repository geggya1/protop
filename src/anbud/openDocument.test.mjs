import assert from 'node:assert/strict';
import {
  AGREEMENT_IMPORT_ACCEPT,
  documentFileHref,
  documentHasOriginalFile,
  documentIsOpenable,
  documentLooksBinary,
  documentOfficeEmbedUrl,
  documentPreviewKind,
  documentPreviewLabel,
  documentSupportsOfficeEmbed,
} from './documentAccess.js';

assert.equal(documentLooksBinary({ name: 'C1-H-03-001 Oppdragsavtale NS8403.pdf' }), true);
assert.equal(documentLooksBinary({ name: 'notat.txt' }), false);
assert.equal(documentLooksBinary({ mimeType: 'application/pdf', name: 'uten-endelse' }), true);
assert.equal(documentLooksBinary({ name: 'pris.xlsx' }), true);

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
assert.equal(documentPreviewKind(withUrl), 'pdf');
assert.equal(documentPreviewLabel('pdf'), 'PDF');

const pasted = { name: 'Innlimt tekst', text: 'Bare tekst uten fil' };
assert.equal(documentLooksBinary(pasted), false);
assert.equal(documentIsOpenable(pasted), true);
assert.equal(documentPreviewKind(pasted), 'text');

assert.equal(documentPreviewKind({ name: 'avtale.docx' }), 'word');
assert.equal(documentPreviewKind({ name: 'kalkyle.xlsx' }), 'excel');
assert.equal(documentPreviewKind({ name: 'svar.eml', mimeType: 'message/rfc822' }), 'email');
assert.equal(documentPreviewKind({ name: 'foto.png', mimeType: 'image/png' }), 'image');

const wordHttps = {
  name: 'avtale.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  url: 'https://example.com/avtale.docx',
};
assert.equal(documentSupportsOfficeEmbed(wordHttps), true);
assert.match(documentOfficeEmbedUrl(wordHttps), /view\.officeapps\.live\.com/);

const wordData = { ...wordHttps, url: '', dataUrl: 'data:application/octet-stream;base64,aa' };
assert.equal(documentSupportsOfficeEmbed(wordData), false);
assert.equal(documentOfficeEmbedUrl(wordData), '');

assert.match(AGREEMENT_IMPORT_ACCEPT, /\.pdf/);
assert.match(AGREEMENT_IMPORT_ACCEPT, /\.docx/);
assert.match(AGREEMENT_IMPORT_ACCEPT, /\.xlsx/);
assert.match(AGREEMENT_IMPORT_ACCEPT, /\.eml/);

console.log('openDocument ok');
