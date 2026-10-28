/**
 * Lagret XSS: opplastede HTML-/SVG-dokumenter skal aldri vises som side med protop.no
 * som opphav (blob-URL eller iframe uten sandkasse).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isActiveContentMime, safeBlobMime, UNTRUSTED_HTML_SANDBOX } from './documentAccess.js';
import { peekAgreementBlobUrl, rememberAgreementBlobUrl } from './documentFile.js';
import { routeMapDocument, scriptSafeJson } from '../mileage/routeMapHtml.js';
import { tenderMapDocument } from './tenderMapHtml.js';
import { MAP_FRAME_SANDBOX, mapScriptNonce } from '../utils/mapFrame.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('aktivt innhold gjenkjennes', () => {
  for (const mime of ['text/html', 'TEXT/HTML; charset=utf-8', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml', 'application/rss+xml', 'application/javascript', 'text/javascript']) {
    assert.equal(isActiveContentMime(mime), true, mime);
  }
  for (const mime of ['application/pdf', 'image/png', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '']) {
    assert.equal(isActiveContentMime(mime), false, mime);
  }
});

test('blob-URL-er på protop.no viser HTML/SVG som ren tekst', () => {
  assert.equal(safeBlobMime('text/html'), 'text/plain;charset=utf-8');
  assert.equal(safeBlobMime('image/svg+xml'), 'text/plain;charset=utf-8');
  assert.equal(safeBlobMime('application/pdf'), 'application/pdf');
  assert.equal(safeBlobMime(''), 'application/octet-stream');
});

test('rememberAgreementBlobUrl lager blob med trygg type', () => {
  const seen = [];
  const prevCreate = URL.createObjectURL;
  const prevRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => {
    seen.push(blob.type);
    return `blob:test/${seen.length}`;
  };
  URL.revokeObjectURL = () => {};
  try {
    const doc = { name: 'avtale.html', mimeType: 'text/html', url: 'https://cdn.example/avtale.html', size: 12 };
    const url = rememberAgreementBlobUrl(doc, { bytes: new TextEncoder().encode('<script>x</script>'), mime: 'text/html' });
    assert.equal(url, 'blob:test/1');
    assert.equal(peekAgreementBlobUrl(doc), url);
    const pdf = { name: 'avtale.pdf', mimeType: 'application/pdf', url: 'https://cdn.example/avtale.pdf', size: 5 };
    rememberAgreementBlobUrl(pdf, { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), mime: 'application/pdf' });
  } finally {
    URL.createObjectURL = prevCreate;
    URL.revokeObjectURL = prevRevoke;
  }
  assert.deepEqual(seen, ['text/plain;charset=utf-8', 'application/pdf']);
});

test('HTML-forhåndsvisningen kjører i sandkasse uten skript og uten samme opphav', () => {
  assert.equal(UNTRUSTED_HTML_SANDBOX, '');
  const preview = read('../../screens/anbud/AgreementDocumentPreview.jsx');
  const html = preview.slice(preview.indexOf("if (kind === 'html' && Platform.OS === 'web')"));
  assert.match(html, /sandbox=\{UNTRUSTED_HTML_SANDBOX\}/);
  assert.equal(/<WebIframe src=\{href\}/.test(html.slice(0, 600)), false, 'HTML vises ikke via src (blob eller lagringslenke)');
  const open = read('./openDocument.js');
  assert.match(open, /const sessionBlob = !activeDoc/);
});

test('kart-iframes har samme opphav, så OpenStreetMap får Referer', () => {
  // Uten allow-same-origin sender nettleseren ingen Referer, og OSM svarer «Access blocked».
  assert.equal(MAP_FRAME_SANDBOX, 'allow-scripts allow-same-origin');
  for (const rel of ['../../components/mileage/MileageRouteMap.jsx', '../../screens/anbud/TenderMap.jsx']) {
    const src = read(rel);
    assert.match(src, /sandbox: MAP_FRAME_SANDBOX/, rel);
  }
  assert.match(read('../../screens/anbud/TenderMap.jsx'), /event\?\.source !== iframeRef\.current\.contentWindow/);
});

test('kartdokumentene kjører bare skript med egen nonce', () => {
  const docs = [
    routeMapDocument({ from: { lat: 59.9, lng: 10.7, label: 'Oslo' }, to: { lat: 60.4, lng: 5.3, label: 'Bergen' } }),
    tenderMapDocument([{ id: 't1', title: '<img src=x onerror=alert(1)>', lat: 59.9, lng: 10.7 }]),
  ];
  for (const doc of docs) {
    const nonce = doc.match(/script-src 'nonce-([0-9a-f]{32})'/)?.[1];
    assert.ok(nonce, 'CSP med nonce');
    assert.ok(doc.indexOf('Content-Security-Policy') < doc.indexOf('<script'), 'CSP står før første skript');
    const tags = doc.match(/<script[^>]*>/g);
    assert.equal(tags.length, 2);
    for (const tag of tags) assert.ok(tag.includes(`nonce="${nonce}"`), tag);
  }
  // Samme data gir samme srcDoc, ellers laster kartet seg på nytt ved hver rendering.
  const route = { from: { lat: 59.9, lng: 10.7 }, to: { lat: 60.4, lng: 5.3 } };
  assert.equal(routeMapDocument(route), routeMapDocument(route));
  assert.match(mapScriptNonce(), /^[0-9a-f]{32}$/);
});

test('kjøreboks-kartet: stedsnavn kan ikke avslutte skriptet', () => {
  const evil = '</script><script>alert(1)</script><!--';
  assert.equal(scriptSafeJson({ a: evil }).includes('<'), false);
  assert.deepEqual(JSON.parse(scriptSafeJson({ a: evil, b: ' ' })), { a: evil, b: ' ' });
  const doc = routeMapDocument({
    from: { lat: 59.9, lng: 10.7, label: evil },
    to: { lat: 60.4, lng: 5.3, label: 'Bergen' },
  });
  const scripts = doc.split('<script').length - 1;
  assert.equal(scripts, 2, 'bare Leaflet-skriptet og kartskriptet');
  assert.equal(doc.includes('</script><script>alert(1)'), false);
});
