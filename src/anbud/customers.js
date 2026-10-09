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
      : hit.raw?.forretningsadresse?.adresse)
    || text(Array.isArray(hit.raw?.beliggenhetsadresse?.adresse)
      ? hit.raw.beliggenhetsadresse.adresse.filter(Boolean).join(', ')
      : hit.raw?.beliggenhetsadresse?.adresse)
    || text(Array.isArray(hit.raw?.postadresse?.adresse)
      ? hit.raw.postadresse.adresse.filter(Boolean).join(', ')
      : hit.raw?.postadresse?.adresse);
  const postalCode = digits(
    hit.postnummer
    || hit.raw?.forretningsadresse?.postnummer
    || hit.raw?.beliggenhetsadresse?.postnummer
    || hit.raw?.postadresse?.postnummer,
    4,
  );
  const place = text(
    hit.poststed
    || hit.raw?.forretningsadresse?.poststed
    || hit.raw?.beliggenhetsadresse?.poststed
    || hit.raw?.postadresse?.poststed,
  );
  return emptyCustomer({
    kind: 'org',
    name: text(hit.navn).slice(0, 160),
    orgnr: normalizeOrgnr(hit.organisasjonsnummer),
    personnummer: '',
    address: street.slice(0, 160),
    postalCode,
    place: place.slice(0, 80),
    email: text(hit.epostadresse).slice(0, 80),
    phone: text(hit.telefon || hit.raw?.telefon || hit.raw?.mobil).slice(0, 40),
    notes: [text(hit.organisasjonsform), text(hit.naeringsbeskrivelse)].filter(Boolean).join(' · ').slice(0, 400),
  });
}

/** Fyller tomme kundefelt fra Brønnøysund. Eksisterende verdier beholdes. */
export function fillCustomerFromBrreg(customer, hit) {
  const draft = customerDraftFromBrreg(hit);
  if (!draft) return customer || emptyCustomer();
  const take = (key) => text(customer?.[key]) || draft[key] || '';
  return {
    ...(customer || emptyCustomer()),
    kind: 'org',
    name: text(customer?.name) || draft.name,
    orgnr: normalizeOrgnr(customer?.orgnr) || draft.orgnr,
    personnummer: '',
    address: take('address'),
    postalCode: take('postalCode'),
    place: take('place'),
    email: take('email'),
    phone: take('phone'),
    notes: text(customer?.notes) || draft.notes,
  };
}

