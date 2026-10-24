/** Identifiserer KGV og henter offentlig konkurransegrunnlag.
 * Innlogging, CAPTCHA og MFA omgås ikke. Interesse registreres ikke her.
 */

import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { normalizeCompetitionUrl } from './competitionUrl.js';
import { parseMercellCatalog, readPortalCatalog } from './portalCatalog.js';

const MAX_BYTES = 8 * 1024 * 1024;
const FILE_NAME = /[^"\\<>]+\.(?:pdf|docx?|xlsx?|pptx?|zip|dwg|txt|odt|ods|csv|xml)/i;

const PLATFORMS = [
  { id: 'artifik', name: 'Artifik', host: /(^|\.)artifik\.no$/ },
  { id: 'mercell', name: 'Mercell', host: /(^|\.)mercell\.com$/ },
  { id: 'eusupply', name: 'EU-Supply', host: /(^|\.)eu-supply\.com$/ },
  { id: 'tendsign', name: 'TendSign', host: /(^|\.)tendsign\.(no|com)$/ },
  { id: 'hyyr', name: 'Hyyr', host: /(^|\.)hyyr\.no$/ },
  { id: 'doffin', name: 'Doffin', host: /(^|\.)doffin\.no$/ },
  { id: 'ted', name: 'TED', host: /(^|\.)ted\.europa\.eu$/ },
];

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return text(String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'));
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function identifySource(url) {
  const host = hostOf(url);
  const hit = PLATFORMS.find((row) => row.host.test(host));
  if (hit) return { id: hit.id, name: hit.name, host };
  return { id: host ? 'other' : '', name: host || '', host };
}

export function artifikProcId(url) {
  const match = String(url || '').match(/artifik\.no\/procurements\/(\d+)/i);
  return match ? match[1] : '';
}

/** Artifik (React Router) legger sidedata i en «turbo-stream»: én flat tabell der objekter peker på andre plasser med indeks. */
export function decodeTurboStream(html) {
  const source = String(html || '');
  const chunks = [];
  for (const match of source.matchAll(/streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/g)) {
    try {
      chunks.push(JSON.parse(match[1]));
    } catch {
      // Ødelagt bit. De andre kan fortsatt leses.
    }
  }
  if (!chunks.length) return [];
  try {
    const table = JSON.parse(chunks.join('').split('\n')[0]);
    return Array.isArray(table) ? table : [];
  } catch {
    return [];
  }
}

/** Alle vanlige objekter i strømmen, med feltnavn og verdier slått opp ett nivå. */
export function turboObjects(table) {
  const rows = [];
  const look = (value) => (typeof value === 'number' && value >= 0 && value < table.length ? table[value] : undefined);
  for (const entry of table) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = {};
    let plain = true;
    for (const [ref, value] of Object.entries(entry)) {
      const name = /^_\d+$/.test(ref) ? table[Number(ref.slice(1))] : null;
      if (typeof name !== 'string') {
        plain = false;
        break;
      }
      row[name] = look(value);
    }
    if (plain) rows.push(row);
  }
  return rows;
}

function artifikFilesFromStream(source) {
  const files = [];
  const seen = new Set();
  for (const row of turboObjects(decodeTurboStream(source))) {
    const key = typeof row.key === 'string' ? row.key : '';
    const match = key.match(/^procurementAttachments\/(\d+)\/[0-9a-f-]{36}$/i);
    if (!match || typeof row.name !== 'string' || !FILE_NAME.test(row.name) || row.isDeleted === true) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push({
      name: text(row.name),
      // Artifik krever filnavnet nøyaktig som lagret (også doble mellomrom) for å gi ut filen.
      portalName: row.name,
      sourceId: key,
      key,
      procId: match[1],
      publishedAt: typeof row.lastModified === 'string' ? row.lastModified : '',
      orderIndex: typeof row.orderIndex === 'number' ? row.orderIndex : null,
      access: 'public',
    });
  }
  // Samme rekkefølge som på Artifik.
  return files
    .sort((a, b) => (a.orderIndex ?? 1e9) - (b.orderIndex ?? 1e9))
    .map(({ orderIndex, ...file }) => file);
}

export function parseArtifikFiles(source) {
  const streamed = artifikFilesFromStream(source);
  if (streamed.length) return streamed;
  const raw = String(source || '').replace(/\\"/g, '"');
  const files = [];
  const seen = new Set();
  const pattern = /"([^"\\]+\.(?:pdf|docx?|xlsx?|pptx?|zip|dwg|txt|odt|ods|csv))"[\s\S]{0,240}?"(procurementAttachments\/(\d+)\/[0-9a-f-]{36})"/gi;
  let match = pattern.exec(raw);
  while (match) {
    const name = decodeHtml(match[1]);
    const key = match[2];
    if (name && !seen.has(key)) {
      seen.add(key);
      const published = match[0].match(/"(\d{4}-\d{2}-\d{2}T[^"]+)"/);
      files.push({
        name,
        sourceId: key,
        key,
        procId: match[3],
        publishedAt: published ? published[1] : '',
        access: 'public',
      });
    }
    match = pattern.exec(raw);
  }
  return files;
}

