/**
 * KID-nummer: generering og validering (MOD10 / MOD11).
 * Oppbygning følger typisk bankavtale: [kundenr][fakturanr][+sjekksiffer].
 */

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/** MOD10 (Luhn-lignende vekting 2,1 fra høyre) — vanlig KID-kontroll. */
export function mod10CheckDigit(base) {
  const digits = digitsOnly(base);
  if (!digits) return null;
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]) * weight;
    if (n > 9) n -= 9;
    sum += n;
    weight = weight === 2 ? 1 : 2;
  }
  return String((10 - (sum % 10)) % 10);
}

/** MOD11 med vekter 2–7 fra høyre. Returnerer null hvis resten gir ugyldig siffer. */
export function mod11CheckDigit(base) {
  const digits = digitsOnly(base);
  if (!digits) return null;
  const weights = [2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = digits.length - 1, w = 0; i >= 0; i -= 1, w += 1) {
    sum += Number(digits[i]) * weights[w % weights.length];
  }
  const rem = sum % 11;
  if (rem === 1) return null; // ugyldig i MOD11
  if (rem === 0) return '0';
  return String(11 - rem);
}

export function appendCheckDigit(base, method = 'mod10') {
  const digits = digitsOnly(base);
  if (!digits) return '';
  const check = method === 'mod11' ? mod11CheckDigit(digits) : mod10CheckDigit(digits);
  if (check == null) return '';
  return `${digits}${check}`;
}

export function validateKid(kid, method = 'mod10') {
  const digits = digitsOnly(kid);
  if (digits.length < 2 || digits.length > 25) {
    return { ok: false, error: 'KID må være 2–25 siffer.' };
  }
  const base = digits.slice(0, -1);
  const given = digits.slice(-1);
  const expected = method === 'mod11' ? mod11CheckDigit(base) : mod10CheckDigit(base);
  if (expected == null) {
    return { ok: false, error: 'Ugyldig MOD11-grunnlag.' };
  }
  if (given !== expected) {
    return { ok: false, error: `Kontrollsiffer stemmer ikke (forventet ${expected}).` };
  }
  return { ok: true, kid: digits, method };
}

/**
 * Bygg KID fra kundenummer + fakturanummer.
 * @param {{ customerNumber?: string|number, invoiceNumber?: string|number, customerWidth?: number, invoiceWidth?: number, method?: 'mod10'|'mod11' }} opts
 */
export function buildKid({
  customerNumber = '',
  invoiceNumber = '',
  customerWidth = 6,
  invoiceWidth = 7,
  method = 'mod10',
} = {}) {
  const cust = digitsOnly(customerNumber).padStart(customerWidth, '0').slice(-customerWidth);
  const inv = digitsOnly(invoiceNumber).padStart(invoiceWidth, '0').slice(-invoiceWidth);
  if (!digitsOnly(customerNumber) && !digitsOnly(invoiceNumber)) return '';
  return appendCheckDigit(`${cust}${inv}`, method);
}
