/**
 * Leser filene i en ZIP (lagret eller deflate) via den sentrale katalogen, så størrelsene
 * er riktige også når lokale hoder bruker databeskrivelse. Brukes for fakturadokumentet
 * fra PowerOffice, som kommer som ZIP.
 */
import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function isZip(bytes) {
  return !!bytes && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function readZipEntries(input, { maxBytes = 40 * 1024 * 1024 } = {}) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i -= 1) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP-filen er ikke gyldig.');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const out = [];
  let total = 0;
  for (let n = 0; n < count; n += 1) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL) throw new Error('ZIP-filen er ikke gyldig.');
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const size = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const local = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    offset += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL) throw new Error('ZIP-filen er ikke gyldig.');
    total += size;
    if (total > maxBytes) throw new Error('Filene i ZIP-filen er for store.');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) });
    else throw new Error(`ZIP-filen bruker en komprimering ProTop ikke kan lese (${method}).`);
    out.push({ name, data });
  }
  return out;
}