export function parseArtifikQaIndex(html) {
  const source = String(html || '');
  const rows = [];
  const seen = new Set();
  const pattern = /href="\/procurements\/(\d+)\/qas\/(\d+)"[\s\S]{0,900}?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]{0,400}?Publisert den(?:<!--\s*-->|\s)*(\d{2}\/\d{2}\/\d{4})/gi;
  let match = pattern.exec(source);
  while (match) {
    const id = match[2];
    if (!seen.has(id)) {
      seen.add(id);
      rows.push({
        id,
        procId: match[1],
        question: decodeHtml(match[3]),
        published: match[4],
        url: `https://app.artifik.no/procurements/${match[1]}/qas/${id}`,
      });
    }
    match = pattern.exec(source);
  }
  return rows;
}

function osloDate(iso) {
  const at = Date.parse(String(iso || ''));
  if (!at) return '';
  const parts = new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(new Date(at));
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('day')}/${pick('month')}/${pick('year')}`;
}

/** Artifik lagrer svar som HTML fra en editor. Behold avsnitt, fjern resten. */
export function richText(value) {
  const plain = String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return plain
    .split('\n')
    .map((line) => line.replace(/[ \t\r\f\v]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Spørsmål og svar fra Artifik-sidens datastrøm. Listesiden har hele svaret. */
export function parseArtifikQaStream(html, procId) {
  const rows = [];
  const seen = new Set();
  for (const row of turboObjects(decodeTurboStream(html))) {
    if (typeof row.question !== 'string' || !('answer' in row)) continue;
    const id = String(row.id ?? '');
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      procId: String(procId || ''),
      title: typeof row.title === 'string' ? richText(row.title) : '',
      question: richText(row.question),
      answer: typeof row.answer === 'string' ? richText(row.answer) : '',
      published: osloDate(row.publishedDate),
      url: `https://app.artifik.no/procurements/${procId}/qas/${id}`,
    });
  }
  return rows;
}

export function parseArtifikQaBody(html) {
  const source = String(html || '');
  const match = source.match(/\\"question\\",\\"([\s\S]*?)\\",\\"answer\\",\\"([\s\S]*?)\\"(?:,\\"publishedDate\\"|,\\"files\\")/);
  if (!match) return { question: '', answer: '' };
  const unescape = (value) => value
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
  return {
    question: richText(unescape(match[1])),
    answer: richText(unescape(match[2])),
  };
}

function pageHeaders(referer) {
  return {
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'nb',
    'User-Agent': 'ProTop',
    ...(referer ? { Referer: referer } : {}),
  };
}

async function readText(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
    headers: pageHeaders(url),
  });
  if (!res.ok) throw new Error(`Kilden svarte ${res.status}`);
  const contentType = String(res.headers.get('content-type') || '');
  if (/pdf|officedocument|octet-stream|zip|sheet|word/i.test(contentType)) {
    return { html: '', finalUrl: res.url || url, contentType, directFile: true };
  }
  return { html: await res.text(), finalUrl: res.url || url, contentType, directFile: false };
}

export async function readArtifik(url) {
  const procId = artifikProcId(url);
  if (!procId) {
    const error = new Error('Artifik-adressen mangler konkurransenummer.');
    error.code = 'invalid-argument';
    throw error;
  }
  const pageUrl = `https://app.artifik.no/procurements/${procId}`;
  const [home, details, qas] = await Promise.all([
    readText(pageUrl),
    readText(`${pageUrl}/details`),
    readText(`${pageUrl}/qas`),
  ]);
  // Hver side har sin egen datastrøm, så de leses hver for seg.
  const files = [];
  const seenFiles = new Set();
  for (const file of [...parseArtifikFiles(details.html), ...parseArtifikFiles(home.html)]) {
    if (seenFiles.has(file.key)) continue;
    seenFiles.add(file.key);
    files.push(file);
  }
  const streamed = parseArtifikQaStream(qas.html, procId);
  const index = streamed.length ? [] : parseArtifikQaIndex(qas.html);
  const qa = [...streamed];
  for (const row of index.slice(0, 20)) {
    try {
      const detail = await readText(row.url);
      const body = parseArtifikQaBody(detail.html);
      qa.push({
        id: row.id,
        question: body.question || row.question,
        answer: body.answer,
        published: row.published,
        url: row.url,
      });
    } catch {
      qa.push({ ...row, answer: '' });
    }
  }
  return {
    ok: true,
    source: { id: 'artifik', name: 'Artifik' },
    documentsUrl: pageUrl,
    access: files.length ? 'public' : 'login',
    note: files.length
      ? 'Konkurransedokumentene er offentlig tilgjengelige på Artifik. Å levere tilbud krever innlogging der.'
      : 'Artifik viser ikke offentlige dokumenter for denne konkurransen. Logg inn på Artifik for å se om de krever interesse.',
    interestUrl: '',
    files: files.map((file) => ({
      ...file,
      download: { kind: 'artifik', procId: file.procId || procId, name: file.portalName || file.name, key: file.key },
    })),
    qa,
    checkedAt: new Date().toISOString(),
  };
}

