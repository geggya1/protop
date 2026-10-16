/** Forslag fra innlest avtale: kunde, prosjekt, postnummer og oppdragsleder. */

import { searchKartverketAdresser } from '../utils/boligmappaApis.js';
import {
  DEFAULT_BIOMKOST,
  DEFAULT_HONORAR_FORM,
  DEFAULT_INDEX_ID,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_SPECIAL_TERMS,
  DEFAULT_STANDARD,
} from './agreementTemplate.js';
import { matchCustomer, namesLikelyMatch, normalizeOrgnr } from './customers.js';

export const SUGGESTION_MARK = 'Automatisk foreslått (kontroller)';
export const FOCUS_FIELD_BG = '#fff4cc';
export const FOCUS_FIELD_BORDER = '#d4a017';
export const SUGGESTION_NOTE = 'Lyse gule felt skal fylles inn. «Automatisk foreslått (kontroller)» er lest fra dokumentet og må kontrolleres.';

export const INVOICE_METHODS = [
  { id: 'EPOST', label: 'E-post' },
  { id: 'EHF', label: 'EHF' },
  { id: 'POST', label: 'Post' },
];

const TEMPLATE_DEFAULTS = {
  standard: DEFAULT_STANDARD,
  indexId: DEFAULT_INDEX_ID,
  honorarForm: DEFAULT_HONORAR_FORM,
  biomkostninger: DEFAULT_BIOMKOST,
  paymentTerms: DEFAULT_PAYMENT_TERMS,
  specialTerms: DEFAULT_SPECIAL_TERMS,
  surchargePercent: '10',
  invoiceMethod: 'EPOST',
  renewalType: 'ingen',
};

const WATCH_KEYS = [
  'kind', 'title', 'description', 'poNumber', 'standard',
  'address', 'postalCode', 'place', 'gnrBnr', 'start', 'end', 'contractDate', 'engagementPercent',
  'buyer', 'orgnr', 'personnummer', 'contactName', 'email', 'phone', 'buyerAddress',
  'invoiceMethod', 'invoiceAttn',
  'leaderName', 'leaderEmail', 'leaderPhone', 'leaderUid',
  'resourceName', 'resourceEmail', 'resourcePhone',
  'honorarForm', 'value', 'surchargePercent', 'biomkostninger', 'indexId', 'paymentTerms', 'specialTerms',
  'customerId', 'projectId',
];

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fold(value) {
  return text(value).toLocaleLowerCase('nb-NO');
}

function postal(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(0, 4) : '';
}

export function suggestionMarks(previous, next, { explicit = [] } = {}) {
  const marks = {};
  const forced = new Set(explicit);
  for (const key of WATCH_KEYS) {
    const value = text(next?.[key]);
    if (!value) continue;
    if (key === 'value' && Number(value) === 0) continue;
    if (forced.has(key)) {
      marks[key] = true;
      continue;
    }
    const prev = text(previous?.[key]);
    const template = text(TEMPLATE_DEFAULTS[key]);
    if (prev && prev !== template && value === prev) continue;
    if (value === prev) continue;
    if (template && value === template && (!prev || prev === template)) continue;
    marks[key] = true;
  }
  return marks;
}

function fillEmpty(target, source, keys) {
  const filled = [];
  for (const key of keys) {
    if (text(target[key]) || !text(source?.[key])) continue;
    target[key] = source[key];
    filled.push(key);
  }
  return filled;
}

export function suggestProject(projects, hint = {}) {
  const title = fold(hint.title || hint.projectName);
  const place = fold(hint.place);
  const address = fold(hint.address);
  const buyer = fold(hint.buyer);
  const ranked = [];
  for (const project of Array.isArray(projects) ? projects : []) {
    const name = fold(project?.name);
    if (!name || name.length < 3) continue;
    let score = 0;
    const head = fold(String(hint.title || '').split('·')[0]);
    if (title && (name === title || name === head)) score += 70;
    else if (head && (head.startsWith(name) || name.startsWith(head)) && name.length >= 4) score += 55;
    else if (title.includes(name) && name.length >= 4) score += 45;
    else {
      const token = name.split(' ').find((part) => part.length >= 5);
      if (token && title.includes(token)) score += 28;
    }
    const projectPlace = fold(project.place || project.city);
    if (place && projectPlace && (projectPlace.includes(place) || place.includes(projectPlace))) score += 12;
    const projectAddress = fold(project.address);
    if (address && projectAddress && (address.includes(projectAddress) || projectAddress.includes(address))) score += 12;
    const projectBuyer = fold(project.customerName || project.buyer || project.client);
    if (buyer && projectBuyer && (buyer.includes(projectBuyer) || projectBuyer.includes(buyer))) score += 8;
    if (score > 0) ranked.push({ project, score });
  }
  ranked.sort((a, b) => b.score - a.score || fold(a.project.name).localeCompare(fold(b.project.name), 'nb'));
  const best = ranked[0];
  const second = ranked[1];
  const confident = Boolean(best && best.score >= 45 && (!second || best.score - second.score >= 12));
  return {
    best: confident ? best.project : null,
    alternatives: ranked.slice(0, 3).map((row) => row.project),
  };
}

