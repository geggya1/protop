import assert from 'node:assert/strict';
import { hasChatMarkdown, parseChatMarkdown, parseInlineMarkdown } from './chatMarkdown.js';

{
  const segs = parseInlineMarkdown('Hei **Fredag** og *kos* pluss `x`');
  assert.deepEqual(
    segs.map((s) => ({ text: s.text, bold: !!s.bold, italic: !!s.italic, code: !!s.code })),
    [
      { text: 'Hei ', bold: false, italic: false, code: false },
      { text: 'Fredag', bold: true, italic: false, code: false },
      { text: ' og ', bold: false, italic: false, code: false },
      { text: 'kos', bold: false, italic: true, code: false },
      { text: ' pluss ', bold: false, italic: false, code: false },
      { text: 'x', bold: false, italic: false, code: true },
    ],
  );
}

{
  const blocks = parseChatMarkdown('* **Fredag (Helgemat):** taco\n* **Lørdag:** pizza\n\nKoselig!');
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].type, 'ul');
  assert.equal(blocks[0].segments[0].text, '• ');
  assert.ok(blocks[0].segments.some((s) => s.bold && s.text.includes('Fredag')));
  assert.equal(blocks[1].type, 'ul');
  assert.ok(blocks[1].segments.some((s) => s.bold && s.text.includes('Lørdag')));
  assert.equal(blocks[2].type, 'p');
  assert.equal(blocks[2].segments[0].text, '');
  assert.equal(blocks[3].segments[0].text, 'Koselig!');
}

assert.equal(hasChatMarkdown('vanlig tekst'), false);
assert.equal(hasChatMarkdown('**fet**'), true);
assert.equal(hasChatMarkdown('* punkt'), true);

console.log('chatMarkdown.test.mjs ok');
