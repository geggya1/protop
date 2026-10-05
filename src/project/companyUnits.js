/** Underenheter (eget org.nr. og abonnement) og avdelinger (uten org.nr.). */
import { digitsOrgnr } from './companyRegistry.js';

export const UNIT_KIND_UNDERENHET = 'underenhet';
export const UNIT_KIND_AVDELING = 'avdeling';

function text(value) {
  return String(value || '').trim();
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeSubUnit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name || raw.navn);
  if (!name) return null;
  const kind = raw.kind === UNIT_KIND_UNDERENHET ? UNIT_KIND_UNDERENHET : UNIT_KIND_AVDELING;
  const organisasjonsnummer = digitsOrgnr(raw.organisasjonsnummer);
  if (kind === UNIT_KIND_UNDERENHET && organisasjonsnummer.length !== 9) return null;
  return {
    id: text(raw.id) || newId(kind === UNIT_KIND_UNDERENHET ? 'u' : 'd'),
    kind,
    name,
    organisasjonsnummer: kind === UNIT_KIND_UNDERENHET ? organisasjonsnummer : '',
    companyId: text(raw.companyId),
    note: text(raw.note),
    createdAt: text(raw.createdAt),
  };
}

export function normalizeSubUnits(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeSubUnit)
    .filter((row) => {
      if (!row) return false;
      const key = row.kind === UNIT_KIND_UNDERENHET
        ? `u:${row.organisasjonsnummer}`
        : `d:${row.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function createDepartment({ name, note, at } = {}) {
  const navn = text(name);
  if (!navn) return { ok: false, error: 'Avdelingen må ha et navn.' };
  return {
    ok: true,
    unit: {
      id: newId('d'),
      kind: UNIT_KIND_AVDELING,
      name: navn,
      organisasjonsnummer: '',
      companyId: '',
      note: text(note),
      createdAt: at || new Date().toISOString(),
    },
  };
}

export function createUnderenhet({
  name, organisasjonsnummer, companyId, note, at,
} = {}) {
  const navn = text(name);
  const orgnr = digitsOrgnr(organisasjonsnummer);
  if (!navn) return { ok: false, error: 'Underenheten må ha et navn.' };
  if (orgnr.length !== 9) {
    return {
      ok: false,
      error: 'Underenhet må ha et gyldig organisasjonsnummer. Avdelinger uten org.nr. registreres som avdeling.',
    };
  }
  return {
    ok: true,
    unit: {
      id: newId('u'),
      kind: UNIT_KIND_UNDERENHET,
      name: navn,
      organisasjonsnummer: orgnr,
      companyId: text(companyId),
      note: text(note),
      createdAt: at || new Date().toISOString(),
    },
  };
}

export function addSubUnit(list, unit) {
  const current = normalizeSubUnits(list);
  const next = normalizeSubUnit(unit);
  if (!next) return { ok: false, error: 'Enheten mangler navn.' };
  if (next.kind === UNIT_KIND_UNDERENHET
    && current.some((row) => row.organisasjonsnummer === next.organisasjonsnummer)) {
    return { ok: false, error: 'Denne underenheten er allerede registrert.' };
  }
  if (next.kind === UNIT_KIND_AVDELING
    && current.some((row) => row.kind === UNIT_KIND_AVDELING
      && row.name.toLowerCase() === next.name.toLowerCase())) {
    return { ok: false, error: 'Avdelingen er allerede registrert.' };
  }
  return { ok: true, list: [...current, next] };
}

export function removeSubUnit(list, id) {
  return normalizeSubUnits(list).filter((row) => row.id !== id);
}

export function underenheterOf(list) {
  return normalizeSubUnits(list).filter((row) => row.kind === UNIT_KIND_UNDERENHET);
}

export function departmentsOf(list) {
  return normalizeSubUnits(list).filter((row) => row.kind === UNIT_KIND_AVDELING);
}

export function linkedCompanyFields({ parentId, parentName, company }) {
  return {
    company,
    orgnr: digitsOrgnr(company?.organisasjonsnummer),
    parentCompanyId: text(parentId),
    parentCompanyName: text(parentName),
    projects: [],
    tenders: [],
    cpvCodes: [],
    cpvSource: '',
  };
}

export function findOwnedOrganization(groups, orgnr) {
  const id = digitsOrgnr(orgnr);
  if (id.length !== 9) return null;
  return (groups || []).find((group) => (
    digitsOrgnr(group?.company?.organisasjonsnummer || group?.orgnr) === id
  )) || null;
}
