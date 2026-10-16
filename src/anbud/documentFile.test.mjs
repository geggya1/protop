import assert from 'node:assert/strict';
import {
  bytesFromBase64,
  loadAgreementBytes,
  parseDataUrl,
  publicHttpHref,
  storagePathFromDocument,
  storagePathFromReference,
} from './documentFile.js';

const pdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n');
const pdfB64 = Buffer.from(pdfBytes).toString('base64');

assert.equal(
  storagePathFromReference('https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/families%2Ffam%2Fanbud%2Fcontracts%2F123-251219%20Oppdragsavtale.pdf?alt=media&token=abc'),
  'families/fam/anbud/contracts/123-251219 Oppdragsavtale.pdf',
);
assert.equal(
  storagePathFromReference('https://protop-c189c.firebasestorage.app/v0/b/protop-c189c.firebasestorage.app/o/families%2Ffam%2Ffil.pdf?alt=media&token=abc'),
  'families/fam/fil.pdf',
);
assert.equal(storagePathFromReference('gs://bucket/families/fam/fil.pdf'), 'families/fam/fil.pdf');
assert.equal(storagePathFromReference('families/fam/anbud/contracts/fil.pdf'), 'families/fam/anbud/contracts/fil.pdf');
assert.equal(storagePathFromReference('https://example.com/avtale.pdf'), '');
assert.equal(storagePathFromReference('blob:https://protop.no/abc'), '');
assert.equal(storagePathFromReference('families/fam/../secrets'), '');

const stored = {
  name: '251219 Oppdragsavtale Consult1 AS-sign.pdf',
  mimeType: 'application/pdf',
  url: 'https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/families%2Ffam%2Fanbud%2Fcontracts%2Ffil.pdf?alt=media&token=abc',
};
assert.equal(storagePathFromDocument(stored), 'families/fam/anbud/contracts/fil.pdf');
assert.equal(publicHttpHref(stored), stored.url);
assert.equal(publicHttpHref({ uri: 'blob:https://protop.no/dead', name: 'a.pdf' }), '');

const parsed = parseDataUrl(`data:application/pdf;base64,${pdfB64}`);
assert.equal(Buffer.from(parsed.bytes).toString(), Buffer.from(pdfBytes).toString());
assert.equal(parsed.mime, 'application/pdf');
assert.equal(Buffer.from(bytesFromBase64(pdfB64)).toString(), Buffer.from(pdfBytes).toString());

const fromData = await loadAgreementBytes({
  name: 'avtale.pdf',
  mimeType: 'application/pdf',
  dataUrl: `data:application/pdf;base64,${pdfB64}`,
}, { fetch: async () => { throw new Error('skal ikke hentes'); }, download: async () => { throw new Error('skal ikke lastes'); } });
assert.equal(fromData.mime, 'application/pdf');
assert.equal(Buffer.from(fromData.bytes).slice(0, 4).toString(), '%PDF');

let downloaded = '';
const fromStorage = await loadAgreementBytes({
  name: '251219 Oppdragsavtale Consult1 AS-sign.pdf',
  mimeType: 'application/pdf',
  url: stored.url,
  storagePath: 'families/fam/anbud/contracts/fil.pdf',
}, {
  fetch: async () => { throw new Error('cors'); },
  download: async (path) => {
    downloaded = path;
    return { fileBase64: pdfB64, contentType: 'application/octet-stream' };
  },
});
assert.equal(downloaded, 'families/fam/anbud/contracts/fil.pdf');
assert.equal(fromStorage.mime, 'application/pdf');
assert.equal(Buffer.from(fromStorage.bytes).slice(0, 4).toString(), '%PDF');

let fetches = 0;
const fromHttp = await loadAgreementBytes({
  name: 'notat.pdf',
  mimeType: 'application/pdf',
  url: 'https://example.com/notat.pdf',
}, {
  fetch: async (href) => {
    fetches += 1;
    assert.equal(href, 'https://example.com/notat.pdf');
    return {
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength),
    };
  },
  download: async () => { throw new Error('skal ikke brukes når fetch virker'); },
});
assert.equal(fetches, 1);
assert.equal(fromHttp.mime, 'application/pdf');

const html = await loadAgreementBytes({
  name: 'notat.html',
  mimeType: 'text/html',
  url: 'https://cdn.example/notat.html',
}, {
  fetch: async () => ({
    ok: true,
    headers: { get: () => 'text/html' },
    arrayBuffer: async () => new TextEncoder().encode('<p>Avtale</p>').buffer,
  }),
  download: null,
});
assert.match(Buffer.from(html.bytes).toString(), /Avtale/);
assert.equal(html.mime, 'text/html');

const missing = await loadAgreementBytes({
  name: 'borte.pdf',
  mimeType: 'application/pdf',
  uri: 'blob:https://protop.no/dead',
}, {
  fetch: async () => { throw new Error('død blob'); },
  download: null,
});
assert.equal(missing, null);

console.log('documentFile ok');
