/** Gemini-tolkning av bedrift og rangering av anbudstreff. */
import { touchGeminiEnv } from './geminiEnv.js';
import { callGeminiJson, friendlyGeminiError, getGeminiKey } from './aiShared.js';

const PROFILE_PROMPT = `Du hjelper en norsk bedrift med anbudsvarsling på Doffin og TED.
Gitt navn, beskrivelse og ev. tekst fra hjemmesiden, returner KUN gyldig JSON:
{
  "summary": "2-4 setninger om hva bedriften faktisk leverer",
  "keywords": ["norske fagord som treffer i kunngjøringstitler"],
  "cpvHints": ["åttesifret CPV som passer, eller tom liste"]
}
keywords: 8-16 konkrete fagord, ikke generelle ord som bedrift, tjeneste, kvalitet.
Ikke finn opp CPV. Tom liste om du er usikker.`;

const RANK_PROMPT = `Du rangerer offentlige anbudstreff mot en leverandør.
Returner KUN gyldig JSON:
{ "hits": [{ "id": "samme id som i listen", "score": 8, "reason": "én kort setning" }] }
score 8-10 = må ses nå, 5-7 = relevant, 1-4 = svakt treff.
Begrunn kort på norsk. Ta bare med treff med score 5 eller høyere, maks 12.`;

const STOP = new Set([
  'og', 'i', 'på', 'for', 'med', 'av', 'til', 'en', 'et', 'er', 'som', 'det', 'de', 'den', 'har',
  'vi', 'om', 'fra', 'eller', 'kan', 'vår', 'vårt', 'våre', 'the', 'and', 'with', 'you', 'your',
  'our', 'this', 'that', 'are', 'was', 'bedrift', 'tjeneste', 'tjenester', 'kvalitet', 'norge',
  'norsk', 'as', 'sa', 'www', 'http', 'https', 'com', 'html', 'home', 'page', 'loading', 'bilde',
  'her', 'alle', 'ved', 'etter', 'under', 'over', 'innen', 'samt', 'være', 'blir', 'blitt',
  'ikke', 'også', 'mer', 'skal', 'må', 'bli', 'sin', 'sine', 'sitt', 'div', 'span',
  'react', 'children', 'array', 'object', 'const', 'undefined', 'function', 'return',
  'isarray', 'modulepreload', 'typeof', 'export', 'import', 'default', 'absolute',
  'classes', 'light', 'orientation', 'variant', 'before', 'after', 'props', 'muidivider',
]);

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/javascript,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (compatible; ProTop/1.0; +https://protop.no)',
};

function text(value) {
  return String(value || '').trim();
}

export function htmlToText(html) {
  const source = String(html || '');
  const title = text(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]).replace(/\s+/g, ' ');
  const meta = text(
    source.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || source.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1],
  );
  const body = source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = [];
  if (title) parts.push(title);
  if (meta && meta.toLocaleLowerCase('nb-NO') !== title.toLocaleLowerCase('nb-NO')) parts.push(meta);
  if (body && body.toLocaleLowerCase('nb-NO') !== title.toLocaleLowerCase('nb-NO')) parts.push(body);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function scriptUrlsFromHtml(html, pageUrl) {
  const urls = [];
  const re = /(?:src|href)=["']([^"']+\.js[^"']*)["']/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    const href = sameOriginUrl(pageUrl, match[1]);
    if (href && !urls.includes(href)) urls.push(href);
  }
  return urls.slice(0, 4);
}

export function extraChunkUrls(source, pageUrl) {
  const pathHint = (() => {
    try {
      return new URL(pageUrl).pathname.split('/').filter(Boolean).pop() || '';
    } catch {
      return '';
    }
  })();
  if (pathHint.length < 4) return [];
  const escaped = pathHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`assets/[A-Za-z0-9._-]*${escaped}[A-Za-z0-9._-]*\\.js`, 'gi');
  const urls = [];
  let match;
  while ((match = re.exec(String(source || '')))) {
    const href = sameOriginUrl(pageUrl, `/${match[0]}`);
    if (href && !urls.includes(href)) urls.push(href);
  }
  return urls.slice(0, 3);
}

