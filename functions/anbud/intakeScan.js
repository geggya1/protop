/**
 * Leser anbudsforespørsel fra bilde, PDF, Word, e-post (.msg/.eml) eller tekst.
 * Tomme felt når verdien ikke står i dokumentet — ingen gjetting.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import {
  callGeminiJson,
  friendlyGeminiError,
  getGeminiKey,
} from '../aiShared.js';
import { classifyPlanMime, decodePlainText, extractDocxText, extractPdfLines } from '../documentText.js';

const PROMPT = `Du leser en anbudsforespørsel, et brev, en e-post eller et notat.
Dokumenter kan komme i alle format og utseende — også uformelle henvendelser fra privatpersoner.
Returner KUN gyldig JSON:
{
  "title": "kort navn på forespørselen",
  "buyer": "avsender / oppdragsgiver",
  "contactName": "kontaktperson",
  "email": "e-post eller tom streng",
  "phone": "telefon eller tom streng",
  "deadline": "YYYY-MM-DD eller tom streng",
  "description": "kort sammendrag av hva som etterspørres",
  "reference": "referanse eller tom streng",
  "amount": null
}
Regler:
- Ikke finn opp beløp, dato, kontakt eller annet som ikke står i dokumentet.
- Tom streng eller null når feltet ikke kan avklares.
- Ved videresendt e-post: bruk den opprinnelige forespørselen (ikke bare intern kommentering).
- Ta med det som kan tolkes; la resten stå tomt.`;

function text(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function tenderFromScan(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const amount = src.amount == null || src.amount === '' ? NaN : Number(src.amount);
  return {
    title: text(src.title, 160),
    buyer: text(src.buyer, 160),
    contactName: text(src.contactName, 120),
    email: text(src.email, 160).toLowerCase(),
    phone: text(src.phone, 40),
    deadline: text(src.deadline, 40),
    description: text(src.description, 2000),
    reference: text(src.reference, 80),
    amount: Number.isFinite(amount) ? amount : null,
  };
}

function reject(code, message) {
  throw new HttpsError(code, message);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isMsg(mime, name) {
  return name.endsWith('.msg')
    || mime === 'application/vnd.ms-outlook'
    || mime === 'application/x-msg';
}

function isEml(mime, name) {
  return name.endsWith('.eml')
    || mime === 'message/rfc822'
    || mime === 'application/eml';
}

function decodeMimeWord(value) {
  return String(value || '').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_, _cs, enc, payload) => {
    try {
      if (String(enc).toLowerCase() === 'b') {
        return Buffer.from(payload, 'base64').toString('utf8');
      }
      const hex = String(payload).replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      return hex;
    } catch {
      return payload;
    }
  });
}

function headerValue(raw, name) {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im');
  const match = String(raw || '').match(re);
  return decodeMimeWord(match?.[1] || '').replace(/\s+/g, ' ').trim();
}

function parseAddress(field) {
  const raw = String(field || '').trim();
  const angled = raw.match(/^(.*?)<([^>]+)>/);
  if (angled) {
    return {
      name: text(angled[1].replace(/^["']|["']$/g, ''), 120),
      email: text(angled[2], 160).toLowerCase(),
    };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return { name: '', email: raw.toLowerCase() };
  }
  return { name: text(raw, 120), email: '' };
}

export function parseEmlText(raw) {
  const source = String(raw || '').replace(/^\uFEFF/, '');
  const split = source.search(/\r?\n\r?\n/);
  const head = split >= 0 ? source.slice(0, split) : source;
  const bodyRaw = split >= 0 ? source.slice(split).replace(/^\r?\n\r?\n/, '') : '';
  const subject = headerValue(head, 'Subject');
  const from = parseAddress(headerValue(head, 'From'));
  let body = bodyRaw;
  if (/content-type:\s*text\/html/i.test(head) || /<html[\s>]/i.test(bodyRaw)) {
    body = stripHtml(bodyRaw);
  }
  body = body
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\u0000/g, '')
    .trim();
  const lines = [
    subject ? `Emne: ${subject}` : '',
    from.name || from.email ? `Fra: ${[from.name, from.email].filter(Boolean).join(' <')}${from.name && from.email ? '>' : ''}` : '',
    body ? `Innhold:\n${body.slice(0, 20000)}` : '',
  ].filter(Boolean);
  return {
    text: lines.join('\n\n'),
    subject,
    contactName: from.name,
    email: from.email,
  };
}

export async function parseMsgBuffer(buffer) {
  const mod = await import('@kenjiuno/msgreader');
  // CJS/ESM interop: package exports { default: { default: MsgReader } }.
  const MsgReader = mod.default?.default || mod.default || mod.MsgReader;
  const copy = Buffer.from(buffer);
  const ab = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
  const reader = new MsgReader(ab);
  const data = reader.getFileData() || {};
  const subject = text(data.subject, 200);
  const contactName = text(data.senderName, 120);
  const email = text(data.senderSmtpAddress || data.senderEmail, 160).toLowerCase();
  // Behold linjeskift så Fra/From-kjeden kan leses.
  const body = String(data.body || stripHtml(data.bodyHTML || ''))
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 20000);
  const lines = [
    subject ? `Emne: ${subject}` : '',
    contactName || email ? `Fra: ${[contactName, email].filter(Boolean).join(' <')}${contactName && email ? '>' : ''}` : '',
    body ? `Innhold:\n${body}` : '',
  ].filter(Boolean);
  return {
    text: lines.join('\n\n'),
    subject,
    contactName,
    email: email.includes('@') ? email : '',
  };
}

/** Ved videresending: hopp over intern kommentering og ta den opprinnelige From/Fra. */
function originalSenderFromBody(body) {
  const matches = [...String(body || '').matchAll(/(?:^|\n)\s*(?:From|Fra):\s*([^\n<]+(?:<[^>\n]+>)?)/gi)];
  if (matches.length < 2) return null;
  const last = matches[matches.length - 1][1];
  const parsed = parseAddress(last);
  if (!parsed.name && !parsed.email) return null;
  if (parsed.email && !parsed.email.includes('@')) return null;
  return parsed;
}