function publicFileLinks(html, pageUrl, source) {
  const files = [];
  const seen = new Set();
  const pattern = /href=(['"])(.*?)\1/gi;
  let match = pattern.exec(String(html || ''));
  while (match) {
    let href = '';
    try {
      href = new URL(decodeHtml(match[2]), pageUrl).href;
    } catch {
      href = '';
    }
    if (!href || seen.has(href) || identifySource(href).id !== source.id) {
      match = pattern.exec(String(html || ''));
      continue;
    }
    const name = decodeURIComponent(href.split('?')[0].split('/').pop() || '');
    if (FILE_NAME.test(name)) {
      seen.add(href);
      files.push({
        name,
        sourceId: href,
        url: href,
        access: 'public',
        download: { kind: 'url', url: href },
      });
    }
    match = pattern.exec(String(html || ''));
  }
  return files;
}

async function readPublicPage(url, source) {
  if (!source.id || source.id === 'other') {
    return {
      ok: true,
      source,
      documentsUrl: url,
      access: 'unknown',
      note: 'Protop kjenner ikke en offentlig dokumentinnhenting for denne adressen. Åpne originalkilden, eller last opp filene selv.',
      interestUrl: '',
      files: [],
      qa: [],
      checkedAt: new Date().toISOString(),
    };
  }
  const page = await readText(url);
  const mimeHint = page.html.slice(0, 200);
  if (page.directFile || (!/<html|<!doctype/i.test(mimeHint) && FILE_NAME.test(url))) {
    return {
      ok: true,
      source,
      documentsUrl: url,
      access: 'public',
      note: '',
      interestUrl: '',
      files: [{
        name: decodeURIComponent(url.split('/').pop() || 'dokument'),
        sourceId: url,
        url,
        access: 'public',
        download: { kind: 'url', url },
      }],
      qa: [],
      checkedAt: new Date().toISOString(),
    };
  }
  const files = publicFileLinks(page.html, page.finalUrl, source);
  const login = /logg inn|sign in|login/i.test(page.html) && !files.length;
  return {
    ok: true,
    source,
    documentsUrl: url,
    access: files.length ? 'public' : (login ? 'login' : 'unknown'),
    note: files.length
      ? ''
      : login
        ? `Dokumentene på ${source.name} krever innlogging. Protop lagrer ikke passord og registrerer ikke interesse automatisk.`
        : `${source.name} har ingen direkte fil-lenker på den offentlige siden.`,
    interestUrl: '',
    files,
    qa: [],
    checkedAt: new Date().toISOString(),
  };
}

function decodeLatinName(value) {
  const bytes = [];
  const raw = String(value || '');
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '%' && /^[0-9a-f]{2}$/i.test(raw.slice(i + 1, i + 3))) {
      bytes.push(parseInt(raw.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(raw.charCodeAt(i) & 0xff);
    }
  }
  return text(Buffer.from(bytes).toString('latin1'));
}

export function parseEuSupplyDocuments(html) {
  const source = String(html || '');
  const archive = (source.match(/strArchiveType\s*=\s*'(\d+)'/) || [])[1] || '';
  const domain = (source.match(/strDomain\s*=\s*'(https:\/\/[^']+)'/) || [])[1] || 'https://eu.eu-supply.com';
  if (!archive || identifySource(domain).id !== 'eusupply') return [];
  const names = new Map();
  for (const match of source.matchAll(/var sDoc_(\d+)='([^']*)'/g)) {
    names.set(match[1], decodeLatinName(match[2]));
  }
  const files = [];
  const seen = new Set();
  for (const match of source.matchAll(/DownloadPublicDocument\('(\d+)','[^']*','(\d+)'\)/g)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const url = `${domain}/app/docmgmt/downloadPublicDocument.asp?FMT=5&AT=${archive}&LID=${match[2]}&DVID=${id}`;
    files.push({
      name: names.get(id) || `dokument-${id}`,
      sourceId: `eusupply:${id}`,
      url,
      access: 'public',
      download: { kind: 'url', url },
    });
  }
  return files;
}

function storeCookies(jar, res) {
  const rows = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const row of rows) {
    const pair = String(row || '').split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

async function readHtmlWithCookies(url, sourceId, jar = new Map()) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    if (identifySource(current).id !== sourceId) throw new Error('Viderekoblingen forlot den offentlige kilden.');
    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(25000),
      headers: {
        ...pageHeaders(current),
        ...(jar.size ? { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') } : {}),
      },
    });
    storeCookies(jar, res);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) break;
      current = new URL(location, current).href;
      continue;
    }
    if (!res.ok) throw new Error(`Kilden svarte ${res.status}`);
    return { html: await res.text(), finalUrl: current };
  }
  throw new Error('Kilden svarte med en viderekobling som ikke lot seg følge.');
}