export function humanStringsFromSource(source) {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const value = String(raw || '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (value.length < 3 || value.length > 240) return;
    if (!/[A-Za-zÆØÅæøå]{3}/.test(value)) return;
    if (/https?:|function |webpack|rgba\(|xmlns|node_modules|assets\/|&::|calc\(|ownerState|palette\.|\.js$|use-credentials|__esModule/i.test(value)) return;
    if (/^[a-z]+[A-Z][A-Za-z]+$/.test(value)) return;
    const key = value.toLocaleLowerCase('nb-NO');
    if (STOP.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push(value);
  };
  const childRe = /children\s*:\s*["'`]([^"'`]{3,280})["'`]/g;
  let match;
  while ((match = childRe.exec(String(source || '')))) add(match[1]);
  if (out.length >= 8) return out.slice(0, 80);
  const re = /["'`]([^"'`]{12,280})["'`]/g;
  while ((match = re.exec(String(source || '')))) {
    if (!/\s/.test(match[1]) || !/[a-zæøå]/.test(match[1])) continue;
    add(match[1]);
    if (out.length >= 80) break;
  }
  return out;
}

function sameOriginUrl(base, src) {
  try {
    const href = new URL(src, base);
    if (href.origin !== new URL(base).origin) return '';
    if (!/^https?:$/.test(href.protocol)) return '';
    return href.href;
  } catch {
    return '';
  }
}

async function fetchText(url, timeoutMs = 8000) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return '';
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 1_600_000) return '';
  return new TextDecoder('utf-8').decode(buf);
}

export async function siteText(url) {
  try {
    const href = new URL(String(url || ''));
    if (!/^https?:$/.test(href.protocol)) return '';
    const html = await fetchText(href.href);
    if (!html) return '';
    const visible = htmlToText(html);
    const parts = [visible];
    if (visible.length < 280) {
      for (const scriptUrl of scriptUrlsFromHtml(html, href.href).slice(0, 2)) {
        const js = await fetchText(scriptUrl);
        if (!js) continue;
        const chunks = extraChunkUrls(js, href.href).slice(0, 2);
        if (chunks.length) {
          for (const chunk of chunks) {
            const extra = await fetchText(chunk);
            if (extra) parts.push(...humanStringsFromSource(extra));
          }
        } else {
          parts.push(...humanStringsFromSource(js).filter((row) => /\s/.test(row)));
        }
      }
    }
    return parts.filter(Boolean).join('. ').replace(/\s+/g, ' ').trim().slice(0, 8000);
  } catch {
    return '';
  }
}

function addKeyword(keywords, seen, raw) {
  const value = text(raw).replace(/\s+/g, ' ');
  const key = value.toLocaleLowerCase('nb-NO');
  if (key.length < 3 || value.length > 40 || STOP.has(key) || seen.has(key)) return;
  if (/^\d+$/.test(value) || /^[a-z]+[A-Z][A-Za-z]+$/.test(value)) return;
  seen.add(key);
  keywords.push(value);
}

export function buildLocalProfile(input = {}) {
  const desc = text(input.description);
  const page = text(input.page);
  const source = [desc, page].filter(Boolean).join(' ');
  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((row) => row.trim())
    .filter((row) => row.length >= 20 && /[a-zæøå]/i.test(row));
  const summary = (desc || sentences.slice(0, 3).join(' ') || text(input.companyName))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
  const keywords = [];
  const seen = new Set();
  for (const chunk of source.split(/[.;:|\n]/)) {
    const trimmed = chunk.trim();
    if (/^[A-ZÆØÅ][\p{L}0-9/+& -]{3,39}$/u.test(trimmed) && !/^(Vi |En |På |Med )/u.test(trimmed)) {
      addKeyword(keywords, seen, trimmed);
    }
  }
  for (const word of source.split(/[^\p{L}\p{N}+&/-]+/u)) {
    if (word.length >= 5 && word.length <= 32) addKeyword(keywords, seen, word);
  }
  return {
    ok: true,
    summary,
    keywords: keywords.slice(0, 16),
    cpvHints: [],
    engine: 'local',
  };
}

export function friendlyProfileError(err) {
  const raw = String(err?.message || err || '');
  if (/Fant ikke nok tekst/i.test(raw)) {
    return 'Fant ikke nok tekst å tolke. Skriv en kort beskrivelse av hva dere leverer.';
  }
  if (/ikke tilgjengelig|API key|API_KEY|invalid.?key|permission/i.test(raw)) {
    return 'AI er ikke tilgjengelig akkurat nå. Prøv igjen, eller skriv søkeordene manuelt.';
  }
  if ((/timeout|tok for lang tid/i.test(raw)) && !/tilgjengelig/i.test(raw)) {
    return 'Tolkingen tok for lang tid. Prøv igjen, eller skriv en kort beskrivelse.';
  }
  return 'Kunne ikke tolke bedriften akkurat nå. Prøv igjen, eller skriv søkeordene manuelt.';
}

function requireKey() {
  touchGeminiEnv();
  const key = getGeminiKey();
  if (!key) {
    const err = new Error('AI er ikke tilgjengelig akkurat nå.');
    err.status = 503;
    throw err;
  }
  return key;
}

function profileFromGemini(parsed) {
  const keywords = (Array.isArray(parsed?.keywords) ? parsed.keywords : [])
    .map((row) => text(row))
    .filter((row) => row.length >= 2 && row.length <= 40)
    .slice(0, 20);
  return {
    ok: true,
    summary: text(parsed?.summary).slice(0, 800),
    keywords,
    cpvHints: (Array.isArray(parsed?.cpvHints) ? parsed.cpvHints : []).map((row) => text(row)).filter(Boolean).slice(0, 8),
    engine: 'gemini',
  };
}

export async function interpretProfile(input = {}) {
  const page = text(input.page) || (input.website ? await siteText(input.website) : '');
  const local = buildLocalProfile({ ...input, page });
  touchGeminiEnv();
  const key = getGeminiKey();
  if (key) {
    try {
      const parsed = await callGeminiJson(key, PROFILE_PROMPT, [{
        text: [
          `Bedrift: ${text(input.companyName) || 'Ukjent'}`,
          input.orgnr ? `Orgnr: ${text(input.orgnr)}` : '',
          `Beskrivelse: ${text(input.description) || 'Ikke oppgitt'}`,
          input.website ? `Hjemmeside: ${text(input.website)}` : '',
          page ? `Tekst fra nettsiden: ${page}` : '',
        ].filter(Boolean).join('\n'),
      }], { maxOutputTokens: 1024, perModelTimeoutMs: 25000 });
      const gemini = profileFromGemini(parsed);
      if (gemini.summary || gemini.keywords.length) return gemini;
    } catch {
      // Gemini nede eller uten nøkkel — bruk lokal lesing av beskrivelse/nettside.
    }
  }
  if (local.summary || local.keywords.length) return local;
  const err = new Error('Fant ikke nok tekst å tolke. Skriv en kort beskrivelse av hva dere leverer.');
  err.status = 422;
  throw err;
}

export async function rankHits(input = {}) {
  const key = requireKey();
  const notices = (Array.isArray(input.notices) ? input.notices : []).slice(0, 20);
  if (!notices.length) return { ok: true, hits: [] };
  const parsed = await callGeminiJson(key, RANK_PROMPT, [{
    text: [
      `Leverandør: ${text(input.companyName) || 'Ukjent'}`,
      `Profil: ${text(input.summary) || text(input.description) || 'Ikke oppgitt'}`,
      `Søkeord: ${(Array.isArray(input.keywords) ? input.keywords : []).join(', ')}`,
      'Treff:',
      ...notices.map((row) => `- ${row.id}: ${text(row.title)} | ${text(row.buyer)} | CPV ${(row.cpvCodes || []).slice(0, 3).join(', ')} | ${text(row.description).slice(0, 220)}`),
    ].join('\n'),
  }], { maxOutputTokens: 1200, perModelTimeoutMs: 30000 });
  const hits = (Array.isArray(parsed?.hits) ? parsed.hits : [])
    .map((row) => ({
      id: text(row?.id),
      score: Math.max(0, Math.min(10, Number(row?.score) || 0)),
      reason: text(row?.reason).slice(0, 220),
    }))
    .filter((row) => row.id && row.score >= 5)
    .slice(0, 12);
  return { ok: true, hits, engine: 'gemini' };
}

export { friendlyGeminiError };
