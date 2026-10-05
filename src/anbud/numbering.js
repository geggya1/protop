/** System-ID (unikt i bedriften) og Oppdrags-ID (unikt per kunde). */

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fold(value) {
  return text(value).toLowerCase();
}

export function normalizeNumberId(value) {
  return text(value).slice(0, 40);
}

/** «1» og «0001» er samme nummer. Andre verdier sammenlignes uten store/små bokstaver. */
export function canonicalNumberId(value) {
  const raw = normalizeNumberId(value);
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return String(Number(raw));
  return fold(raw);
}

export function formatNumberId(value) {
  const raw = normalizeNumberId(value);
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return raw.padStart(4, '0');
  return raw;
}

export function sameNumberId(left, right) {
  const a = canonicalNumberId(left);
  const b = canonicalNumberId(right);
  return !!a && a === b;
}

export function customerScopeKey(customerId, buyer) {
  const id = text(customerId);
  if (id) return `kunde:${id}`;
  const name = fold(buyer);
  if (name) return `kunde-navn:${name}`;
  return 'ukjent';
}

function numericSerial(value) {
  const raw = normalizeNumberId(value);
  if (!/^\d+$/.test(raw)) return 0;
  return Number(raw);
}

function nextSerial(values) {
  let max = 0;
  for (const value of values) {
    const n = numericSerial(value);
    if (n > max) max = n;
  }
  return String(max + 1);
}

export function systemIdTaken(contracts, value, exceptId = '') {
  const key = canonicalNumberId(value);
  if (!key) return false;
  return (Array.isArray(contracts) ? contracts : []).some((row) => (
    row?.id !== exceptId && sameNumberId(row?.systemId, value)
  ));
}

export function oppdragIdTaken(contracts, value, customerId, buyer, exceptId = '') {
  const key = canonicalNumberId(value);
  if (!key) return false;
  const scope = customerScopeKey(customerId, buyer);
  return (Array.isArray(contracts) ? contracts : []).some((row) => (
    row?.id !== exceptId
    && customerScopeKey(row?.customerId, row?.buyer) === scope
    && sameNumberId(row?.oppdragId, value)
  ));
}

export function nextSystemId(contracts, exceptId = '') {
  const values = (Array.isArray(contracts) ? contracts : [])
    .filter((row) => row?.id !== exceptId)
    .map((row) => row?.systemId);
  return nextSerial(values);
}

export function nextOppdragId(contracts, customerId, buyer, exceptId = '') {
  const scope = customerScopeKey(customerId, buyer);
  const values = (Array.isArray(contracts) ? contracts : [])
    .filter((row) => row?.id !== exceptId && customerScopeKey(row?.customerId, row?.buyer) === scope)
    .map((row) => row?.oppdragId);
  return nextSerial(values);
}

/**
 * Fastsetter system- og oppdrags-ID.
 * Tomt felt får neste ledige. Manuelt felt som er opptatt gir feil.
 */
export function claimContractNumbers(contracts, input = {}, exceptId = '') {
  const rows = Array.isArray(contracts) ? contracts : [];
  const wantedSystem = normalizeNumberId(input.systemId);
  const wantedOppdrag = normalizeNumberId(input.oppdragId);
  const systemId = wantedSystem || nextSystemId(rows, exceptId);
  if (systemIdTaken(rows, systemId, exceptId)) {
    return { ok: false, error: 'System-ID er allerede i bruk.' };
  }
  const customerId = text(input.customerId);
  const buyer = text(input.buyer);
  const oppdragId = wantedOppdrag || nextOppdragId(rows, customerId, buyer, exceptId);
  if (oppdragIdTaken(rows, oppdragId, customerId, buyer, exceptId)) {
    return { ok: false, error: 'Oppdrags-ID er allerede brukt for denne kunden.' };
  }
  return { ok: true, systemId, oppdragId, error: null };
}

function chronoStamp(row) {
  return text(row?.createdAt) || text(row?.start) || text(row?.fields?.contractDate) || '';
}

function systemSortValue(row) {
  const n = numericSerial(row?.systemId);
  return n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

/** Eldste først, deretter lavest system-ID. */
export function sortContractsChronological(contracts) {
  const rows = Array.isArray(contracts) ? [...contracts] : [];
  return rows.sort((left, right) => {
    const a = chronoStamp(left);
    const b = chronoStamp(right);
    if (a && b && a !== b) return a.localeCompare(b);
    if (a && !b) return -1;
    if (!a && b) return 1;
    const sys = systemSortValue(left) - systemSortValue(right);
    if (sys) return sys;
    return text(left?.id).localeCompare(text(right?.id));
  });
}

/** Fyller manglende nummer på eksisterende avtaler uten å endre satte verdier. */
export function assignContractNumbers(contracts) {
  const rows = sortContractsChronological(Array.isArray(contracts) ? contracts : []).map((row) => ({ ...row }));
  for (const row of rows) {
    if (!normalizeNumberId(row.systemId)) row.systemId = nextSystemId(rows, row.id);
    if (!normalizeNumberId(row.oppdragId)) row.oppdragId = nextOppdragId(rows, row.customerId, row.buyer, row.id);
  }
  return rows;
}