async function readEuSupply(url) {
  const page = await readHtmlWithCookies(url, 'eusupply');
  let html = page.html;
  let finalUrl = page.finalUrl;
  const docsHref = (html.match(/href="(\/app\/rfq\/publicpurchase_docs\.asp[^"]+)"/i) || [])[1];
  if (docsHref) {
    const docs = await readHtmlWithCookies(new URL(docsHref, finalUrl).href, 'eusupply');
    html = docs.html;
    finalUrl = docs.finalUrl;
  }
  const files = parseEuSupplyDocuments(html);
  return {
    ok: true,
    source: { id: 'eusupply', name: 'EU-Supply' },
    documentsUrl: finalUrl,
    access: files.length ? 'public' : 'login',
    note: files.length
      ? 'Offentlige EU-Supply-dokumenter er hentet. Filer som krever pålogging blir stående uten innhold.'
      : 'EU-Supply viser ikke offentlige dokumenter her. Innlogging og interesseregistrering gjøres på portalen, ikke automatisk i Protop.',
    interestUrl: '',
    files,
    qa: [],
    checkedAt: new Date().toISOString(),
  };
}

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
  csv: 'text/csv',
  xml: 'application/xml',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  dwg: 'application/acad',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function mimeOf(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/** Leser innholdsfortegnelsen i en zip-fil (uten zip64). */
export function zipEntries(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return [];
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let n = 0; n < count && at + 46 <= buf.length; n += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break;
    const method = buf.readUInt16LE(at + 10);
    const compressedSize = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const offset = buf.readUInt32LE(at + 42);
    // Moderne portaler skriver filnavn i UTF-8, også når flagget mangler.
    const name = buf.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    entries.push({ name, method, compressedSize, size, offset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function zipEntryBytes(buffer, entry) {
  const at = entry.offset;
  if (buffer.readUInt32LE(at) !== 0x04034b50) throw new Error('Zip-filen er ødelagt.');
  const start = at + 30 + buffer.readUInt16LE(at + 26) + buffer.readUInt16LE(at + 28);
  const data = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error('Zip-filen bruker en ukjent komprimering.');
}

const NB_MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const HYYR_DATE = /(\d{1,2})\. ([a-zæøå]+) (\d{4}) \d{2}:\d{2}/i;

function hyyrDate(match) {
  if (!match) return '';
  const month = NB_MONTHS.indexOf(String(match[2]).toLowerCase()) + 1;
  if (!month) return '';
  return `${String(match[1]).padStart(2, '0')}/${String(month).padStart(2, '0')}/${match[3]}`;
}

/** Deler Hyyrs «Spørsmål og svar.pdf» (som tekst) opp i spørsmål og svar. */
export function parseHyyrQa(source) {
  const raw = String(source || '').replace(/\s+/g, ' ');
  const parts = raw.split(/Spørsmål (\d+): /).slice(1);
  const rows = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const number = parts[i];
    const body = parts[i + 1];
    const asked = body.match(HYYR_DATE);
    if (!asked) continue;
    const title = text(body.slice(0, asked.index));
    const rest = body.slice(asked.index + asked[0].length);
    const split = rest.split(/Svar fra oppdragsgiver /);
    const question = text(split[0]);
    const answer = split.slice(1).map((chunk) => text(chunk.replace(HYYR_DATE, ''))).filter(Boolean).join('\n\n');
    rows.push({
      id: `hyyr-${number}`,
      title,
      question: question || title,
      answer,
      published: hyyrDate(asked),
    });
  }
  return rows;
}

export function hyyrProcurementId(url) {
  const match = String(url || '').match(/hyyr\.no\/procurement\/([a-z0-9]{10,40})/i);
  return match ? match[1] : '';
}

const HYYR_ZIP_MAX = 80 * 1024 * 1024;
const HYYR_ZIP_TTL = 15 * 60 * 1000;
// Hosting avbryter etter 60 s. Grunnlaget svarer uten spørsmål og svar hvis zip-en ikke er klar innen dette.
const HYYR_ZIP_WAIT = 35 * 1000;
const HYYR_ZIPS = new Map();

function tooLargeError() {
  const error = new Error('Vedleggene er for store til å hentes samlet.');
  error.tooLarge = true;
  return error;
}

async function fetchHyyrZip(id) {
  const res = await fetch(`https://www.hyyr.no/api/public/procurement/${id}/download`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(170000),
    headers: { Accept: 'application/zip, */*', 'User-Agent': 'ProTop' },
  });
  if (identifySource(res.url || 'https://www.hyyr.no').id !== 'hyyr') throw new Error('Hyyr sendte nedlastingen til en ukjent adresse.');
  if (!res.ok) throw new Error(`Hyyr svarte ${res.status}`);
  if ((Number(res.headers.get('content-length')) || 0) > HYYR_ZIP_MAX) throw tooLargeError();
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > HYYR_ZIP_MAX) throw tooLargeError();
  return buffer;
}

/**
 * Hyyrs offentlige «Last ned vedlegg (.zip)», med spørsmål og svar som PDF.
 * Hyyr lager zip-en fortløpende (noen tar over 90 s), så den hentes én gang og holdes i minnet en stund.
 */
function hyyrZip(id) {
  for (const [key, row] of HYYR_ZIPS) if (Date.now() - row.at > HYYR_ZIP_TTL) HYYR_ZIPS.delete(key);
  const cached = HYYR_ZIPS.get(id);
  if (cached) return cached.promise;
  while (HYYR_ZIPS.size >= 6) HYYR_ZIPS.delete(HYYR_ZIPS.keys().next().value);
  const promise = fetchHyyrZip(id);
  HYYR_ZIPS.set(id, { at: Date.now(), promise });
  promise.catch(() => HYYR_ZIPS.delete(id));
  return promise;
}

/** Filene i sidedataene (Next.js): id, navn og størrelse. Id-en gir nedlasting via Hyyrs fil-API. */
export function parseHyyrPageFiles(html) {
  const source = String(html || '').replace(/\\"/g, '"');
  const files = [];
  const seen = new Set();
  for (const match of source.matchAll(/"id":"([a-z0-9]{20,40})","tenantId":"[^"]*","blobId":"[^"]*"[^{}]*?"fileName":"([^"]+)"(?:,"fileUrl":"[^"]*")?(?:,"fileSize":(\d+))?(?:,"fileType":"([^"]*)")?/g)) {
    const [, id, rawName, size, mimeType] = match;
    if (seen.has(id)) continue;
    seen.add(id);
    files.push({ id, name: text(rawName), size: Number(size) || 0, mimeType: mimeType || mimeOf(rawName) });
  }
  return files;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => { setTimeout(() => resolve(null), ms); })]);
}

