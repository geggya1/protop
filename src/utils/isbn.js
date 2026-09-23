/** Normaliser rå strekkode-/ISBN-tekst til 10 eller 13 tegn (siffer, evt. avsluttende X). */
export function normalizeIsbn(raw) {
  // Behold avsluttende X (ISBN-10 sjekksiffer); fjern øvrige ikke-siffer
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/[^0-9X]/g, '');
  if (!cleaned) return '';

  // Foretrekk ren sifferstreng for ISBN-13; tillat X kun som siste tegn i ISBN-10
  const digitsOnly = cleaned.replace(/X/g, '');
  const asIsbn10 = cleaned.length >= 10
    ? (() => {
      const candidate = cleaned.length === 10
        ? cleaned
        : cleaned.slice(0, 10);
      return /^[0-9]{9}[0-9X]$/.test(candidate) ? candidate : null;
    })()
    : null;

  if (digitsOnly.length === 13 && (digitsOnly.startsWith('978') || digitsOnly.startsWith('979'))) {
    return digitsOnly;
  }
  if (cleaned.length === 10 && /^[0-9]{9}[0-9X]$/.test(cleaned)) return cleaned;

  if (digitsOnly.length > 13) {
    const tail13 = digitsOnly.slice(-13);
    if (tail13.startsWith('978') || tail13.startsWith('979')) return tail13;
  }
  if (digitsOnly.length >= 13) return digitsOnly.slice(0, 13);
  if (asIsbn10) return asIsbn10;
  if (digitsOnly.length >= 10) return digitsOnly.slice(0, 10);

  return digitsOnly || cleaned;
}

export function isValidIsbn(raw) {
  const n = normalizeIsbn(raw);
  return n.length === 10 || n.length === 13;
}

function isbn13CheckDigit(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function isbn10CheckDigit(nine) {
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(nine[i]) * (10 - i);
  }
  const mod = 11 - (sum % 11);
  if (mod === 10) return 'X';
  if (mod === 11) return '0';
  return String(mod);
}

/** Konverter ISBN-10 ↔ ISBN-13 (978-prefiks). Returnerer null hvis ikke mulig. */
export function toIsbn13(isbn) {
  const clean = normalizeIsbn(isbn);
  if (clean.length === 13) return clean;
  if (clean.length !== 10) return null;
  const core = `978${clean.slice(0, 9)}`;
  return `${core}${isbn13CheckDigit(core)}`;
}

export function toIsbn10(isbn) {
  const clean = normalizeIsbn(isbn);
  if (clean.length === 10) return clean;
  if (clean.length !== 13 || !clean.startsWith('978')) return null;
  const nine = clean.slice(3, 12);
  return `${nine}${isbn10CheckDigit(nine)}`;
}

/** Alle ISBN-varianter å prøve mot eksterne API-er (unike, prioritert). */
export function isbnVariants(isbn) {
  const clean = normalizeIsbn(isbn);
  const out = [];
  const push = (v) => {
    if (v && !out.includes(v)) out.push(v);
  };
  push(clean);
  push(toIsbn13(clean));
  push(toIsbn10(clean));
  return out;
}
