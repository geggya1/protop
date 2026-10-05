/** Kunderegister for bedriften. Knyttes til avtaler via customerId. */

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function digits(value, max) {
  return String(value || '').replace(/\D/g, '').slice(0, max);
}

function fold(value) {
  return text(value).toLowerCase();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeOrgnr(value) {
  const raw = digits(value, 9);
  return raw.length === 9 ? raw : '';
}

export function normalizePersonnummer(value) {
  const raw = digits(value, 11);
  return raw.length === 11 ? raw : '';
}

export function formatOrgnr(value) {
  const raw = normalizeOrgnr(value);
  if (!raw) return '';
  return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`;
}

export function maskPersonnummer(value) {
  const raw = normalizePersonnummer(value);
  if (!raw) return '';
  return `******${raw.slice(6)}`;
}

export function customerKindFromIds(orgnr, personnummer) {
  if (normalizePersonnummer(personnummer)) return 'person';
  if (normalizeOrgnr(orgnr)) return 'org';
  return '';
}

export function emptyCustomer(partial = {}) {
  return {
    id: '',
    name: '',
    kind: '',
    orgnr: '',
    personnummer: '',
    address: '',
    place: '',
    postalCode: '',
    contactName: '',
    email: '',
    phone: '',
    notes: '',
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

export function normalizeCustomer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name).slice(0, 160);
  const id = text(raw.id);
  if (!id || !name) return null;
  const orgnr = normalizeOrgnr(raw.orgnr);
  const personnummer = normalizePersonnummer(raw.personnummer);
  const kind = raw.kind === 'person' || raw.kind === 'org'
    ? raw.kind
    : (customerKindFromIds(orgnr, personnummer) || 'org');
  return {
    id,
    name,
    kind,
    orgnr,
    personnummer,
    address: text(raw.address).slice(0, 160),
    place: text(raw.place).slice(0, 80),
    postalCode: digits(raw.postalCode, 4),
    contactName: text(raw.contactName).slice(0, 80),
    email: text(raw.email).slice(0, 80),
    phone: text(raw.phone).slice(0, 40),
    notes: text(raw.notes).slice(0, 400),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  };
}

export function normalizeCustomers(input) {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeCustomer).filter(Boolean);
}

export function filterCustomers(customers, query = '') {
  const needle = fold(query);
  const rows = Array.isArray(customers) ? customers : [];
  if (!needle) return rows;
  return rows.filter((row) => {
    const hay = [row.name, row.orgnr, row.place, row.contactName, row.email, row.phone, row.address]
      .map(fold)
      .join(' ');
    return hay.includes(needle);
  });
}

function sameName(left, right) {
  return fold(left) && fold(left) === fold(right);
}

/**
 * Matcher innlest oppdragsgiver mot kunderegisteret.
 * status: match | ambiguous | new | none
 */
export function matchCustomer(customers, hint = {}) {
  const rows = Array.isArray(customers) ? customers : [];
  const orgnr = normalizeOrgnr(hint.orgnr);
  const personnummer = normalizePersonnummer(hint.personnummer);
  const name = text(hint.name || hint.buyer);
  if (orgnr) {
    const hit = rows.find((row) => row.orgnr === orgnr);
    if (hit) return { status: 'match', customer: hit };
  }
  if (personnummer) {
    const hit = rows.find((row) => row.personnummer === personnummer);
    if (hit) return { status: 'match', customer: hit };
  }
  if (name) {
    const exact = rows.filter((row) => sameName(row.name, name));
    if (exact.length === 1) return { status: 'match', customer: exact[0] };
    if (exact.length > 1) return { status: 'ambiguous', candidates: exact };
    const partial = rows.filter((row) => fold(row.name).includes(fold(name)) || fold(name).includes(fold(row.name)));
    if (partial.length === 1 && fold(name).length >= 4) return { status: 'match', customer: partial[0] };
    if (partial.length > 1) return { status: 'ambiguous', candidates: partial };
  }
  if (name || orgnr || personnummer) {
    return {
      status: 'new',
      draft: emptyCustomer({
        name,
        kind: customerKindFromIds(orgnr, personnummer) || (personnummer ? 'person' : 'org'),
        orgnr,
        personnummer,
        address: text(hint.address),
        place: text(hint.place),
        contactName: text(hint.contactName),
        email: text(hint.email),
        phone: text(hint.phone),
      }),
    };
  }
  return { status: 'none' };
}

export function upsertCustomer(state, input) {
  const name = text(input?.name);
  if (!name) return { ok: false, state, error: 'Kunden trenger et navn.' };
  const orgnr = normalizeOrgnr(input?.orgnr);
  const personnummer = normalizePersonnummer(input?.personnummer);
  if (text(input?.orgnr) && !orgnr) return { ok: false, state, error: 'Organisasjonsnummer må være ni siffer.' };
  if (text(input?.personnummer) && !personnummer) return { ok: false, state, error: 'Personnummer må være elleve siffer.' };
  const now = new Date().toISOString();
  const existingId = text(input?.id);
  const customers = normalizeCustomers(state?.customers);
  if (existingId) {
    const current = customers.find((row) => row.id === existingId);
    if (!current) return { ok: false, state, error: 'Kunden finnes ikke.' };
    const next = normalizeCustomer({
      ...current,
      ...input,
      id: existingId,
      name,
      orgnr,
      personnummer,
      updatedAt: now,
    });
    return {
      ok: true,
      state: { ...state, customers: customers.map((row) => (row.id === existingId ? next : row)) },
      error: null,
      customer: next,
    };
  }
  const clash = customers.find((row) => (orgnr && row.orgnr === orgnr) || (personnummer && row.personnummer === personnummer));
  if (clash) {
    return { ok: false, state, error: 'En kunde med samme organisasjons- eller personnummer finnes allerede.', customer: clash };
  }
  const customer = normalizeCustomer({
    ...emptyCustomer(input),
    id: createId('kunde'),
    name,
    orgnr,
    personnummer,
    createdAt: now,
    updatedAt: now,
  });
  return {
    ok: true,
    state: { ...state, customers: [customer, ...customers] },
    error: null,
    customer,
  };
}

export function customerSearchHay(customer) {
  const row = customer || {};
  return [row.name, formatOrgnr(row.orgnr), row.place, row.contactName].filter(Boolean).join(' · ');
}
