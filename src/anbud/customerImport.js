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
  if (!data?.length) return new Uint8Array();
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Kan ikke lese komprimert Excel-fil i denne nettleseren.');
  }
  const copy = new Uint8Array(data);
  try {
    const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    throw new Error('Kunne ikke pakke ut Excel-filen. Eksporter listen som CSV og importer den i stedet.');
  }
}

function findEocd(bytes) {
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (u32(bytes, i) !== 0x06054b50) continue;
    const commentLen = u16(bytes, i + 20);
    if (i + 22 + commentLen === bytes.length) return i;
  }
  return -1;
}

async function entryFromCentral(bytes, cursor) {
  if (cursor + 46 > bytes.length || u32(bytes, cursor) !== 0x02014b50) return null;
  const method = u16(bytes, cursor + 10);
  const compressed = u32(bytes, cursor + 20);
  const nameLen = u16(bytes, cursor + 28);
  const extraLen = u16(bytes, cursor + 30);
  const commentLen = u16(bytes, cursor + 32);
  const localOffset = u32(bytes, cursor + 42);
  if (compressed === 0xffffffff || localOffset === 0xffffffff) {
    throw new Error('Excel-filen er for stor til å leses her. Eksporter listen som CSV.');
  }
  const name = latin1(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
  if (localOffset + 30 > bytes.length || u32(bytes, localOffset) !== 0x04034b50) return null;
  const localNameLen = u16(bytes, localOffset + 26);
  const localExtraLen = u16(bytes, localOffset + 28);
  const start = localOffset + 30 + localNameLen + localExtraLen;
  const data = bytes.subarray(start, start + compressed);
  let raw = data;
  if (method === 8) raw = await inflateRaw(data);
  else if (method !== 0) throw new Error('Excel-filen bruker en pakking som ikke kan leses her.');
  return {
    file: { name, data: raw },
    next: cursor + 46 + nameLen + extraLen + commentLen,
  };
}

async function zipEntries(bytes) {
  const eocd = findEocd(bytes);
  if (eocd >= 0) {
    const count = u16(bytes, eocd + 10);
    let cursor = u32(bytes, eocd + 16);
    const files = [];
    for (let i = 0; i < count; i += 1) {
      const entry = await entryFromCentral(bytes, cursor);
      if (!entry) break;
      files.push(entry.file);
      cursor = entry.next;
    }
    if (files.length) return files;
  }
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
    else if (method !== 0) throw new Error('Excel-filen bruker en pakking som ikke kan leses her.');
    files.push({ name, data: raw });
    offset = start + compressed;
    if (!compressed) break;
  }
  return files;
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
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const HEADER_ALIASES = {
  name: ['navn', 'kundenavn', 'name', 'firma', 'firmanavn', 'kunde', 'selskapsnavn', 'company', 'legalname', 'kunden'],
  orgnr: ['orgnr', 'organisasjonsnummer', 'orgnummer', 'organizationnumber', 'vat', 'mva', 'org'],
  personnummer: ['personnummer', 'fodselsnummer', 'fnr', 'ssn', 'nationalid'],
  address: ['adresse', 'address', 'gate', 'street', 'besoksadresse', 'forretningsadresse'],
  postalCode: ['postnr', 'postnummer', 'zip', 'postalcode', 'postnrsted'],
  place: ['poststed', 'sted', 'city', 'by', 'kommune'],
  contactName: ['kontakt', 'kontaktperson', 'contact', 'kontaktnavn'],
  email: ['epost', 'email', 'mail'],
  invoiceEmail: ['fakturaepost', 'fakturaeposter', 'invoiceemail'],
  phone: ['telefon', 'tlf', 'mobil', 'phone', 'telefonnr'],
  notes: ['notat', 'notes', 'merknad', 'kommentar'],
  kind: ['type', 'kundetype', 'kind', 'kategori'],
  customerNo: ['kundenummer', 'kundenr', 'customernumber', 'kundeno'],
  website: ['nettside', 'hjemmeside', 'website', 'web'],
};

function addressColumn(key) {
  let slot = '';
  if (key.startsWith('hovedadresse')) slot = 'main';
  else if (key.startsWith('besoksadresse')) slot = 'visit';
  else if (key.startsWith('fakturaadresse')) slot = 'invoice';
  else return '';
  const fields = {
    main: { line1: 'address', line2: 'address2', postal: 'postalCode', place: 'place' },
    visit: { line1: 'visitAddress', line2: 'visitAddress2', postal: 'visitPostal', place: 'visitPlace' },
    invoice: { line1: 'invoiceAddress', line2: 'invoiceAddress2', postal: 'invoicePostal', place: 'invoicePlace' },
  };
  if (/linje2$/.test(key)) return fields[slot].line2;
  if (/linje1$|adresse1$/.test(key)) return fields[slot].line1;
  if (key.includes('postnummer') || key.endsWith('postnr')) return fields[slot].postal;
  if (key.includes('postalsted') || key.includes('poststed') || key.endsWith('sted')) return fields[slot].place;
  return '';
}

function mapHeader(header) {
  const key = foldHeader(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => foldHeader(alias) === key)) return field;
  }
  return addressColumn(key);
}