export async function readHyyr(url) {
  const id = hyyrProcurementId(url);
  if (!id) {
    const error = new Error('Hyyr-adressen mangler konkurransenummer.');
    error.code = 'invalid-argument';
    throw error;
  }
  const pageUrl = `https://www.hyyr.no/procurement/${id}`;
  // Zip-en startes med en gang, så den rekker mest mulig mens siden leses.
  const zipPromise = hyyrZip(id).catch((err) => ({ failed: err }));
  const page = await readText(pageUrl).catch(() => ({ html: '' }));
  const files = parseHyyrPageFiles(page.html).map((file) => ({
    name: file.name,
    sourceId: `hyyr:${id}:${file.id}`,
    size: file.size,
    access: 'public',
    download: { kind: 'hyyr', procId: id, fileId: file.id, name: file.name },
  }));
  const zip = await withTimeout(zipPromise, HYYR_ZIP_WAIT);
  let qa = [];
  let qaNote = '';
  let missing = false;
  if (Buffer.isBuffer(zip)) {
    const known = new Set(files.map((file) => file.name.toLocaleLowerCase('nb-NO')));
    for (const entry of zipEntries(zip)) {
      if (entry.name.endsWith('/')) continue;
      const parts = entry.name.split('/').filter(Boolean);
      const name = parts[parts.length - 1] || '';
      if (!name) continue;
      if (name === 'Feil.txt' && parts.length <= 2) {
        missing = true;
        continue;
      }
      if (/^Spørsmål og svar\.pdf$/i.test(name) && parts.length === 3) {
        try {
          const { extractPdfText } = await import('../documentText.js');
          const parsed = await extractPdfText(zipEntryBytes(zip, entry));
          qa = parseHyyrQa(typeof parsed === 'string' ? parsed : parsed?.text);
        } catch {
          qa = [];
        }
      }
      // Generert konkurransegrunnlag, Q&A-PDF og vedlegg til svar finnes bare i zip-en.
      const key = name.toLocaleLowerCase('nb-NO');
      if (known.has(key)) continue;
      known.add(key);
      files.push({
        name,
        folder: parts.slice(1, -1).join(' / '),
        sourceId: `hyyr:${id}:${entry.name}`,
        size: entry.size,
        access: 'public',
        download: { kind: 'hyyr', procId: id, entry: entry.name },
      });
    }
  } else if (zip?.failed) {
    qaNote = ' Spørsmål og svar kunne ikke hentes fra Hyyr nå.';
  } else {
    qaNote = ' Hyyr bruker lang tid på å pakke spørsmål og svar. Trykk «Hent publiserte svar på nytt» om et par minutter.';
  }
  return {
    ok: true,
    source: { id: 'hyyr', name: 'Hyyr' },
    documentsUrl: pageUrl,
    access: files.length ? 'public' : 'login',
    note: files.length
      ? `Vedleggene er offentlige på Hyyr.${missing ? ' Hyyr kunne ikke ta med alle dokumentene. Se Hyyr for resten.' : ''}${qaNote}`
      : `Hyyr har ingen offentlige vedlegg for denne konkurransen.${qaNote}`,
    interestUrl: '',
    files,
    qa,
    checkedAt: new Date().toISOString(),
  };
}

