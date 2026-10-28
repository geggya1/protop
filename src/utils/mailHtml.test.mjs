import assert from 'node:assert/strict';
import {
  escapeHtml,
  looksLikeHtml,
  plainTextToHtml,
  wrapPlainSelection,
  wrapMailFont,
  composeBodyToHtml,
} from './mailHtml.js';

assert.equal(escapeHtml('<b>'), '&lt;b&gt;');
assert.equal(looksLikeHtml('<p>Hei</p>'), true);
assert.equal(looksLikeHtml('Hei du'), false);

const html = plainTextToHtml('Hei **Geir**\nLinje 2');
assert.match(html, /<b>Geir<\/b>/);
assert.match(html, /<br>/);

const wrap = wrapPlainSelection('Hei der', 4, 7, 'bold');
assert.equal(wrap.text, 'Hei **der**');

const fonted = wrapMailFont('<p>Hei</p>', { fontFamily: 'Arial, sans-serif', fontSize: 12 });
assert.match(fonted, /data-wp-mail-font="1"/);
assert.equal(wrapMailFont(fonted, { fontSize: 14 }), fonted);

assert.match(composeBodyToHtml('Bare tekst'), /<div>/);
assert.match(composeBodyToHtml('<p>HTML</p>'), /<p>HTML<\/p>/);

// Skriftnavn med anførselstegn må ikke bryte style-attributtet.
const quoted = wrapMailFont('<p>Hei</p>', { fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif', fontSize: 11 });
assert.match(quoted, /style="font-family:Calibri, 'Segoe UI', Arial, sans-serif;font-size:11pt;color:#1a2744"/);

console.log('mailHtml ok');
