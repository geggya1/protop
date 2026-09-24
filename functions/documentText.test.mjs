import { extractDocxText, stripDocxXml, classifyPlanMime, extractPdfText } from './documentText.js';
import { parseTimetableTokens, parseTimetablePositions } from './timetableParse.js';
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

assert.equal(stripDocxXml('<w:p>Hei</w:p><w:p>der</w:p>').includes('Hei'), true);

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function zipLocal(name, uncompressed) {
  const nameBuf = Buffer.from(name);
  const compressed = deflateRawSync(uncompressed);
  const crc = crc32(uncompressed);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(uncompressed.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuf, compressed]);
}

const xml = Buffer.from('<w:document><w:p><w:r><w:t>Matematikk mandag 09:00</w:t></w:r></w:p></w:document>');
const fakeDocx = Buffer.concat([
  zipLocal('word/document.xml', xml),
  zipLocal('[Content_Types].xml', Buffer.from('<Types/>')),
]);
const text = extractDocxText(fakeDocx);
assert.match(text, /Matematikk mandag 09:00/);

assert.equal(classifyPlanMime('application/pdf', 'x'), 'pdf');
assert.equal(classifyPlanMime('', 'plan.pdf'), 'pdf');
assert.equal(classifyPlanMime('image/jpeg', 'x.jpg'), 'image');
assert.equal(classifyPlanMime('', 'ukeplan.docx'), 'docx');

const here = dirname(fileURLToPath(import.meta.url));
const pdfBuf = readFileSync(join(here, 'fixtures/timeplan-7c.pdf'));
const extracted = await extractPdfText(pdfBuf);
assert.ok(extracted.text.includes('Mandag'));
assert.ok(extracted.tokens.length > 20);
assert.ok(extracted.positionedItems.length > 20);
const slots = parseTimetablePositions(extracted.positionedItems);
assert.ok(slots.length >= 30, `expected >=30 slots with breaks, got ${slots.length}`);
assert.equal(slots[0].time, '08:25');
assert.equal(slots[0].title, 'NORSK (ET)');
const fourthPeriod = slots.filter((s) => s.time === '13:00' && !/friminutt|spising/i.test(s.title));
assert.ok(!fourthPeriod.some((s) => s.day === 'mon'), 'mandag 4.økt skal være tom');
assert.equal(fourthPeriod.find((s) => s.day === 'tue')?.title, 'KRLE (HE)');
assert.ok(slots.some((s) => s.title === 'Friminutt' && s.day === 'mon'));
assert.ok(slots.some((s) => s.title === 'Spising' && s.day === 'fri'));

console.log('documentText.test.mjs ok');