export function tendsignNoticeId(url) {
  const match = String(url || '').match(/MeFormsNoticeId=(\d+)/i);
  return match ? match[1] : '';
}

function tendsignBase(url) {
  return /(^|\.)tendsign\.no$/.test(hostOf(url)) ? 'https://tendsign.no' : 'https://tendsign.com';
}

/** Filene på TendSigns offentlige dokumentside. «Alle dokumenter (.zip)» hoppes over. */
export function parseTendsignDocuments(html) {
  const files = [];
  const seen = new Set();
  const source = String(html || '').replace(/&amp;/g, '&');
  for (const match of source.matchAll(/download\.aspx\?([^'"]+?)(?:&#39;|')/g)) {
    const query = match[1];
    if (/(^|&)ZipFile=1/i.test(query) || !/(^|&)Filename=/i.test(query) || !/(^|&)ObjectID=/i.test(query)) continue;
    const params = new URLSearchParams(query);
    const name = text(params.get('PublicFileName') || params.get('Filename'));
    if (!name || seen.has(query)) continue;
    seen.add(query);
    files.push({ name, query });
  }
  return files;
}

const TENDSIGN_SESSIONS = new Map();

/** TendSign gir bare ut filer i en økt som har åpnet den offentlige dokumentsiden. */
async function tendsignSession(base, noticeId, { fresh = false } = {}) {
  const key = `${base}|${noticeId}`;
  const cached = TENDSIGN_SESSIONS.get(key);
  if (!fresh && cached && Date.now() - cached.at < 10 * 60 * 1000) return cached;
  const jar = new Map();
  const notice = await readHtmlWithCookies(`${base}/public/p_meformsnotice.aspx?MeFormsNoticeId=${noticeId}`, 'tendsign', jar);
  const href = (page) => {
    const found = (notice.html.match(new RegExp(`href="(${page}\\.aspx\\?[^"]+)"`, 'i')) || [])[1];
    return found ? new URL(found.replace(/&amp;/g, '&'), notice.finalUrl).href : '';
  };
  const docsUrl = href('p_documents');
  const docs = docsUrl ? await readHtmlWithCookies(docsUrl, 'tendsign', jar) : { html: '' };
  const session = { at: Date.now(), jar, docsHtml: docs.html, docsUrl, dialogsUrl: href('p_dialogs') };
  for (const [k, row] of TENDSIGN_SESSIONS) if (Date.now() - row.at > 10 * 60 * 1000) TENDSIGN_SESSIONS.delete(k);
  TENDSIGN_SESSIONS.set(key, session);
  return session;
}

export async function readTendsign(url) {
  const noticeId = tendsignNoticeId(url);
  if (!noticeId) return null;
  const base = tendsignBase(url);
  const session = await tendsignSession(base, noticeId, { fresh: true });
  const files = parseTendsignDocuments(session.docsHtml).map((file) => ({
    name: file.name,
    sourceId: `tendsign:${noticeId}:${file.query}`,
    url: session.docsUrl || url,
    access: 'public',
    download: { kind: 'tendsign', host: base, noticeId, query: file.query },
  }));
  return {
    ok: true,
    source: { id: 'tendsign', name: 'TendSign' },
    documentsUrl: session.docsUrl || url,
    access: files.length ? 'public' : 'login',
    note: files.length
      ? 'Dokumentene er offentlige på TendSign.'
      : session.docsUrl
        ? 'TendSign viser ingen offentlige dokumenter for denne konkurransen. Logg inn på TendSign for å se dem.'
        : 'TendSign ga ikke ut dokumentlisten nå. Prøv igjen senere, eller åpne konkurransen på TendSign.',
    interestUrl: '',
    files,
    qa: [],
    checkedAt: new Date().toISOString(),
  };
}

export async function readCompetitionGround(url) {
  // Doffin har også http://-lenker og lenker inne i tekst. De ryddes til https her.
  const start = normalizeCompetitionUrl(url);
  const source = identifySource(start);
  if (!start || !source.id) {
    const error = new Error('Kunngjøringen har ingen gyldig lenke til konkurransegrunnlaget.');
    error.code = 'invalid-argument';
    throw error;
  }
  if (source.id === 'artifik') return readArtifik(start);
  if (source.id === 'eusupply') return readEuSupply(start);
  if (source.id === 'hyyr') return readHyyr(start);
  if (source.id === 'tendsign') {
    const read = await readTendsign(start);
    if (read) return read;
  }
  if (source.id === 'mercell') {
    const catalog = await readPortalCatalog(start);
    const parsed = catalog.files?.length ? catalog : parseMercellCatalog('', start);
    const files = (parsed.files || catalog.files || []).map((file) => ({
      name: file.name,
      sourceId: file.url || file.name,
      url: file.url || '',
      sizeLabel: file.size || '',
      access: file.url ? 'public' : 'interest',
      download: file.url ? { kind: 'url', url: file.url } : null,
    }));
    const downloadable = files.some((file) => file.download);
    return {
      ok: true,
      source,
      documentsUrl: start,
      access: downloadable ? 'public' : 'interest',
      note: downloadable
        ? 'Noen filer kan lastes ned direkte. Øvrige Mercell-filer krever at virksomheten er logget inn på portalen.'
        : 'Mercell viser filnavnene offentlig, men nedlasting krever innlogging og som regel at interesse er meldt. Protop registrerer ikke interesse automatisk.',
      interestUrl: catalog.interestUrl || parsed.interestUrl || '',
      files,
      qa: [],
      checkedAt: new Date().toISOString(),
    };
  }
  return readPublicPage(start, source);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function allowedFileHop(url, expectKey) {
  const source = identifySource(url);
  if (source.id && source.id !== 'other') return true;
  if (!expectKey) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('.amazonaws.com') && decodeURIComponent(parsed.pathname).includes(expectKey);
  } catch {
    return false;
  }
}

async function bytesFromUrl(fileUrl, expectKey = '', jar = new Map()) {
  let current = fileUrl;
  for (let hop = 0; hop < 5; hop += 1) {
    if (!allowedFileHop(current, expectKey)) {
      throw new Error('Filadressen er ikke fra en støttet offentlig kilde.');
    }
    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
      headers: {
        Accept: '*/*',
        'User-Agent': 'ProTop',
        ...(jar.size ? { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') } : {}),
      },
    });
    storeCookies(jar, res);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) break;
      current = new URL(location, current).href;
      continue;
    }
    const mimeType = String(res.headers.get('content-type') || 'application/octet-stream');
    // Portalen nekter (f.eks. Mercell mot skyens IP-er). Filen åpnes da på portalen, det er ingen serverfeil.
    if (res.status === 401 || res.status === 403) {
      return { ok: false, gated: true, note: 'Portalen ga ikke ut filen. Åpne den på portalen.' };
    }
    if (!res.ok) throw new Error(`Dokumentet svarte ${res.status}`);
    if (/text\/html/i.test(mimeType)) {
      return { ok: false, gated: true, note: 'Filen krever innlogging på portalen.' };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return { ok: false, tooLarge: true, size: buf.length, mimeType };
    }
    return {
      ok: true,
      mimeType,
      size: buf.length,
      sha256: sha256(buf),
      base64: buf.toString('base64'),
    };
  }
  throw new Error('Dokumentet ble ikke tilgjengelig.');
}

