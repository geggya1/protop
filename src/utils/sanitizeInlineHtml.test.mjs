/**
 * Streng sanitizer for HTML som settes rett inn i appen (signaturer).
 * I nettleseren brukes DOMParser. Her lages en liten DOM over parse5 med de
 * metodene sanitizeren bruker.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { safeHtmlUrl, safeInlineStyle, sanitizeHtml, sanitizeInlineHtml } from './sanitizeHtml.js';

const require = createRequire(import.meta.url);
const parse5 = require('parse5');

const wrappers = new WeakMap();
function wrap(raw) {
  if (!raw) return null;
  if (wrappers.has(raw)) return wrappers.get(raw);
  const node = {
    get nodeType() {
      if (raw.nodeName === '#text') return 3;
      if (raw.nodeName === '#comment') return 8;
      return 1;
    },
    get nodeName() { return String(raw.tagName || raw.nodeName).toUpperCase(); },
    get childNodes() { return (raw.childNodes || []).map(wrap); },
    get firstChild() { return wrap((raw.childNodes || [])[0]); },
    get attributes() { return (raw.attrs || []).map((a) => ({ name: a.name, value: a.value })); },
    getAttribute(name) { return (raw.attrs || []).find((a) => a.name === name)?.value ?? null; },
    setAttribute(name, value) {
      raw.attrs = (raw.attrs || []).filter((a) => a.name !== name);
      raw.attrs.push({ name, value: String(value) });
    },
    removeAttribute(name) { raw.attrs = (raw.attrs || []).filter((a) => a.name !== name); },
    remove() {
      const parent = raw.parentNode;
      if (!parent) return;
      parent.childNodes.splice(parent.childNodes.indexOf(raw), 1);
      raw.parentNode = null;
    },
    insertBefore(child, ref) {
      const rawChild = child.__raw;
      if (rawChild.parentNode) rawChild.parentNode.childNodes.splice(rawChild.parentNode.childNodes.indexOf(rawChild), 1);
      const at = raw.childNodes.indexOf(ref.__raw);
      raw.childNodes.splice(at, 0, rawChild);
      rawChild.parentNode = raw;
    },
    get innerHTML() { return parse5.serialize(raw); },
    __raw: raw,
  };
  wrappers.set(raw, node);
  return node;
}

function findBody(node) {
  if (node.tagName === 'body') return node;
  for (const child of node.childNodes || []) {
    const hit = findBody(child);
    if (hit) return hit;
  }
  return null;
}

class FakeDOMParser {
  parseFromString(html) {
    return { body: wrap(findBody(parse5.parse(html))) };
  }
}

const clean = (html) => sanitizeInlineHtml(html, { DOMParserImpl: FakeDOMParser });

test('skript, hendelser og farlige lenker fjernes', () => {
  const out = clean('<p onclick="x()">Hei</p><script>alert(1)</script><img src=x onerror=alert(2)><a href="java\tscript:alert(3)">lenke</a>');
  assert.equal(/<script|onclick|onerror|javascript/i.test(out), false, out);
  assert.match(out, /<p>Hei<\/p>/);
  assert.match(out, /<a>lenke<\/a>/);
});

test('omgåelser som slipper gjennom regex', () => {
  const vectors = [
    '<img/src=x/onerror=alert(1)>',
    '<svg><script>alert(1)</script></svg>',
    '<svg onload=alert(1)>',
    '<math><mtext><style><img src=x onerror=alert(1)></style></mtext></math>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<a href=" javascript:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<form action="javascript:alert(1)"><button>x</button></form>',
    '<div style="background:url(javascript:alert(1))">x</div>',
    '<base href="javascript:alert(1)//">',
    '<!-- <img src=x onerror=alert(1)> -->',
  ];
  for (const html of vectors) {
    const out = clean(html);
    // Ingen on…-attributter (tekst som «x/onerror=» inne i en src-verdi er ufarlig).
    assert.equal(/\son\w+=|<script|<svg|<iframe|<form|<base|javascript:/i.test(out), false, `${html} -> ${out}`);
  }
});

test('vanlig signatur beholdes', () => {
  const html = '<table><tr><td><img src="https://protop.no/logo.png" width="80" alt="Logo"></td>'
    + '<td><b>Kari Nordmann</b><br><a href="mailto:kari@firma.no">kari@firma.no</a>'
    + '<br><span style="color:#1099F4">Bygg AS</span></td></tr></table>';
  const out = clean(html);
  assert.match(out, /<img src="https:\/\/protop\.no\/logo\.png" width="80" alt="Logo">/);
  assert.match(out, /<a href="mailto:kari@firma\.no">/);
  assert.match(out, /style="color:#1099F4"/);
  assert.match(out, /<b>Kari Nordmann<\/b>/);
});

test('ukjente elementer pakkes ut, innholdet blir stående', () => {
  assert.equal(clean('<custom-el><b>Hei</b></custom-el>'), '<b>Hei</b>');
});

test('hjelperne for lenker og stil', () => {
  assert.equal(safeHtmlUrl('https://a.no'), true);
  assert.equal(safeHtmlUrl('JaVaScRiPt:x'), false);
  assert.equal(safeHtmlUrl('data:text/html,x'), false);
  assert.equal(safeHtmlUrl('data:image/png;base64,AAA', { image: true }), true);
  assert.equal(safeHtmlUrl('data:image/svg+xml;base64,AAA', { image: true }), false);
  assert.equal(safeHtmlUrl('//evil.example/x'), false);
  assert.equal(safeInlineStyle('color: red'), true);
  assert.equal(safeInlineStyle('background: url(javascript:alert(1))'), false);
  assert.equal(safeInlineStyle('width: expression(alert(1))'), false);
});

test('regex-varianten (e-post i sandkasse) tar også <img/onerror>', () => {
  assert.equal(/onerror/i.test(sanitizeHtml('<img/src=x/onerror=alert(1)>')), false);
});