function localFromMail(mail) {
  if (!mail?.text) return null;
  const original = originalSenderFromBody(mail.text);
  const subject = String(mail.subject || '').replace(/^(re|fw|fwd)\s*:\s*/ig, '').trim();
  return tenderFromScan({
    title: subject || mail.subject || '',
    buyer: '',
    contactName: original?.name || mail.contactName || '',
    email: original?.email || mail.email || '',
    phone: '',
    deadline: '',
    description: text(mail.text, 2000),
    reference: '',
    amount: null,
  });
}

export async function prepareIntakeParts(dataUrl, fileName = '', mimeType = '') {
  const cleaned = String(dataUrl || '').replace(/^data:[^;]+;base64,/, '');
  const mime = (String(dataUrl || '').match(/^data:([^;]+);base64,/i) || [])[1]
    || String(mimeType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  if (cleaned.length < 40) {
    return { parts: [], local: null, error: 'Last opp et bilde, e-post eller et dokument.' };
  }
  const buffer = Buffer.from(cleaned, 'base64');
  const kind = classifyPlanMime(mime, name);

  if (isMsg(mime, name)) {
    try {
      const mail = await parseMsgBuffer(buffer);
      if (!mail.text) return { parts: [], local: null, error: 'Klarte ikke å lese Outlook-filen (.msg).' };
      return {
        parts: [
          { text: 'Les denne e-posten / forespørselen og trekk ut feltene.' },
          { text: mail.text.slice(0, 45000) },
        ],
        local: localFromMail(mail),
        error: '',
      };
    } catch (err) {
      logger.warn('msg parse failed', { message: err?.message });
      return { parts: [], local: null, error: 'Klarte ikke å lese Outlook-filen (.msg).' };
    }
  }

  if (isEml(mime, name) || (kind === 'text' && name.endsWith('.eml'))) {
    const mail = parseEmlText(buffer.toString('utf8'));
    if (!mail.text) return { parts: [], local: null, error: 'Klarte ikke å lese e-postfilen (.eml).' };
    return {
      parts: [
        { text: 'Les denne e-posten / forespørselen og trekk ut feltene.' },
        { text: mail.text.slice(0, 45000) },
      ],
      local: localFromMail(mail),
      error: '',
    };
  }

  if (kind === 'docx') {
    const doc = String(extractDocxText(buffer) || '').slice(0, 20000);
    return {
      parts: [
        { text: 'Les denne anbudsforespørselen og trekk ut feltene.' },
        { text: `Dokumenttekst:\n${doc}` },
      ],
      local: null,
      error: doc.length < 20 ? 'Word-dokumentet ser tomt ut.' : '',
    };
  }

  if (kind === 'text') {
    const plain = decodePlainText(cleaned).slice(0, 20000);
    return {
      parts: [
        { text: 'Les denne anbudsforespørselen og trekk ut feltene.' },
        { text: `Dokumenttekst:\n${plain}` },
      ],
      local: null,
      error: plain.length < 8 ? 'Tekstfilen ser tom ut.' : '',
    };
  }

  if (kind === 'pdf') {
    const pdfText = String(await extractPdfLines(buffer, { maxPages: 8 }).catch(() => '') || '').slice(0, 20000);
    const parts = [{ text: 'Les denne anbudsforespørselen og trekk ut feltene.' }];
    if (pdfText) parts.push({ text: `Dokumenttekst:\n${pdfText}` });
    if (cleaned.length <= 1_500_000) {
      parts.push({ inline_data: { mime_type: 'application/pdf', data: cleaned } });
    }
    return { parts, local: null, error: parts.length < 2 ? 'PDF-en mangler lesbart innhold.' : '' };
  }

  return {
    parts: [
      { text: 'Les denne anbudsforespørselen og trekk ut feltene.' },
      { inline_data: { mime_type: mime || 'image/jpeg', data: cleaned } },
    ],
    local: null,
    error: '',
  };
}

function hasExtracted(extracted) {
  return Boolean(
    extracted?.title
    || extracted?.contactName
    || extracted?.email
    || extracted?.phone
    || extracted?.description
    || extracted?.buyer,
  );
}

export async function handleScanAnbud(data) {
  const imageBase64 = String(data?.imageBase64 || data?.fileBase64 || '');
  const fileName = String(data?.fileName || '').slice(0, 180);
  const mimeType = String(data?.mimeType || '').slice(0, 120);
  const prepared = await prepareIntakeParts(imageBase64, fileName, mimeType);
  if (prepared.error && !prepared.parts.length && !prepared.local) {
    reject('invalid-argument', prepared.error);
  }
  if (!prepared.parts.length && !prepared.local) {
    reject('invalid-argument', 'Last opp et bilde, e-post eller et dokument.');
  }
  const apiKey = getGeminiKey();
  if (!apiKey) {
    if (prepared.local && hasExtracted(prepared.local)) {
      return { ok: true, extracted: prepared.local, engine: 'local' };
    }
    reject('failed-precondition', 'AI er ikke tilgjengelig akkurat nå.');
  }
  try {
    const parsed = await callGeminiJson(apiKey, PROMPT, prepared.parts, {
      maxOutputTokens: 2048,
      perModelTimeoutMs: 40000,
    });
    const extracted = tenderFromScan(parsed);
    if (!hasExtracted(extracted) && prepared.local && hasExtracted(prepared.local)) {
      return { ok: true, extracted: prepared.local, engine: 'local+gemini' };
    }
    return { ok: true, extracted, engine: 'gemini' };
  } catch (err) {
    if (prepared.local && hasExtracted(prepared.local)) {
      logger.warn('scanAnbud used local mail read', { message: err?.message });
      return { ok: true, extracted: prepared.local, engine: 'local' };
    }
    reject('unavailable', friendlyGeminiError(err));
  }
  return { ok: false };
}