function kindFromValue(value) {
  const raw = foldHeader(value);
  if (!raw) return '';
  if (/(person|privat)/.test(raw)) return 'person';
  if (/(virksomhet|org|firma|company|as|bedrift)/.test(raw)) return 'org';
  return '';
}

function firstFilled(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function joinLines(...values) {
  return values.map((value) => String(value || '').trim()).filter(Boolean).join(', ');
}

function rowFromObject(src) {
  const name = String(src.name || '').trim();
  if (!name) return null;
  const kind = src.kind === 'person' || src.kind === 'org' ? src.kind : (kindFromValue(src.kind) || '');
  const address = firstFilled(
    joinLines(src.address, src.address2),
    joinLines(src.visitAddress, src.visitAddress2),
    joinLines(src.invoiceAddress, src.invoiceAddress2),
  );
  const notes = [
    src.customerNo ? `Kundenr ${String(src.customerNo).trim()}` : '',
    src.website,
    src.notes,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' · ');
  return emptyCustomer({
    name,
    kind,
    orgnr: src.orgnr || '',
    personnummer: src.personnummer || '',
    address,
    postalCode: firstFilled(src.postalCode, src.visitPostal, src.invoicePostal),
    place: firstFilled(src.place, src.visitPlace, src.invoicePlace),
    contactName: src.contactName || '',
    email: firstFilled(src.email, src.invoiceEmail),
    phone: src.phone || '',
    notes,
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

function recordsFromTable(table) {
  if (!table.length) return [];
  const headers = table[0].map(mapHeader);
  if (!headers.some(Boolean)) return [];
  const out = [];
  for (const cells of table.slice(1)) {
    const src = {};
    headers.forEach((key, index) => {
      if (!key) return;
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
    return recordsFromTable(spreadsheetMlRows(source));
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

function parseSheetRows(xml, strings) {
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
  return rows;
}

function parseSheetTable(xml, strings) {
  return recordsFromTable(parseSheetRows(xml, strings));
}

function spreadsheetMlRows(text) {
  return [...String(text || '').matchAll(/<Row\b[\s\S]*?<\/Row>/gi)].map((match) => (
    [...match[0].matchAll(/<Cell\b[\s\S]*?<\/Cell>|<Cell\b[^>]*\/>/gi)].map((cell) => {
      const data = cell[0].match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
      return data ? decodeEntities(data[1].replace(/<[^>]+>/g, '')).trim() : '';
    })
  ));
}

export async function readSpreadsheetTables(bytes, filename = '') {
  const name = String(filename || '').toLowerCase();
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!raw.length) throw new Error('Filen er tom.');
  const isZip = raw[0] === 0x50 && raw[1] === 0x4b;
  if (isZip || /\.xlsx$/i.test(name)) {
    const files = await zipEntries(raw);
    const stringsFile = files.find((file) => /xl\/sharedStrings\.xml$/i.test(file.name));
    const strings = stringsFile ? sharedStrings(decodeText(stringsFile.data)) : [];
    const sheets = files
      .filter((file) => /xl\/worksheets\/sheet\d+\.xml$/i.test(file.name))
      .sort((a, b) => {
        const left = Number(a.name.match(/sheet(\d+)/i)?.[1] || 0);
        const right = Number(b.name.match(/sheet(\d+)/i)?.[1] || 0);
        return left - right;
      });
    if (!sheets.length) throw new Error('Fant ingen regneark i Excel-filen.');
    return sheets.map((sheet) => ({
      name: sheet.name,
      table: parseSheetRows(decodeText(sheet.data), strings),
    }));
  }
  const text = decodeText(raw);
  if (/<Worksheet[\s>]|<ss:Worksheet/i.test(text) && /<Table[\s>]/i.test(text)) {
    return [{ name: filename || 'ark', table: spreadsheetMlRows(text) }];
  }
  return [{ name: filename || 'liste', table: parseCsvRecords(text) }];
}

async function parseXlsxCustomers(bytes) {
  const files = await zipEntries(bytes);
  const stringsFile = files.find((file) => /xl\/sharedStrings\.xml$/i.test(file.name));
  const sheet = files.find((file) => /xl\/worksheets\/sheet1\.xml$/i.test(file.name))
    || files.find((file) => /xl\/worksheets\/sheet\d+\.xml$/i.test(file.name));
  if (!sheet) throw new Error('Fant ingen regneark i Excel-filen.');
  const strings = stringsFile ? sharedStrings(decodeText(stringsFile.data)) : [];
  return parseSheetTable(decodeText(sheet.data), strings);
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
