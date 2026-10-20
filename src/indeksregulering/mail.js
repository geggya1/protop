/** E-postvarsel når et indeksbrev skal sendes til kunden. */

function text(value) {
  return String(value || '').trim();
}

export function pdfAttachmentFromBytes(file) {
  const bytes = file?.bytes;
  if (!(bytes instanceof Uint8Array) || !bytes.length) return null;
  const content = encodeBase64(bytes);
  if (!content || content.length > 2_000_000) return null;
  const cleaned = String(file.filename || 'indeksregulering.pdf').replace(/[^\w.\- ]+/g, '').slice(0, 120);
  const filename = (cleaned || 'indeksregulering').toLowerCase().endsWith('.pdf') ? (cleaned || 'indeksregulering.pdf') : `${cleaned || 'indeksregulering'}.pdf`;
  return { filename, contentType: 'application/pdf', content };
}

function encodeBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function pdfAttachment(raw) {
  const content = text(raw?.content).replace(/\s/g, '');
  if (!content || content.length > 2_000_000 || !/^[A-Za-z0-9+/=]+$/.test(content)) return null;
  const cleaned = text(raw.filename).replace(/[^\w.\- ]+/g, '').slice(0, 120);
  const filename = (cleaned || 'indeksregulering.pdf').toLowerCase().endsWith('.pdf')
    ? (cleaned || 'indeksregulering.pdf')
    : `${cleaned || 'indeksregulering'}.pdf`;
  return { filename, contentType: 'application/pdf', content };
}

export function indexLetterMessage({
  to = '',
  cc = [],
  name = '',
  companyName = '',
  letterPlain = '',
  period = '',
  subject = '',
  attachment = null,
} = {}) {
  const who = text(name);
  const company = text(companyName);
  const body = text(letterPlain);
  const copies = (Array.isArray(cc) ? cc : [cc]).map((row) => text(row)).filter(Boolean);
  const subjectLine = text(subject) || `Varsel om indeksregulering${text(period) ? ` ${text(period)}` : ''}`;
  const lines = [
    who ? `Hei ${who},` : 'Hei,',
    '',
    'Vi varsler om indeksregulering etter inngått avtale. Beregningen og grunnlaget står i brevet under.',
    '',
    body,
    '',
    copies.length ? `Kopi: ${copies.join(', ')}` : '',
    'Med vennlig hilsen',
    company,
  ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== ''));
  const file = pdfAttachment(attachment);
  return {
    to: text(to),
    cc: copies,
    name: who,
    subject: subjectLine,
    text: lines.join('\n').trim(),
    ...(file ? { attachment: file } : {}),
  };
}
