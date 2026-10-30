/**
 * Les en søknad eller CV med OCR og AI (interpretImport, kind application).
 * Brukes både av funksjonen og av appen, så filen har ingen avhengigheter.
 * Gir kontaktinfo, kort profil og en første vurdering mot stillingens krav.
 * Fødselsnummer, fødselsdato og andre særlige opplysninger tas ikke med.
 */

const MAX_LIST = 12;

function clip(value, max = 400) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clipLines(value, max = 2000) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, max);
}

function list(value, max = MAX_LIST, len = 120) {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? '').split(/\n|;|•/);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const entry = clip(typeof item === 'object' && item ? (item.title || item.name || item.text || '') : item, len);
    const key = entry.toLowerCase();
    if (!entry || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= max) break;
  }
  return out;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// Norske nummer (8 siffer, ev. +47/0047) og utenlandske med landkode.
const PHONE_RE = /(?:\+|00)\d{2}[\s.-]?\d(?:[\s.-]?\d){6,11}|(?<![\d])\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}(?![\d])|(?<![\d])\d{3}[\s.]?\d{2}[\s.]?\d{3}(?![\d])/;

export function cleanEmail(value) {
  const hit = String(value ?? '').match(EMAIL_RE);
  return hit ? hit[0].toLowerCase().replace(/\.$/, '') : '';
}

export function cleanPhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // Elleve siffer i ett er fødselsnummer, ikke telefon.
  if (/^\d{11}$/.test(raw.replace(/[\s.-]/g, ''))) return '';
  const hit = raw.match(PHONE_RE);
  return hit ? hit[0].replace(/\s+/g, ' ').trim() : '';
}

/** Navn fra filnavnet («CV - Kari Nordmann.pdf» → «Kari Nordmann»). */
export function nameFromFilename(filename) {
  const base = String(filename || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(cv|søknad|soknad|application|resume|curriculum vitae|vedlegg|attest(er)?|final|ny|new|\d+)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base || base.split(' ').length > 4) return '';
  return base
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Lokal lesing når AI ikke er tilgjengelig: e-post, telefon og navn der det står tydelig. */
export function contactFromText(text, filename = '') {
  const raw = String(text || '');
  const email = cleanEmail(raw);
  let phone = '';
  for (const line of raw.split('\n')) {
    if (!/tlf|telefon|mobil|phone|\+47|^\s*[49]\d/i.test(line)) continue;
    phone = cleanPhone(line.replace(/^[^:]*:/, ''));
    if (phone) break;
  }
  const label = raw.match(/^\s*(?:navn|name)\s*[:\-]\s*(.+)$/im);
  let name = label ? clip(label[1], 80) : '';
  if (!name) {
    const first = raw.split('\n').map((line) => line.trim()).find(Boolean) || '';
    if (/^[A-ZÆØÅ][\p{L}'-]+(?:\s+[A-ZÆØÅ][\p{L}'-]+){1,3}$/u.test(first)) name = first;
  }
  return { name: name || nameFromFilename(filename), email, phone };
}

export function applicationPrompt(job = {}) {
  const title = clip(job.title, 160);
  const requirements = clipLines([job.requirements, job.description].filter(Boolean).join('\n'), 4000);
  return `Du leser en jobbsøknad og/eller CV for HR i en norsk bedrift.
Returner KUN gyldig JSON:
{"name":"","email":"","phone":"","location":"","headline":"","summary":"","yearsExperience":"","education":[""],"experience":[""],"skills":[""],"languages":[""],"certifications":[""],"match":null,"strengths":[""],"gaps":[""],"assessment":""}
Regler:
- Ta bare med det som står i dokumentet. Ikke finn opp noe.
- name er søkerens fulle navn. email og phone slik de står.
- location er bosted (by/kommune), ikke full adresse.
- headline er nåværende eller ønsket rolle i én kort linje.
- summary er 2–4 setninger om bakgrunnen, nøytralt formulert.
- yearsExperience er antall år relevant arbeidserfaring som tall, eller tom streng.
- education og experience: én linje per punkt, nyeste først («2019–2023 Ingeniør, Firma AS»).
- skills er faglige ferdigheter, verktøy og fagområder (maks 12).
- Ikke ta med fødselsnummer, fødselsdato, alder, helse, religion, etnisitet, sivilstand eller bilde.
${title || requirements ? `- Vurder søkeren mot stillingen under. match er 0–10 (10 = alle krav oppfylt). strengths og gaps er konkrete punkter mot kravene. assessment er én til to setninger.
Stilling: ${title || 'ukjent'}
Krav og beskrivelse:
${requirements || '(ingen krav oppgitt)'}` : '- Ingen stilling er oppgitt: match er null, strengths og gaps er tomme lister, assessment tom.'}
- Tom streng eller tom liste når feltet ikke finnes.`;
}

/**
 * Renser svaret fra modellen. sourceText (dokumentteksten) brukes til å fylle e-post og
 * telefon når modellen ikke fant dem.
 */
export function sanitizeApplicationRead(parsed, sourceText = '') {
  const src = parsed && typeof parsed === 'object' ? parsed : {};
  const local = contactFromText(sourceText);
  const matchRaw = Number(String(src.match ?? '').replace(',', '.'));
  const hasMatch = src.match !== null && src.match !== '' && src.match != null && Number.isFinite(matchRaw);
  const years = Number(String(src.yearsExperience ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  return {
    candidate: {
      name: clip(src.name, 120) || local.name,
      email: cleanEmail(src.email) || local.email,
      phone: cleanPhone(src.phone) || local.phone,
      location: clip(src.location, 120),
    },
    profile: {
      headline: clip(src.headline, 160),
      summary: clipLines(src.summary, 1200),
      yearsExperience: Number.isFinite(years) && years > 0 && years < 60 ? Math.round(years) : null,
      education: list(src.education, 8, 200),
      experience: list(src.experience, 10, 200),
      skills: list(src.skills, 12, 60),
      languages: list(src.languages, 6, 40),
      certifications: list(src.certifications, 8, 120),
    },
    assessment: {
      match: hasMatch ? Math.max(0, Math.min(10, Math.round(matchRaw * 10) / 10)) : null,
      strengths: list(src.strengths, 6, 200),
      gaps: list(src.gaps, 6, 200),
      summary: clipLines(src.assessment, 600),
    },
  };
}
