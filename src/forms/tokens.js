/**
 * Flettefelt i maler: {{firma}}, {{orgnr}} osv. fylles fra bedriftsprofilen når
 * dokumentet vises, skrives ut eller fylles ut. Malen lagres med flettefeltene,
 * så samme mal kan brukes av flere selskaper.
 */

export const TOKENS = [
  { key: 'firma', label: 'Firmanavn' },
  { key: 'orgnr', label: 'Org.nr.' },
  { key: 'adresse', label: 'Adresse' },
  { key: 'telefon', label: 'Telefon' },
  { key: 'epost', label: 'E-post' },
  { key: 'web', label: 'Nettside' },
  { key: 'dato', label: 'Dagens dato' },
  { key: 'bruker', label: 'Den som fyller ut' },
];

const TOKEN = /\{\{\s*([a-zæøå]+)\s*\}\}/gi;

function text(value) {
  return String(value ?? '').trim();
}

export function formatOrgnr(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 9) return text(value);
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export function formatNbDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function webLabel(value) {
  return text(value).replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** Verdier fra bedriftsprofilen (Brønnøysund-data og egne innstillinger). */
export function tokenContext(company, { userName = '', now = new Date(), fallbackName = '' } = {}) {
  const src = company && typeof company === 'object' ? company : {};
  const address = text(src.addressLabel)
    || [src.forretningsadresse?.adresse?.[0], [src.forretningsadresse?.postnummer, src.forretningsadresse?.poststed].filter(Boolean).join(' ')]
      .map(text).filter(Boolean).join(', ');
  return {
    firma: text(src.navn || src.name || fallbackName),
    orgnr: formatOrgnr(src.organisasjonsnummer || src.orgnr),
    adresse: address,
    telefon: text(src.telefon || src.mobil || src.phone),
    epost: text(src.epostadresse || src.email),
    web: webLabel(src.hjemmeside || src.website),
    dato: formatNbDate(now),
    bruker: text(userName),
  };
}

export function hasTokens(value) {
  TOKEN.lastIndex = 0;
  return TOKEN.test(String(value || ''));
}

/** Bytt flettefelt med verdier. Ukjent eller tom verdi blir [Etikett], så den synes. */
export function fillTokens(value, ctx = {}) {
  const raw = String(value ?? '');
  if (!raw.includes('{{')) return raw;
  return raw.replace(TOKEN, (match, key) => {
    const name = key.toLowerCase();
    const known = TOKENS.find((row) => row.key === name);
    if (!known) return match;
    const filled = text(ctx[name]);
    return filled || `[${known.label}]`;
  });
}

function fillCells(cells, ctx) {
  const out = {};
  for (const [key, value] of Object.entries(cells || {})) {
    out[key] = typeof value === 'string' ? fillTokens(value, ctx) : value;
  }
  return out;
}

function fillField(field, ctx) {
  const value = typeof field.value === 'string' ? fillTokens(field.value, ctx) : field.value;
  return {
    ...field,
    label: fillTokens(field.label, ctx),
    help: fillTokens(field.help, ctx),
    placeholder: fillTokens(field.placeholder, ctx),
    value,
    rows: Array.isArray(field.rows)
      ? field.rows.map((row) => (row.group ? { ...row, group: fillTokens(row.group, ctx) } : { ...row, cells: fillCells(row.cells, ctx) }))
      : field.rows,
    legend: fillTokens(field.legend, ctx),
  };
}

/** Hele skjemaet med flettefeltene byttet ut. Brukes til visning, utfylling og PDF. */
export function formWithTokens(form, ctx = {}) {
  if (!form || typeof form !== 'object') return form;
  return {
    ...form,
    title: fillTokens(form.title, ctx),
    intro: fillTokens(form.intro, ctx),
    doc: form.doc ? { ...form.doc, system: fillTokens(form.doc.system, ctx) } : form.doc,
    fields: (form.fields || []).map((field) => fillField(field, ctx)),
  };
}