export async function downloadGroundFile(spec) {
  const kind = text(spec?.kind || spec?.download?.kind);
  if (kind === 'hyyr') {
    const id = text(spec.procId || spec.download?.procId);
    const fileId = text(spec.fileId || spec.download?.fileId);
    const entryName = String(spec.entry || spec.download?.entry || '');
    if (!/^[a-z0-9]{10,40}$/i.test(id) || (!entryName && !/^[a-z0-9]{10,40}$/i.test(fileId))) {
      const error = new Error('Hyyr-filen mangler nøkkel.');
      error.code = 'invalid-argument';
      throw error;
    }
    if (fileId) {
      // Én fil om gangen via Hyyrs offentlige fil-API. Raskt, også når zip-en er treg.
      const got = await bytesFromUrl(`https://www.hyyr.no/api/public/procurement/${id}/lot-files/${fileId}`);
      return { ...got, name: String(spec.name || spec.download?.name || '').trim(), sourceId: `hyyr:${id}:${fileId}` };
    }
    const zip = await hyyrZip(id);
    const entry = zipEntries(zip).find((row) => row.name === entryName);
    if (!entry) return { ok: false, gated: true, note: 'Filen finnes ikke lenger på Hyyr.' };
    if (entry.size > MAX_BYTES) return { ok: false, tooLarge: true, size: entry.size, mimeType: mimeOf(entryName) };
    const buf = zipEntryBytes(zip, entry);
    const name = entryName.split('/').pop();
    return {
      ok: true,
      name,
      mimeType: mimeOf(name),
      size: buf.length,
      sha256: sha256(buf),
      base64: buf.toString('base64'),
      sourceId: `hyyr:${id}:${entryName}`,
    };
  }
  if (kind === 'tendsign') {
    const noticeId = text(spec.noticeId || spec.download?.noticeId);
    const query = String(spec.query || spec.download?.query || '');
    const base = tendsignBase(spec.host || spec.download?.host || 'https://tendsign.com');
    if (!/^\d+$/.test(noticeId) || !/(^|&)Filename=/i.test(query) || !/(^|&)ObjectID=/i.test(query) || /[\s"'<>#]/.test(query)) {
      const error = new Error('TendSign-filen mangler nøkkel.');
      error.code = 'invalid-argument';
      throw error;
    }
    const fileUrl = `${base}/tools/download.aspx?${query}&ToParent=1`;
    let session = await tendsignSession(base, noticeId);
    let got = await bytesFromUrl(fileUrl, '', session.jar);
    if (!got.ok && got.gated) {
      // Økten kan ha gått ut. Én ny økt før filen regnes som innlogget.
      session = await tendsignSession(base, noticeId, { fresh: true });
      got = await bytesFromUrl(fileUrl, '', session.jar);
    }
    const params = new URLSearchParams(query);
    return { ...got, name: text(params.get('PublicFileName') || params.get('Filename')), sourceId: `tendsign:${noticeId}:${query}` };
  }
  if (kind === 'artifik') {
    const procId = text(spec.procId || spec.download?.procId);
    const name = String(spec.name || spec.download?.name || '').trim();
    const key = text(spec.key || spec.download?.key);
    if (!/^\d+$/.test(procId) || !name || !key.startsWith(`procurementAttachments/${procId}/`)) {
      const error = new Error('Artifik-filen mangler offentlig nøkkel.');
      error.code = 'invalid-argument';
      throw error;
    }
    const body = new URLSearchParams({
      endpoint: 'publicProcurement',
      intent: 'download',
      file_name: name,
      file_key: key,
      proc_id: procId,
    });
    const res = await fetch('https://app.artifik.no/api/manage-files', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://app.artifik.no',
        Referer: `https://app.artifik.no/procurements/${procId}/details`,
        'User-Agent': 'ProTop',
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      return { ok: false, gated: true, note: 'Artifik ga ikke ut filen uten innlogging.' };
    }
    const signed = new URL(data.url);
    if (!signed.hostname.endsWith('.amazonaws.com') || !decodeURIComponent(signed.pathname).includes(key)) {
      throw new Error('Artifik returnerte en uventet filadresse.');
    }
    const file = await bytesFromUrl(signed.href, key);
    return { ...file, name, sourceId: key };
  }
  const fileUrl = text(spec?.url || spec?.download?.url);
  if (!/^https:\/\//i.test(fileUrl) || identifySource(fileUrl).id === 'other' || !identifySource(fileUrl).id) {
    const error = new Error('Dokumentadressen kan ikke lastes ned her.');
    error.code = 'invalid-argument';
    throw error;
  }
  const name = text(spec?.name) || decodeURIComponent(fileUrl.split('?')[0].split('/').pop() || 'dokument');
  const file = await bytesFromUrl(fileUrl);
  return { ...file, name, sourceId: fileUrl };
}
