import assert from 'node:assert/strict';
import { applyFormat, withSafeLinks } from './articleFormat.js';
import { parseMarkdown } from '../iso/markdown.js';

// Fet rundt markeringen; mellomrom i kanten havner utenfor.
let out = applyFormat('Vi bygger trygt', { start: 3, end: 10 }, 'bold');
assert.equal(out.text, 'Vi **bygger** trygt');
assert.deepEqual(out.selection, { start: 5, end: 11 });
// Samme knapp igjen fjerner markeringen.
out = applyFormat(out.text, out.selection, 'bold');
assert.equal(out.text, 'Vi bygger trygt');
assert.deepEqual(out.selection, { start: 3, end: 9 });

// Uten markering settes en plassholder inn og markeres.
out = applyFormat('Hei ', { start: 4, end: 4 }, 'italic');
assert.equal(out.text, 'Hei *kursiv tekst*');
assert.equal(out.text.slice(out.selection.start, out.selection.end), 'kursiv tekst');

// Overskrift får egen blokk med tom linje før og etter.
out = applyFormat('Innledning\nVår historie\nVi startet i 2016.', { start: 12, end: 12 }, 'h2');
assert.equal(out.text, 'Innledning\n\n## Vår historie\n\nVi startet i 2016.');
assert.equal(parseMarkdown(out.text)[1].type, 'h');
// Av igjen.
const off = applyFormat(out.text, out.selection, 'h2');
assert.equal(off.text.includes('## '), false);

// Mellomtittel erstatter en eksisterende overskrift i stedet for å legge oppå.
out = applyFormat('## Verdier', { start: 4, end: 4 }, 'h3');
assert.equal(out.text, '### Verdier');

// Punktliste over flere linjer, og nummerert teller opp.
out = applyFormat('Kvalitet\nMiljø\nHMS', { start: 0, end: 18 }, 'ul');
assert.equal(out.text, '- Kvalitet\n- Miljø\n- HMS');
out = applyFormat('Kvalitet\nMiljø', { start: 0, end: 14 }, 'ol');
assert.equal(out.text, '1. Kvalitet\n2. Miljø');
assert.deepEqual(parseMarkdown(out.text).map((b) => b.type), ['li', 'li']);

// Liste rett etter et avsnitt får tom linje, så avsnittet ikke slukes.
out = applyFormat('Vi tilbyr:\nRådgivning', { start: 12, end: 12 }, 'ul');
assert.equal(out.text, 'Vi tilbyr:\n\n- Rådgivning');

// Lenke: adressen markeres, og www-lenker får https:// ved visning.
out = applyFormat('Les mer her', { start: 8, end: 11 }, 'link');
assert.equal(out.text, 'Les mer [her](https://)');
assert.equal(out.text.slice(out.selection.start, out.selection.end), 'https://');
const typed = `${out.text.slice(0, out.selection.start)}www.consult1.no${out.text.slice(out.selection.end)}`;
assert.equal(withSafeLinks(typed), 'Les mer [her](https://www.consult1.no)');
const link = parseMarkdown(withSafeLinks(typed))[0].inline.find((seg) => seg.href);
assert.equal(link.href, 'https://www.consult1.no');
assert.equal(withSafeLinks('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
assert.equal(withSafeLinks('[e-post](mailto:post@bedrift.no)'), '[e-post](mailto:post@bedrift.no)');

// Markering utenfor teksten klemmes inn.
out = applyFormat('abc', { start: 10, end: 20 }, 'bold');
assert.equal(out.text, 'abc**fet tekst**');

console.log('articleFormat.test.mjs ok');
