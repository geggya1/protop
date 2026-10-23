/** Identifiserer KGV og henter offentlig konkurransegrunnlag.
 * Innlogging, CAPTCHA og MFA omgås ikke. Interesse registreres ikke her.
 */

import { createHash } from 'node:crypto';
import { parseMercellCatalog, readPortalCatalog } from './portalCatalog.js';

const MAX_BYTES = 8 * 1024 * 1024;
const FILE_NAME = /[^"\\<>]+\.(?:pdf|docx?|xlsx?|pptx?|zip|dwg|txt|odt|ods|csv|xml)/i;

const PLATFORMS = [
  { id: 'artifik', name: 'Artifik', host: /(^|\.)artifik\.no$/ },
  { id: 'mercell', name: 'Mercell', host: /(^|\.)mercell\.com$/ },
  { id: 'eusupply', name: 'EU-Supply', host: /(^|\.)eu-supply\.com$/ },
  { id: 'tendsign', name: 'TendSign', host: /(^|\.)tendsign\.(no|com)$/ },
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
      download: { kind: 'artifik', procId: file.procId || procId, name: file.name, key: file.key },
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

async function readHtmlWithCookies(url, sourceId) {
  const jar = new Map();
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

export async function readCompetitionGround(url) {
  const start = text(url);
  const source = identifySource(start);
  if (!/^https:\/\//i.test(start) || !source.id) {
    const error = new Error('Konkurranseadressen må være en https-lenke.');
    error.code = 'invalid-argument';
    throw error;
  }
  if (source.id === 'artifik') return readArtifik(start);
  if (source.id === 'eusupply') return readEuSupply(start);
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

async function bytesFromUrl(fileUrl, expectKey = '') {
  const jar = new Map();
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
  if (kind === 'artifik') {
    const procId = text(spec.procId || spec.download?.procId);
    const name = text(spec.name || spec.download?.name);
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