function customerNeedsBrreg(customer) {
  const row = customer || {};
  if (row.kind === 'person') return false;
  if (!normalizeOrgnr(row.orgnr)) return false;
  return !text(row.address) || !text(row.postalCode) || !text(row.place)
    || (!text(row.email) && !text(row.phone));
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
    customerNumber: '',
    ownerUid: '',
    ownerName: '',
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

export function normalizeCustomerNumber(value) {
  let raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  // Excel lagrer ofte 10115 som 10115.0 — ikke strip punktum før nullene er fjernet.
  if (/^\d+[.,]0+$/.test(raw)) raw = raw.replace(/[.,]0+$/, '');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const number = Number(digits);
  if (!Number.isFinite(number) || number <= 0 || number > 999999999) return '';
  return String(number);
}

export function customerNumberFromNotes(notes) {
  const match = String(notes || '').match(/Kundenr\s+(\d+)/i);
  return normalizeCustomerNumber(match?.[1]);
}

function stripCustomerNumberNote(notes, number) {
  return text(String(notes || '').replace(new RegExp(`Kundenr\\s+${number}`, 'i'), ''))
    .replace(/\s*·\s*·\s*/g, ' · ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function nextCustomerNumber(customers) {
  let max = 0;
  for (const row of Array.isArray(customers) ? customers : []) {
    const number = Number(normalizeCustomerNumber(row?.customerNumber));
    if (number > max) max = number;
  }
  return String(max + 1);
}

/** Gir hver kunde et kundenummer. Definerte nummer beholdes. Nye får neste ledige, eldste først. */
export function withCustomerNumbers(customers) {
  const rows = normalizeCustomers(customers).map((row) => {
    const defined = normalizeCustomerNumber(row.customerNumber);
    const fromNotes = customerNumberFromNotes(row.notes);
    const customerNumber = defined || fromNotes;
    const notes = fromNotes && (!defined || defined === fromNotes)
      ? stripCustomerNumberNote(row.notes, fromNotes)
      : row.notes;
    return { ...row, customerNumber, notes };
  });
  const ordered = [...rows].sort((left, right) => (
    String(left.createdAt).localeCompare(String(right.createdAt))
    || left.name.localeCompare(right.name, 'nb')
  ));
  const used = new Set();
  const kept = new Map();
  const pending = [];
  for (const row of ordered) {
    if (row.customerNumber && !used.has(row.customerNumber)) {
      used.add(row.customerNumber);
      kept.set(row.id, row);
    } else {
      pending.push(row);
    }
  }
  let next = nextCustomerNumber([...kept.values()]);
  for (const row of pending) {
    kept.set(row.id, { ...row, customerNumber: next });
    next = String(Number(next) + 1);
  }
  return rows.map((row) => kept.get(row.id) || row);
}

export function assignCustomerNumber(customers, requested) {
  const rows = withCustomerNumbers(customers);
  const wanted = normalizeCustomerNumber(requested);
  const taken = new Set(rows.map((row) => row.customerNumber));
  if (wanted && !taken.has(wanted)) return { customerNumber: wanted, replaced: '' };
  return {
    customerNumber: nextCustomerNumber(rows),
    replaced: wanted || '',
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
    customerNumber: normalizeCustomerNumber(raw.customerNumber) || customerNumberFromNotes(raw.notes),
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

/**
 * Felt som må rettes før fakturering.
 * Virksomheter med org.nr henter adresse/kontakt fra Brønnøysund — ikke advarsel der.
 */
export function customerInvoiceGaps(customer) {
  const row = customer || {};
  const issues = [];
  const orgnr = normalizeOrgnr(row.orgnr);
  if (row.kind !== 'person') {
    if (!orgnr) issues.push('Mangler organisasjonsnummer.');
    return issues;
  }
  if (!text(row.address)) issues.push('Mangler adresse.');
  else {
    if (!text(row.postalCode)) issues.push('Mangler postnummer.');
    if (!text(row.place)) issues.push('Mangler poststed.');
  }
  if (!text(row.email) && !text(row.phone)) issues.push('Mangler e-post og telefon.');
  return issues;
}

export function customerReadyForInvoice(customer) {
  return !customerInvoiceGaps(customer).length;
}

export function filterCustomers(customers, query = '', { kind = '', gap = '' } = {}) {
  const needle = fold(query);
  let rows = Array.isArray(customers) ? customers : [];
  if (kind === 'org' || kind === 'person') rows = rows.filter((row) => row.kind === kind);
  if (gap === 'contact') rows = rows.filter((row) => !text(row.email) && !text(row.phone));
  if (gap === 'address') rows = rows.filter((row) => !text(row.address));
  if (gap === 'orgnr') rows = rows.filter((row) => row.kind !== 'person' && !text(row.orgnr));
  if (gap === 'invoice') rows = rows.filter((row) => customerInvoiceGaps(row).length);
  if (needle) {
    rows = rows.filter((row) => {
      const hay = [
        row.customerNumber, row.name, row.orgnr, row.personnummer, row.place, row.postalCode, row.address,
        row.contactName, row.email, row.phone, row.ownerName, row.notes,
      ].map(fold).join(' ');
      return hay.includes(needle);
    });
  }
  return [...rows].sort((left, right) => (
    Number(left.customerNumber || 0) - Number(right.customerNumber || 0)
    || left.name.localeCompare(right.name, 'nb')
  ));
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
    const nextNumber = normalizeCustomerNumber(input?.customerNumber) || current.customerNumber;
    const numberClash = nextNumber
      ? customers.find((row) => row.id !== existingId && row.customerNumber === nextNumber)
      : null;
    if (numberClash) {
      return { ok: false, state, error: 'Kundenummeret finnes allerede.', customer: numberClash };
    }
    const next = normalizeCustomer({
      ...current,
      ...input,
      id: existingId,
      name,
      kind,
      orgnr,
      personnummer,
      customerNumber: nextNumber,
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
  const wantedNumber = normalizeCustomerNumber(input?.customerNumber);
  const numberClash = wantedNumber
    ? customers.find((row) => row.customerNumber === wantedNumber)
    : null;
  if (numberClash) {
    return { ok: false, state, error: 'Kundenummeret finnes allerede.', customer: numberClash };
  }
  const clash = customers.find((row) => (orgnr && row.orgnr === orgnr) || (personnummer && row.personnummer === personnummer));
  if (clash) {
    return { ok: false, state, error: 'En kunde med samme organisasjons- eller personnummer finnes allerede.', customer: clash };
  }
  const assigned = assignCustomerNumber(customers, input?.customerNumber);
    const customer = normalizeCustomer({
    ...emptyCustomer(input),
    id: createId('kunde'),
    name,
    kind,
    orgnr,
    personnummer,
    customerNumber: assigned.customerNumber,
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

/** Medlemmer og ansatte som kan velges som ansvarlig for avtale/kunde. */
export function agreementResponsiblePeople(members = [], employees = []) {
  const fromMembers = companyFollowUpPeople(members).map((row) => ({
    uid: row.uid || row.id,
    id: row.uid || row.id,
    name: text(row.name),
    source: 'member',
  }));
  const seen = new Set(fromMembers.map((row) => row.uid));
  const fromEmployees = (Array.isArray(employees) ? employees : []).map((row) => {
    const person = row?.person || {};
    const name = [person.firstName, person.middleName, person.lastName].map(text).filter(Boolean).join(' ');
    const id = text(row?.id);
    if (!id || !name || seen.has(id)) return null;
    seen.add(id);
    return { uid: id, id, name, source: 'employee' };
  }).filter(Boolean);
  return [...fromMembers, ...fromEmployees].sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

export function ownerLabel(customer, people = []) {
  if (!customer?.ownerUid) return '';
  const hit = (Array.isArray(people) ? people : []).find((row) => (
    (row.uid || row.id) === customer.ownerUid
  ));
  return text(hit?.name) || text(customer.ownerName);
}

/**
 * Avtaler knyttet til kunden: customerId, eller kjøpernavn når customerId mangler.
 * Slettede avtaler utelates.
 */
export function relatedContractsForCustomer(contracts, customer) {
  const rows = Array.isArray(contracts) ? contracts : [];
  if (!customer?.id) return [];
  const name = fold(customer.name);
  return rows.filter((row) => {
    if (row?.deletedAt) return false;
    if (row.customerId === customer.id) return true;
    if (row.customerId) return false;
    return name && fold(row.buyer) === name;
  });
}

/**
 * Matcher prosjektets oppførte kunde mot kunderegisteret.
 * Prioritet: customerId → kundenummer → org.nr → kundenavn (client).
 */
export function projectBelongsToCustomer(project, customer) {
  if (!project || !customer?.id) return false;
  if (project.status === 'arkivert') return false;
  if (text(project.customerId) === customer.id) return true;
  if (text(project.customerId)) return false;
  const number = normalizeCustomerNumber(customer.customerNumber);
  if (number && normalizeCustomerNumber(project.customerNumber) === number) return true;
  const orgnr = normalizeOrgnr(customer.orgnr);
  if (orgnr && normalizeOrgnr(project.orgnr) === orgnr) return true;
  const client = fold(project.client);
  const name = fold(customer.name);
  // Samme regel som avtaler: eksakt navn når customerId mangler (ikke myk matching).
  if (client && name && client === name) return true;
  return false;
}

/** Aktive prosjekt som hører til kunden via prosjektets kundefelt. */
export function relatedProjectsForCustomer(projects, customer) {
  const rows = Array.isArray(projects) ? projects : [];
  if (!customer?.id) return [];
  return rows
    .filter((row) => projectBelongsToCustomer(row, customer))
    .sort((left, right) => (
      String(left.number || '').localeCompare(String(right.number || ''), 'nb', { numeric: true })
      || String(left.name || '').localeCompare(String(right.name || ''), 'nb')
    ));
}

/**
 * Antall aktive prosjekt per kunde-id.
 * Prosjekt uten customerId fordeles via kundenummer, org.nr eller navn.
 */
export function projectCountsByCustomer(projects, customers) {
  const counts = new Map();
  const list = Array.isArray(customers) ? customers : [];
  for (const customer of list) counts.set(customer.id, 0);
  for (const project of Array.isArray(projects) ? projects : []) {
    if (!project || project.status === 'arkivert') continue;
    let matched = null;
    if (text(project.customerId)) {
      matched = list.find((row) => row.id === project.customerId) || null;
    } else {
      matched = list.find((row) => projectBelongsToCustomer(project, row)) || null;
    }
    if (!matched) continue;
    counts.set(matched.id, (counts.get(matched.id) || 0) + 1);
  }
  return counts;
}

/** Mobilrad i kundelisten: navn og org.nr, og bare utfylte tillegg. */
export function customerPhoneLines(customer, people = [], { projectCount } = {}) {
  const row = customer || {};
  const person = row.kind === 'person';
  const id = person ? maskPersonnummer(row.personnummer) : formatOrgnr(row.orgnr);
  const identity = id
    ? `${person ? 'Personnummer' : 'Org.nr'} ${id}`
    : (person ? 'Privatkunde' : 'Virksomhet');
  const address = [row.address, [row.postalCode, row.place].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const projects = Number.isFinite(projectCount) && projectCount > 0
    ? `${projectCount} prosjekt${projectCount === 1 ? '' : 'er'}`
    : '';
  return {
    name: text(row.name) || 'Kunde uten navn',
    meta: [text(row.customerNumber) ? `Nr ${text(row.customerNumber)}` : '', identity, projects].filter(Boolean).join(' · '),
    extra: [address, text(row.contactName), text(row.email), text(row.phone), ownerLabel(row, people)].filter(Boolean).join(' · '),
  };
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
 * severity existing: kunden finnes allerede (kundenummer, org.nr eller personnummer).
 * severity block: raden kan ikke importeres (mangler navn, duplikat i filen).
 * severity review: ny kunde som importeres, men mangler opplysninger til faktura.
 * action update: eksisterende kunde får kundenummer fra fila (samme org.nr/personnummer).
 */
export function planCustomerImport(state, rows) {
  const existing = withCustomerNumbers(normalizeCustomers(state?.customers));
  const existingOrgnr = new Set(existing.map((row) => row.orgnr).filter(Boolean));
  const existingPerson = new Set(existing.map((row) => row.personnummer).filter(Boolean));
  const existingNumbers = new Set(existing.map((row) => row.customerNumber).filter(Boolean));
  const seenOrgnr = new Set();
  const seenPerson = new Set();
  const seenNumbers = new Set();
  let registry = existing;
  const planned = [];

  function claimNumberUpdate(hit, requestedNumber, identityReason) {
    const matchCustomerNumber = text(hit?.customerNumber);
    const matchId = text(hit?.id);
    const matchName = text(hit?.name);
    if (!requestedNumber || requestedNumber === matchCustomerNumber) {
      return {
        action: 'skip',
        severity: 'existing',
        reason: identityReason,
        matchId,
        matchName,
        matchCustomerNumber,
        customer: null,
        issues: [],
      };
    }
    const owner = registry.find((item) => item.customerNumber === requestedNumber);
    if (owner && owner.id !== hit.id) {
      return {
        action: 'skip',
        severity: 'existing',
        reason: `Kundenummer ${requestedNumber} er opptatt av en annen kunde. Kunden finnes som Nr ${matchCustomerNumber}.`,
        matchId,
        matchName,
        matchCustomerNumber,
        customer: null,
        issues: [],
      };
    }
    if (seenNumbers.has(requestedNumber)) {
      return {
        action: 'skip',
        severity: 'block',
        reason: 'Kundenummeret står flere ganger i listen. Bare den første raden kan importeres.',
        matchId,
        matchName,
        matchCustomerNumber,
        customer: null,
        issues: [],
      };
    }
    const customer = normalizeCustomer({
      ...hit,
      customerNumber: requestedNumber,
    });
    if (matchCustomerNumber) existingNumbers.delete(matchCustomerNumber);
    existingNumbers.add(requestedNumber);
    seenNumbers.add(requestedNumber);
    registry = registry.map((item) => (item.id === hit.id ? { ...item, customerNumber: requestedNumber } : item));
    return {
      action: 'update',
      severity: 'ok',
      reason: '',
      matchId,
      matchName,
      matchCustomerNumber,
      customer,
      issues: [`Kundenummer oppdateres fra Nr ${matchCustomerNumber} til Nr ${requestedNumber}.`],
    };
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    const name = text(row?.name);
    const kind = row?.kind === 'person' || row?.kind === 'org'
      ? row.kind
      : (customerKindFromIds(row?.orgnr, row?.personnummer) || 'org');
    const rawOrgnr = kind === 'person' ? '' : text(row?.orgnr);
    const orgnr = kind === 'person' ? '' : normalizeOrgnr(row?.orgnr);
    const rawPerson = kind === 'org' ? '' : text(row?.personnummer);
    const personnummer = kind === 'org' ? '' : normalizePersonnummer(row?.personnummer);
    const email = cleanContact(row?.email, { email: true });
    const phone = cleanContact(row?.phone, { phone: true });
    const postal = cleanContact(row?.postalCode, { postal: true });
    const address = text(row?.address);
    const place = text(row?.place);
    const requestedNumber = normalizeCustomerNumber(row?.customerNumber || customerNumberFromNotes(row?.notes));
    const issues = [];
    if (email.issue) issues.push(email.issue);
    if (phone.issue) issues.push(phone.issue);
    if (postal.issue) issues.push(postal.issue);
    if (rawOrgnr && !orgnr) issues.push('Organisasjonsnummeret er ikke ni siffer og blir ikke lagret.');
    if (rawPerson && !personnummer) issues.push('Personnummeret er ikke elleve siffer og blir ikke lagret.');
    const label = name || requestedNumber || text(row?.orgnr) || text(row?.email) || 'Uten navn';
    let severity = '';
    let reason = '';
    let matchId = '';
    let matchName = '';
    let matchCustomerNumber = '';
    let action = 'skip';
    let customer = null;
    if (!name) {
      severity = 'block';
      reason = 'Mangler navn.';
    } else if (orgnr && existingOrgnr.has(orgnr)) {
      const hit = existing.find((item) => item.orgnr === orgnr);
      const plannedHit = claimNumberUpdate(
        hit,
        requestedNumber,
        'En kunde med samme organisasjonsnummer finnes allerede.',
      );
      action = plannedHit.action;
      severity = plannedHit.severity;
      reason = plannedHit.reason;
      matchId = plannedHit.matchId;
      matchName = plannedHit.matchName;
      matchCustomerNumber = plannedHit.matchCustomerNumber;
      customer = plannedHit.customer;
      for (const issue of plannedHit.issues) {
        if (!issues.includes(issue)) issues.push(issue);
      }
    } else if (orgnr && seenOrgnr.has(orgnr)) {
      severity = 'block';
      reason = 'Organisasjonsnummeret står flere ganger i listen. Bare den første raden kan importeres.';
    } else if (personnummer && existingPerson.has(personnummer)) {
      const hit = existing.find((item) => item.personnummer === personnummer);
      const plannedHit = claimNumberUpdate(
        hit,
        requestedNumber,
        'En kunde med samme personnummer finnes allerede.',
      );
      action = plannedHit.action;
      severity = plannedHit.severity;
      reason = plannedHit.reason;
      matchId = plannedHit.matchId;
      matchName = plannedHit.matchName;
      matchCustomerNumber = plannedHit.matchCustomerNumber;
      customer = plannedHit.customer;
      for (const issue of plannedHit.issues) {
        if (!issues.includes(issue)) issues.push(issue);
      }
    } else if (personnummer && seenPerson.has(personnummer)) {
      severity = 'block';
      reason = 'Personnummeret står flere ganger i listen. Bare den første raden kan importeres.';
    } else if (requestedNumber && existingNumbers.has(requestedNumber)) {
      const hit = existing.find((item) => item.customerNumber === requestedNumber)
        || registry.find((item) => item.customerNumber === requestedNumber);
      severity = 'existing';
      reason = 'Kundenummeret finnes allerede.';
      matchId = text(hit?.id);
      matchName = text(hit?.name);
      matchCustomerNumber = text(hit?.customerNumber);
    } else if (requestedNumber && seenNumbers.has(requestedNumber)) {
      severity = 'block';
      reason = 'Kundenummeret står flere ganger i listen. Bare den første raden kan importeres.';
    }
    if (!severity) {
      if (orgnr) seenOrgnr.add(orgnr);
      if (personnummer) seenPerson.add(personnummer);
      if (requestedNumber) seenNumbers.add(requestedNumber);
      const assigned = assignCustomerNumber(registry, requestedNumber);
      customer = emptyCustomer({
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
        customerNumber: assigned.customerNumber,
      });
      for (const issue of customerInvoiceGaps(customer)) {
        if (!issues.includes(issue)) issues.push(issue);
      }
      registry = [...registry, { ...customer, id: `plan_${planned.length}` }];
      severity = issues.length ? 'review' : 'ok';
      action = 'create';
    }
    planned.push({
      action,
      severity,
      name: label,
      orgnr,
      customerNumber: customer?.customerNumber || requestedNumber,
      place,
      address,
      email: email.value,
      phone: phone.value,
      reason,
      matchId,
      matchName,
      matchCustomerNumber,
      issues: action === 'create' || action === 'update' || severity === 'review'
        ? issues
        : [reason].filter(Boolean),
      customer,
    });
  }
  const rank = { block: 0, existing: 1, review: 2, ok: 3 };
  planned.sort((left, right) => rank[left.severity] - rank[right.severity]);
  return { rows: planned };
}

function sampleNames(names, limit = 20) {
  const list = names.filter(Boolean);
  if (list.length <= limit) return list.join(' · ');
  return `${list.slice(0, limit).join(' · ')} · +${list.length - limit}`;
}

function keepImportIssues(issues, customer) {
  const next = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (/^Mangler (adresse|postnummer|poststed|e-post og telefon|organisasjonsnummer)\.?$/i.test(issue)) continue;
    next.push(issue);
  }
  for (const issue of customerInvoiceGaps(customer)) {
    if (!next.includes(issue)) next.push(issue);
  }
  return next;
}

async function mapPool(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const out = new Array(list.length);
  let cursor = 0;
  async function run() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(list[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(Math.max(concurrency, 1), list.length || 1) }, () => run());
  await Promise.all(workers);
  return out;
}

/**
 * Henter adresse og kontakt fra Brønnøysund for nye virksomheter i importplanen.
 * lookup(orgnr) skal returnere et Brreg-treff eller null.
 */
export async function enrichCustomerImportPlan(plan, { lookup, concurrency = 6 } = {}) {
  const rows = Array.isArray(plan?.rows) ? plan.rows.map((row) => ({ ...row })) : [];
  if (typeof lookup !== 'function') return { ...(plan || {}), rows };
  const targets = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.action === 'create' && customerNeedsBrreg(row.customer));
  if (!targets.length) return { ...(plan || {}), rows };
  await mapPool(targets, concurrency, async ({ row, index }) => {
    const orgnr = normalizeOrgnr(row.customer.orgnr);
    let hit = null;
    try {
      hit = await lookup(orgnr);
    } catch {
      hit = null;
    }
    if (!hit) return;
    const customer = fillCustomerFromBrreg(row.customer, hit);
    const issues = keepImportIssues(row.issues, customer);
    rows[index] = {
      ...row,
      customer,
      orgnr: customer.orgnr,
      address: customer.address,
      place: customer.place,
      email: customer.email,
      phone: customer.phone,
      issues,
      severity: issues.length ? 'review' : 'ok',
    };
  });
  const rank = { block: 0, existing: 1, review: 2, ok: 3 };
  rows.sort((left, right) => rank[left.severity] - rank[right.severity]);
  return { ...(plan || {}), rows };
}

/** Fyller én kunde fra Brønnøysund når org.nr finnes og felt mangler. */
export async function enrichCustomerFromBrreg(customer, { lookup } = {}) {
  if (!customerNeedsBrreg(customer) || typeof lookup !== 'function') {
    return { customer, changed: false };
  }
  let hit = null;
  try {
    hit = await lookup(normalizeOrgnr(customer.orgnr));
  } catch {
    hit = null;
  }
  if (!hit) return { customer, changed: false };
  const next = fillCustomerFromBrreg(customer, hit);
  const changed = ['address', 'postalCode', 'place', 'email', 'phone', 'name']
    .some((key) => text(next[key]) !== text(customer[key]));
  return { customer: next, changed };
}

/** Kompakt visning: eksisterende kunder vises én og én med registerets kundenummer. */
export function customerImportReviewRows(planned, dropped = new Set()) {
  const blocked = new Map();
  const existing = [];
  const rows = [];
  (Array.isArray(planned) ? planned : []).forEach((row, index) => {
    const id = String(index);
    if (row.action === 'update' && row.customer) {
      rows.push({
        id,
        severity: row.severity === 'review' ? 'review' : 'ok',
        title: [row.customer.customerNumber, row.customer.name || row.name].filter(Boolean).join(' · ') || row.name,
        meta: [
          formatOrgnr(row.orgnr),
          row.matchCustomerNumber ? `Var Nr ${row.matchCustomerNumber}` : '',
        ].filter(Boolean).join(' · '),
        issues: row.issues || [],
        included: !dropped.has(id),
        matchId: row.matchId || '',
        matchCustomerNumber: row.customer.customerNumber || '',
      });
      return;
    }
    if (row.severity === 'existing') {
      const registerLabel = [
        row.matchCustomerNumber ? `Nr ${row.matchCustomerNumber}` : '',
        row.matchName || row.name,
      ].filter(Boolean).join(' · ');
      const fileLabel = [
        row.customerNumber && row.customerNumber !== row.matchCustomerNumber ? `fil ${row.customerNumber}` : '',
        row.name && row.name !== row.matchName ? row.name : '',
      ].filter(Boolean).join(' · ');
      existing.push({
        id,
        severity: 'existing',
        count: 1,
        locked: true,
        included: false,
        matchId: row.matchId || '',
        matchCustomerNumber: row.matchCustomerNumber || '',
        title: registerLabel || row.name,
        meta: [
          formatOrgnr(row.orgnr),
          fileLabel ? `I importfila: ${fileLabel}` : '',
        ].filter(Boolean).join(' · '),
        issues: [row.reason || 'Finnes allerede.'],
      });
      return;
    }
    if (row.severity === 'block') {
      const key = `block:${row.reason || ''}`;
      if (!blocked.has(key)) {
        blocked.set(key, {
          id: `group:${key}`,
          severity: 'block',
          reason: row.reason || 'Kan ikke importeres.',
          names: [],
          count: 0,
        });
      }
      const group = blocked.get(key);
      group.count += 1;
      group.names.push([row.customerNumber, row.name].filter(Boolean).join(' · '));
      return;
    }
    rows.push({
      id,
      severity: row.severity,
      title: [row.customerNumber, row.name].filter(Boolean).join(' · ') || row.name,
      meta: [formatOrgnr(row.orgnr), row.address, row.place, row.email, row.phone].filter(Boolean).join(' · '),
      issues: row.issues || [],
      included: !dropped.has(id),
    });
  });
  return [
    ...existing,
    ...[...blocked.values()].map((group) => ({
      id: group.id,
      severity: 'block',
      count: group.count,
      locked: true,
      included: false,
      title: group.count === 1 ? group.names[0] : `${group.count} kunder blir ikke importert`,
      meta: sampleNames(group.names),
      issues: [group.reason],
    })),
    ...rows,
  ];
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
