/**
 * Leser kundelister fra CSV, XML og Excel (xlsx / SpreadsheetML).
 */
import { emptyCustomer } from './customers.js';

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
    throw new Error('Kan ikke lese komprimert Excel-fil i dette miljøet.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

function findEocd(bytes) {
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (u32(bytes, i) === 0x06054b50) return i;
  }
  return -1;
}

async function inflateZipPayload(data, method) {
  if (method === 0) return data;
  if (method !== 8) throw new Error('Excel-filen bruker en pakking som ikke kan leses her.');
  try {
    return await inflateRaw(data);
  } catch {
    if (typeof DecompressionStream === 'undefined') throw new Error('Kan ikke lese komprimert Excel-fil i dette miljøet.');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
}

/** Leser via sentral katalog — Excel setter ofte compressed size 0 i local header (data descriptor). */
async function zipEntriesFromCentral(bytes) {
  const eocd = findEocd(bytes);
  if (eocd < 0) return [];
  const cdSize = u32(bytes, eocd + 12);
  const cdOff = u32(bytes, eocd + 16);
  const files = [];
  let offset = cdOff;
  const end = Math.min(bytes.length, cdOff + cdSize);
  while (offset + 46 <= end && u32(bytes, offset) === 0x02014b50) {
    const method = u16(bytes, offset + 10);
    const compressed = u32(bytes, offset + 20);
    const nameLen = u16(bytes, offset + 28);
    const extraLen = u16(bytes, offset + 30);
    const commentLen = u16(bytes, offset + 32);
    const localOff = u32(bytes, offset + 42);
    const name = latin1(bytes.subarray(offset + 46, offset + 46 + nameLen));
    if (localOff + 30 <= bytes.length && u32(bytes, localOff) === 0x04034b50) {
      const localNameLen = u16(bytes, localOff + 26);
      const localExtra = u16(bytes, localOff + 28);
      const start = localOff + 30 + localNameLen + localExtra;
      const data = bytes.subarray(start, start + compressed);
      files.push({ name, data: await inflateZipPayload(data, method) });
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function zipEntriesLocal(bytes) {
  const files = [];
  let offset = 0;
  while (offset + 30 <= bytes.length && u32(bytes, offset) === 0x04034b50) {
    const flags = u16(bytes, offset + 6);
    const method = u16(bytes, offset + 8);
    let compressed = u32(bytes, offset + 18);
    const nameLen = u16(bytes, offset + 26);
    const extraLen = u16(bytes, offset + 28);
    const name = latin1(bytes.subarray(offset + 30, offset + 30 + nameLen));
    const start = offset + 30 + nameLen + extraLen;
    if ((flags & 8) && !compressed) break;
    const data = bytes.subarray(start, start + compressed);
    files.push({ name, data: await inflateZipPayload(data, method) });
    offset = start + Math.max(compressed, 1);
  }
  return files;
}

async function zipEntries(bytes) {
  const fromCentral = await zipEntriesFromCentral(bytes);
  if (fromCentral.length) return fromCentral;
  return zipEntriesLocal(bytes);
}

function decodeText(bytes) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(raw).replace(/^\uFEFF/, '');
  } catch {
    return latin1(raw);
  }
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function foldHeader(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const HEADER_ALIASES = {
  name: ['navn', 'kundenavn', 'name', 'firma', 'firmanavn', 'kunde', 'selskapsnavn', 'company', 'legalname', 'kunden'],
  orgnr: ['orgnr', 'organisasjonsnummer', 'orgnummer', 'organizationnumber', 'org'],
  vat: ['mva', 'mvanummer', 'mvanr', 'vat', 'vatnumber'],
  personnummer: ['personnummer', 'fodselsnummer', 'fnr', 'ssn', 'nationalid'],
  address: ['adresse', 'address', 'gate', 'street', 'besoksadresse', 'forretningsadresse'],
  postalCode: ['postnr', 'postnummer', 'zip', 'postalcode', 'postnrsted'],
  place: ['poststed', 'sted', 'city', 'by', 'kommune', 'postalsted'],
  contactName: ['kontakt', 'kontaktperson', 'contact', 'kontaktnavn'],
  email: ['epost', 'email', 'mail', 'e-post', 'fakturaeposter', 'fakturaepost'],
  phone: ['telefon', 'tlf', 'mobil', 'phone', 'telefonnr'],
  notes: ['notat', 'notes', 'merknad', 'kommentar'],
  kind: ['type', 'kundetype', 'kind', 'kategori'],
};

function mapHeader(header) {
  const key = foldHeader(header);
  if (!key || key === 'kundenummer' || key === 'customernumber') return '';
  if (key.includes('kundenavn')) return 'name';
  if (key.includes('organisasjonsnummer') || key.includes('orgnr')) return 'orgnr';
  if (key.includes('mvanummer') || key === 'mva') return 'vat';
  if (key.includes('personnummer') || key.includes('fodselsnummer')) return 'personnummer';
  if (key.includes('fakturaepost')) return 'email';
  if ((key.includes('hovedadresse') || key.includes('besoksadresse') || key.includes('fakturaadresse')) && (key.includes('linje1') || key.endsWith('adresse'))) {
    if (key.includes('hovedadresse')) return 'address';
    if (key.includes('besoksadresse')) return 'visitAddress';
    return 'invoiceAddress';
  }
  if ((key.includes('hovedadresse') || key.includes('besoksadresse') || key.includes('fakturaadresse')) && (key.includes('postnummer') || key.includes('postnr'))) {
    if (key.includes('hovedadresse')) return 'postalCode';
    if (key.includes('besoksadresse')) return 'visitPostalCode';
    return 'invoicePostalCode';
  }
  if ((key.includes('hovedadresse') || key.includes('besoksadresse') || key.includes('fakturaadresse')) && (key.includes('sted') || key.includes('city'))) {
    if (key.includes('hovedadresse')) return 'place';
    if (key.includes('besoksadresse')) return 'visitPlace';
    return 'invoicePlace';
  }
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => foldHeader(alias) === key)) return field;
  }
  return '';
}

function kindFromValue(value) {
  const raw = foldHeader(value);
  if (!raw) return '';
  if (/(person|privat)/.test(raw)) return 'person';
  if (/(virksomhet|org|firma|company|as|bedrift)/.test(raw)) return 'org';
  return '';
}

function rowFromObject(src) {
  const name = String(src.name || '').trim();
  if (!name) return null;
  const kind = src.kind === 'person' || src.kind === 'org' ? src.kind : (kindFromValue(src.kind) || '');
  return emptyCustomer({
    name,
    kind,
    orgnr: src.orgnr || src.vat || '',
    personnummer: src.personnummer || '',
    address: src.address || src.visitAddress || src.invoiceAddress || '',
    postalCode: src.postalCode || src.visitPostalCode || src.invoicePostalCode || '',
    place: src.place || src.visitPlace || src.invoicePlace || '',
    contactName: src.contactName || '',
    email: src.email || '',
    phone: src.phone || '',
    notes: src.notes || '',
  });
}

function parseCsvRecords(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const first = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = (first.match(/;/g) || []).length >= (first.match(/\t/g) || []).length
    && (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length
    ? ';'
    : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length
      ? '\t'
      : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    if (row.some((value) => String(value).trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) pushCell();
    else if (ch === '\n') {
      pushCell();
      pushRow();
    } else if (ch !== '\r') cell += ch;
  }
  pushCell();
  pushRow();
  return rows;
}

function headerIndex(table) {
  const limit = Math.min(table.length, 8);
  for (let i = 0; i < limit; i += 1) {
    const headers = (table[i] || []).map(mapHeader);
    if (headers.includes('name') && (headers.includes('orgnr') || headers.includes('vat') || headers.includes('personnummer') || headers.includes('email'))) {
      return i;
    }
  }
  const first = (table[0] || []).map(mapHeader);
  return first.some(Boolean) ? 0 : -1;
}

function recordsFromTable(table) {
  if (!table.length) return [];
  const start = headerIndex(table);
  if (start < 0) return [];
  const headers = table[start].map(mapHeader);
  const out = [];
  for (const cells of table.slice(start + 1)) {
    const src = {};
    headers.forEach((key, index) => {
      if (!key || src[key]) return;
      src[key] = String(cells[index] || '').trim();
    });
    const row = rowFromObject(src);
    if (row) out.push(row);
  }
  return out;
}

function parseCsvCustomers(text) {
  return recordsFromTable(parseCsvRecords(text));
}

function xmlTagValue(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
    if (match) return decodeEntities(match[1].replace(/<[^>]+>/g, '')).trim();
  }
  return '';
}

function parseXmlCustomers(text) {
  const source = String(text || '');
  if (/<Worksheet[\s>]|<ss:Worksheet/i.test(source) && /<Table[\s>]/i.test(source)) {
    const rows = [...source.matchAll(/<Row\b[\s\S]*?<\/Row>/gi)].map((match) => (
      [...match[0].matchAll(/<Cell\b[\s\S]*?<\/Cell>|<Cell\b[^>]*\/>/gi)].map((cell) => {
        const data = cell[0].match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
        return data ? decodeEntities(data[1].replace(/<[^>]+>/g, '')).trim() : '';
      })
    ));
    return recordsFromTable(rows);
  }
  const blocks = [...source.matchAll(/<(kunde|customer|klient|client|part)\b[^>]*>[\s\S]*?<\/\1>/gi)];
  if (!blocks.length) return [];
  return blocks.map((match) => rowFromObject({
    name: xmlTagValue(match[0], ['navn', 'name', 'kundenavn', 'firmanavn', 'legalName']),
    orgnr: xmlTagValue(match[0], ['orgnr', 'organisasjonsnummer', 'orgNo', 'vatNumber']),
    personnummer: xmlTagValue(match[0], ['personnummer', 'fodselsnummer', 'fødselsnummer', 'ssn']),
    address: xmlTagValue(match[0], ['adresse', 'address', 'gate']),
    postalCode: xmlTagValue(match[0], ['postnr', 'postnummer', 'postalCode', 'zip']),
    place: xmlTagValue(match[0], ['poststed', 'sted', 'city', 'kommune']),
    contactName: xmlTagValue(match[0], ['kontakt', 'kontaktperson', 'contact']),
    email: xmlTagValue(match[0], ['epost', 'email', 'e-post']),
    phone: xmlTagValue(match[0], ['telefon', 'phone', 'mobil', 'tlf']),
    notes: xmlTagValue(match[0], ['notat', 'notes', 'merknad']),
    kind: xmlTagValue(match[0], ['type', 'kundetype', 'kind']),
  })).filter(Boolean);
}

function colIndex(ref) {
  const letters = String(ref || '').match(/^[A-Z]+/i)?.[0] || '';
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function sharedStrings(xml) {
  return [...String(xml || '').matchAll(/<si\b[\s\S]*?<\/si>/gi)].map((match) => (
    [...match[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
      .map((part) => decodeEntities(part[1]))
      .join('')
  ));
}

function parseSheetTable(xml, strings) {
  const rows = [];
  for (const rowMatch of String(xml || '').matchAll(/<row\b[\s\S]*?<\/row>/gi)) {
    const cells = [];
    for (const cellMatch of rowMatch[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\br="([^"]+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] || '';
      const index = colIndex(ref);
      let value = '';
      if (type === 's') {
        const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1];
        value = strings[Number(v)] || '';
      } else if (type === 'inlineStr') {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((part) => decodeEntities(part[1])).join('');
      } else {
        value = decodeEntities(body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] || '');
      }
      cells[index] = value.trim();
    }
    rows.push(cells.map((cell) => cell || ''));
  }
  return recordsFromTable(rows);
}

async function parseXlsxCustomers(bytes) {
  const files = await zipEntries(bytes);
  const stringsFile = files.find((file) => /xl\/sharedStrings\.xml$/i.test(file.name));
  const sheet = files.find((file) => /xl\/worksheets\/sheet1\.xml$/i.test(file.name))
    || files.find((file) => /xl\/worksheets\/sheet\d+\.xml$/i.test(file.name));
  if (!sheet) throw new Error('Fant ingen regneark i Excel-filen.');
  const strings = stringsFile ? sharedStrings(decodeText(stringsFile.data)) : [];
  const rows = parseSheetTable(decodeText(sheet.data), strings);
  if (!rows.length) {
    throw new Error('Fant ingen kunder i Excel-filen. Trenger en kolonne med kundenavn.');
  }
  return rows;
}

export async function parseCustomerFile(bytes, filename = '') {
  const name = String(filename || '').toLowerCase();
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!raw.length) throw new Error('Filen er tom.');
  const isZip = raw[0] === 0x50 && raw[1] === 0x4b;
  if (isZip || /\.xlsx$/i.test(name)) {
    return parseXlsxCustomers(raw);
  }
  const text = decodeText(raw);
  if (/<[?]xml|<(kunder|customers|kunde|customer|Workbook|Worksheet)\b/i.test(text) || /\.xml$|\.xlm$/i.test(name)) {
    const fromXml = parseXmlCustomers(text);
    if (fromXml.length) return fromXml;
  }
  const fromCsv = parseCsvCustomers(text);
  if (fromCsv.length) return fromCsv;
  throw new Error('Fant ingen kunder i filen. Bruk CSV, XML eller Excel med kolonner som Navn og Org.nr.');
}

export const CUSTOMER_IMPORT_ACCEPT = [
  '.csv', '.txt', '.xml', '.xls', '.xlsx', '.xlm',
  'text/csv', 'text/plain', 'application/xml', 'text/xml',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');
