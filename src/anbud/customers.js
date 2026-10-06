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

export function namesLikelyMatch(left, right) {
  const tidy = (value) => fold(value)
    .replace(/\b(as|asa|ans|da|sa|nuf|ba|kf|iks|sf|avd|asf)\b/g, '')
    .replace(/[^a-z0-9æøå]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const a = tidy(left);
  const b = tidy(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
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

/** Virksomhet viser org.nr, privatkunde viser personnummer — aldri begge. */
export function identityFieldsForKind(kind) {
  if (kind === 'person') return { orgnr: false, personnummer: true };
  return { orgnr: true, personnummer: false };
}

export function applyCustomerKind(input, kind) {
  const nextKind = kind === 'person' ? 'person' : 'org';
  const fields = identityFieldsForKind(nextKind);
  return {
    ...input,
    kind: nextKind,
    orgnr: fields.orgnr ? input?.orgnr || '' : '',
    personnummer: fields.personnummer ? input?.personnummer || '' : '',
  };
}

export function customerDraftFromBrreg(hit) {
  if (!hit?.navn && !hit?.organisasjonsnummer) return null;
  const street = text(hit.street)
    || text(Array.isArray(hit.raw?.forretningsadresse?.adresse)
      ? hit.raw.forretningsadresse.adresse.filter(Boolean).join(', ')
      : hit.raw?.forretningsadresse?.adresse);
  const postalCode = digits(hit.postnummer || hit.raw?.forretningsadresse?.postnummer || hit.raw?.beliggenhetsadresse?.postnummer, 4);
  const place = text(hit.poststed || hit.raw?.forretningsadresse?.poststed || hit.raw?.beliggenhetsadresse?.poststed);
  return emptyCustomer({
    kind: 'org',
    name: text(hit.navn).slice(0, 160),
    orgnr: normalizeOrgnr(hit.organisasjonsnummer),
    personnummer: '',
    address: street.slice(0, 160),
    postalCode,
    place: place.slice(0, 80),
    email: text(hit.epostadresse).slice(0, 80),
    phone: text(hit.telefon || hit.raw?.telefon).slice(0, 40),
    notes: [text(hit.organisasjonsform), text(hit.naeringsbeskrivelse)].filter(Boolean).join(' · ').slice(0, 400),
  });
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
    ownerUid: '',
    ownerName: '',
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
  const kind = raw.kind === 'person' || raw.kind === 'org'
    ? raw.kind
    : (customerKindFromIds(raw.orgnr, raw.personnummer) || 'org');
  const orgnr = kind === 'person' ? '' : normalizeOrgnr(raw.orgnr);
  const personnummer = kind === 'org' ? '' : normalizePersonnummer(raw.personnummer);
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
    ownerUid: text(raw.ownerUid).slice(0, 80),
    ownerName: text(raw.ownerName).slice(0, 80),
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
    const hay = [row.name, row.orgnr, row.place, row.contactName, row.email, row.phone, row.address, row.ownerName]
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
  const kind = input?.kind === 'person' || input?.kind === 'org'
    ? input.kind
    : (customerKindFromIds(input?.orgnr, input?.personnummer) || 'org');
  const orgnr = kind === 'person' ? '' : normalizeOrgnr(input?.orgnr);
  const personnummer = kind === 'org' ? '' : normalizePersonnummer(input?.personnummer);
  if (kind === 'org' && text(input?.orgnr) && !orgnr) return { ok: false, state, error: 'Organisasjonsnummer må være ni siffer.' };
  if (kind === 'person' && text(input?.personnummer) && !personnummer) return { ok: false, state, error: 'Personnummer må være elleve siffer.' };
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
      kind,
      orgnr,
      personnummer,
      ownerUid: input?.ownerUid != null ? input.ownerUid : current.ownerUid,
      ownerName: input?.ownerName != null ? input.ownerName : current.ownerName,
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
    kind,
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
  return [row.name, formatOrgnr(row.orgnr), row.place, row.contactName, row.ownerName].filter(Boolean).join(' · ');
}

export function companyFollowUpPeople(members) {
  return (Array.isArray(members) ? members : []).filter((row) => (
    row && (row.role === 'parent' || row.role === 'adult') && (row.uid || row.id) && row.name
  ));
}

export function ownerLabel(customer, people = []) {
  if (!customer?.ownerUid) return '';
  const hit = (Array.isArray(people) ? people : []).find((row) => (
    (row.uid || row.id) === customer.ownerUid
  ));
  return text(hit?.name) || text(customer.ownerName);
}

export function setCustomerOwner(state, customerId, person) {
  const id = text(customerId);
  const customers = normalizeCustomers(state?.customers);
  const current = customers.find((row) => row.id === id);
  if (!current) return { ok: false, state, error: 'Kunden finnes ikke.' };
  const ownerUid = text(person?.uid || person?.id);
  const ownerName = text(person?.name).slice(0, 80);
  if (person && !ownerUid) return { ok: false, state, error: 'Velg en person i bedriften.' };
  const next = normalizeCustomer({
    ...current,
    ownerUid,
    ownerName: ownerUid ? ownerName : '',
    updatedAt: new Date().toISOString(),
  });
  return {
    ok: true,
    state: { ...state, customers: customers.map((row) => (row.id === id ? next : row)) },
    error: null,
    customer: next,
  };
}

function cleanContact(value, { email = false, phone = false, postal = false } = {}) {
  const raw = text(value);
  if (!raw) return { value: '', issue: '' };
  if (email) {
    return raw.includes('@')
      ? { value: raw, issue: '' }
      : { value: '', issue: 'E-post er ikke gyldig og blir ikke lagret.' };
  }
  if (phone) {
    const count = raw.replace(/\D/g, '').length;
    return count >= 8 && count <= 15
      ? { value: raw, issue: '' }
      : { value: '', issue: 'Telefonnummeret er ikke gyldig og blir ikke lagret.' };
  }
  if (postal) {
    const code = raw.replace(/\D/g, '');
    return code.length === 4
      ? { value: code, issue: '' }
      : { value: '', issue: 'Postnummeret er ikke fire siffer og blir ikke lagret.' };
  }
  return { value: raw, issue: '' };
}

/**
 * Kontrollerer en kundeliste uten å lagre.
 * severity block: raden kan ikke importeres og krever behandling.
 * severity review: raden kan importeres, men har avvik.
 */
export function planCustomerImport(state, rows) {
  const existing = normalizeCustomers(state?.customers);
  const existingOrgnr = new Set(existing.map((row) => row.orgnr).filter(Boolean));
  const existingPerson = new Set(existing.map((row) => row.personnummer).filter(Boolean));
  const existingNames = new Set(existing.map((row) => fold(row.name)).filter(Boolean));
  const seenOrgnr = new Set();
  const seenPerson = new Set();
  const seenNames = new Set();
  const planned = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = text(row?.name);
    const kind = row?.kind === 'person' || row?.kind === 'org'
      ? row.kind
      : (customerKindFromIds(row?.orgnr, row?.personnummer) || 'org');
    const orgnr = kind === 'person' ? '' : normalizeOrgnr(row?.orgnr);
    const personnummer = kind === 'org' ? '' : normalizePersonnummer(row?.personnummer);
    const email = cleanContact(row?.email, { email: true });
    const phone = cleanContact(row?.phone, { phone: true });
    const postal = cleanContact(row?.postalCode, { postal: true });
    const address = text(row?.address);
    const place = text(row?.place);
    const issues = [];
    if (email.issue) issues.push(email.issue);
    if (phone.issue) issues.push(phone.issue);
    if (postal.issue) issues.push(postal.issue);
    if (!address) issues.push('Mangler adresse.');
    else {
      if (!text(row?.postalCode)) issues.push('Mangler postnummer.');
      if (!place) issues.push('Mangler poststed.');
    }
    if (!text(row?.email) && !text(row?.phone)) issues.push('Mangler e-post og telefon.');
    const label = name || text(row?.orgnr) || text(row?.email) || 'Uten navn';
    let block = '';
    if (!name) block = 'Mangler navn.';
    else if (kind === 'org' && text(row?.orgnr) && !orgnr) block = 'Organisasjonsnummer må være ni siffer.';
    else if (kind === 'person' && text(row?.personnummer) && !personnummer) block = 'Personnummer må være elleve siffer.';
    else if (orgnr && existingOrgnr.has(orgnr)) block = 'En kunde med samme organisasjonsnummer finnes allerede.';
    else if (orgnr && seenOrgnr.has(orgnr)) block = 'Organisasjonsnummeret står flere ganger i listen. Bare den første raden kan importeres.';
    else if (personnummer && existingPerson.has(personnummer)) block = 'En kunde med samme personnummer finnes allerede.';
    else if (personnummer && seenPerson.has(personnummer)) block = 'Personnummeret står flere ganger i listen. Bare den første raden kan importeres.';
    if (!block) {
      const nameKey = fold(name);
      if (kind === 'org' && !orgnr) issues.push('Mangler organisasjonsnummer.');
      if (kind === 'person' && !personnummer) issues.push('Mangler personnummer.');
      if (nameKey && existingNames.has(nameKey)) issues.push('Samme navn finnes allerede i kunderegisteret.');
      else if (nameKey && seenNames.has(nameKey)) issues.push('Samme navn står flere ganger i listen.');
      if (nameKey) seenNames.add(nameKey);
      if (orgnr) seenOrgnr.add(orgnr);
      if (personnummer) seenPerson.add(personnummer);
    }
    const customer = block ? null : emptyCustomer({
      ...row,
      name,
      kind,
      orgnr,
      personnummer,
      address,
      place,
      postalCode: postal.value,
      email: email.value,
      phone: phone.value,
    });
    planned.push({
      action: block ? 'skip' : 'create',
      severity: block ? 'block' : (issues.length ? 'review' : 'ok'),
      name: label,
      orgnr,
      place,
      address,
      email: email.value,
      phone: phone.value,
      reason: block,
      issues: block ? [block, ...issues] : issues,
      customer,
    });
  }
  const rank = { block: 0, review: 1, ok: 2 };
  planned.sort((left, right) => rank[left.severity] - rank[right.severity]);
  return { rows: planned };
}

export function importCustomers(state, rows) {
  let next = state;
  const created = [];
  const skipped = [];
  const errors = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const result = upsertCustomer(next, row);
    if (result.ok) {
      next = result.state;
      created.push(result.customer);
    } else if (result.customer) {
      skipped.push({ name: text(row?.name) || result.customer.name, reason: result.error, customer: result.customer });
    } else {
      errors.push({ name: text(row?.name), reason: result.error });
    }
  }
  return {
    ok: created.length > 0 || (!errors.length && !skipped.length),
    state: next,
    created,
    skipped,
    errors,
    error: created.length || skipped.length
      ? null
      : (errors[0]?.reason || 'Fant ingen kunder i filen.'),
  };
}