export function suggestEmployee(people, name) {
  const needle = fold(name);
  if (needle.length < 3) return null;
  const rows = (Array.isArray(people) ? people : []).filter((person) => text(person?.name));
  const exact = rows.filter((person) => fold(person.name) === needle);
  if (exact.length === 1) return exact[0];
  const partial = rows.filter((person) => {
    const candidate = fold(person.name);
    if (candidate.includes(needle) || needle.includes(candidate)) return true;
    const left = needle.split(' ').filter((part) => part.length >= 2);
    const right = new Set(candidate.split(' ').filter((part) => part.length >= 2));
    if (left.length < 2) return false;
    return left.every((part) => right.has(part));
  });
  return partial.length === 1 ? partial[0] : null;
}

function applyCustomer(form, customer) {
  if (!customer) return [];
  form.customerId = customer.id;
  form.createCustomer = false;
  const filled = [];
  const pairs = [
    ['buyer', customer.name],
    ['orgnr', customer.orgnr],
    ['personnummer', customer.personnummer],
    ['address', customer.address],
    ['place', customer.place],
    ['postalCode', customer.postalCode],
    ['contactName', customer.contactName],
    ['email', customer.email],
    ['phone', customer.phone],
    ['buyerAddress', customer.address],
  ];
  for (const [key, value] of pairs) {
    if (text(form[key]) || !text(value)) continue;
    form[key] = value;
    filled.push(key);
  }
  if (!text(form.buyer) && text(customer.name)) {
    form.buyer = customer.name;
    filled.push('buyer');
  }
  return filled;
}

export function planAgreementSuggestions({
  previous = {},
  next = {},
  projects = [],
  people = [],
  customers = [],
  explicit = [],
} = {}) {
  const form = { ...next };
  const customerChoices = [];
  const supplier = text(form.supplier);
  const buyerIsSupplier = supplier && namesLikelyMatch(form.buyer, supplier)
    && (!normalizeOrgnr(form.orgnr) || normalizeOrgnr(form.orgnr) === normalizeOrgnr(form.supplierOrgnr || ''));

  if (!text(previous.customerId) && !text(form.customerId) && !buyerIsSupplier && (text(form.buyer) || text(form.orgnr))) {
    const hint = matchCustomer(customers, form);
    if (hint.status === 'match') applyCustomer(form, hint.customer);
    else if (hint.status === 'ambiguous') customerChoices.push(...hint.candidates);
  }

  let projectChoices = [];
  if (!text(previous.projectId) && !text(form.projectId)) {
    const pick = suggestProject(projects, form);
    projectChoices = pick.alternatives;
    if (pick.best) {
      form.projectId = pick.best.id;
      if (!text(form.projectName)) form.projectName = pick.best.name || '';
      fillEmpty(form, {
        address: pick.best.address,
        place: pick.best.place,
        postalCode: pick.best.postalCode,
      }, ['address', 'place', 'postalCode']);
    }
  }

  let unmatchedLeader = '';
  if (!text(previous.leaderUid) && !text(form.leaderUid) && text(form.leaderName)) {
    const person = suggestEmployee(people, form.leaderName);
    if (person) {
      form.leaderUid = person.uid || person.id || '';
      form.leaderName = person.name || form.leaderName;
      if (!text(form.leaderEmail) && text(person.email)) form.leaderEmail = person.email;
      if (!text(form.leaderPhone) && text(person.phone)) form.leaderPhone = person.phone;
    } else {
      unmatchedLeader = form.leaderName;
    }
  }

  const suggested = suggestionMarks(previous, form, { explicit });
  if (text(form.customerId) && !text(previous.customerId)) suggested.customerId = true;
  if (text(form.projectId) && !text(previous.projectId)) suggested.projectId = true;
  if (text(form.leaderUid) && !text(previous.leaderUid)) suggested.leaderUid = true;

  return {
    form,
    suggested,
    customerChoices,
    projectChoices: projectChoices.filter((row) => row?.id && row.id !== form.projectId),
    unmatchedLeader,
  };
}

function placeMatches(hitPlace, wanted) {
  const left = fold(hitPlace);
  const right = fold(wanted);
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

export async function lookupPostalCode({ address = '', place = '', postalCode = '' } = {}, search = searchKartverketAdresser) {
  const existing = postal(postalCode);
  if (existing) return { postalCode: existing, place: text(place), source: 'document' };
  const street = text(address);
  const city = text(place);
  if (!street && !city) return null;
  const query = [street, city].filter(Boolean).join(', ');
  const { results } = await search(query, { treffPerSide: 6 });
  const rows = Array.isArray(results) ? results : [];
  const ranked = rows
    .map((hit) => ({ hit, code: postal(hit?.postnummer) }))
    .filter((row) => row.code && placeMatches(row.hit.poststed, city));
  if (!ranked.length) return null;
  const hit = ranked[0].hit;
  return {
    postalCode: ranked[0].code,
    place: city || text(hit.poststed),
    source: 'kartverket',
  };
}

export function brregSuggestion(hits, { name = '', orgnr = '' } = {}) {
  const rows = Array.isArray(hits) ? hits : [];
  const wanted = normalizeOrgnr(orgnr);
  if (wanted) {
    const hit = rows.find((row) => normalizeOrgnr(row?.organisasjonsnummer) === wanted);
    if (hit) return { confident: hit, alternatives: [] };
  }
  const named = rows.filter((row) => namesLikelyMatch(row?.navn, name));
  if (named.length === 1) return { confident: named[0], alternatives: [] };
  return { confident: null, alternatives: rows.slice(0, 4) };
}
