function latin1(bytes) {
  let text = '';
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    text += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + size)));
  }
  return text;
}

function u16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Kan ikke lese komprimert Word eller PDF i dette miljøet.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function zipEntries(bytes) {
  const files = [];
  let offset = 0;
  while (offset + 30 <= bytes.length && u32(bytes, offset) === 0x04034b50) {
    const method = u16(bytes, offset + 8);
    const compressed = u32(bytes, offset + 18);
    const nameLen = u16(bytes, offset + 26);
    const extraLen = u16(bytes, offset + 28);
    const name = latin1(bytes.subarray(offset + 30, offset + 30 + nameLen));
    const start = offset + 30 + nameLen + extraLen;
    const data = bytes.subarray(start, start + compressed);
    let raw = data;
    if (method === 8) raw = await inflateRaw(data);
    else if (method !== 0) throw new Error('Word-filen bruker en pakking som ikke kan leses her.');
    files.push({ name, data: raw });
    offset = start + Math.max(compressed, 1);
  }
  return files;
}

function stripXml(xml) {
  return String(xml || '')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^/]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export async function extractDocxText(bytes) {
  const files = await zipEntries(bytes);
  const document = files.find((file) => file.name === 'word/document.xml');
  if (!document) throw new Error('Fant ikke teksten i Word-filen.');
  const text = stripXml(new TextDecoder().decode(document.data)).replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('Word-filen ser tom ut.');
  return text;
}

function decodePdfLiteral(body) {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '\\') {
      out += body[i];
      continue;
    }
    const next = body[i + 1];
    if (next === 'n' || next === 'r') out += '\n';
    else if (next === 't') out += '\t';
    else if (next === '(' || next === ')' || next === '\\') out += next;
    else if (/[0-7]/.test(next || '')) {
      const octal = body.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] || next;
      out += String.fromCharCode(parseInt(octal, 8));
      i += octal.length - 1;
    } else out += next || '';
    i += 1;
  }
  return out;
}

function pdfOperatorsToText(source) {
  const parts = [];
  const literal = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  let match = literal.exec(source);
  while (match) {
    const body = match[0].slice(1, match[0].lastIndexOf(')'));
    const text = decodePdfLiteral(body).trim();
    if (text) parts.push(text);
    match = literal.exec(source);
  }
  const arrays = /\[(.*?)\]\s*TJ/gs;
  match = arrays.exec(source);
  while (match) {
    const inner = [...match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)];
    const text = inner.map((item) => decodePdfLiteral(item[0].slice(1, -1))).join('').trim();
    if (text) parts.push(text);
    match = arrays.exec(source);
  }
  return parts.join('\n');
}

export async function extractPdfText(bytes) {
  const raw = latin1(bytes);
  const chunks = [];
  const marker = /<<[^>]*?FlateDecode[^>]*?>>\s*stream\r?\n/g;
  let match = marker.exec(raw);
  while (match) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end > start) {
      let slice = raw.slice(start, end);
      if (slice.endsWith('\r\n')) slice = slice.slice(0, -2);
      else if (slice.endsWith('\n')) slice = slice.slice(0, -1);
      try {
        const inflated = await inflateRaw(Uint8Array.from(slice, (ch) => ch.charCodeAt(0)));
        chunks.push(pdfOperatorsToText(latin1(inflated)));
      } catch {
        // Neste strøm kan likevel inneholde teksten.
      }
    }
    match = marker.exec(raw);
  }
  chunks.push(pdfOperatorsToText(raw));
  const text = chunks.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 8) throw new Error('Fant ikke lesbar tekst i PDF-en. Lim inn teksten, eller bruk en digital PDF.');
  return text;
}

function kindOf(name, mime) {
  const file = String(name || '').toLowerCase();
  const type = String(mime || '').toLowerCase();
  if (type.includes('pdf') || file.endsWith('.pdf')) return 'pdf';
  if (type.includes('wordprocessingml') || file.endsWith('.docx')) return 'docx';
  if (type.startsWith('text/') || file.endsWith('.txt')) return 'text';
  return 'unknown';
}

export async function extractContractText(bytes, name, mime) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const kind = kindOf(name, mime);
  if (kind === 'text') return new TextDecoder('utf-8').decode(data).replace(/\u0000/g, '').trim();
  if (kind === 'docx') return extractDocxText(data);
  if (kind === 'pdf') return extractPdfText(data);
  throw new Error('Last opp PDF, Word (.docx) eller en tekstfil.');
}
