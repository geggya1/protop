/**
 * Velg en bedrift fra Brønnøysund: finnes den i ProTop, ber personen om tilgang.
 * Finnes den ikke, opprettes den med personen som administrator.
 * Brukes av «Opprett bedrift» og «Be om innpass».
 */
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../firebase';
import { createGroup, updateGroup } from '../utils/groups';
import { fetchCompanyCpv } from '../anbud/doffinClient';
import { findCompanyByOrgnr } from './companyLookupClient';
import { companyRegistrationDecision, digitsOrgnr } from './companyRegistry';

/** Bedriften i ProTop med samme organisasjonsnummer: { id, name, member, company } eller null. */
export async function existingOrganization(orgnr) {
  const id = digitsOrgnr(orgnr);
  if (id.length !== 9) return null;
  // Andres bedrifter kan ikke leses fra appen. Serveren svarer med id og navn.
  const found = await findCompanyByOrgnr(id);
  if (!found?.id) return null;
  return { id: found.id, name: found.name, member: !!found.member, company: { navn: found.name, organisasjonsnummer: id } };
}

/**
 * Hva skjer med valgt bedrift:
 * { kind: 'member', id, name } | { kind: 'join', companyId, companyName } | { kind: 'create' }.
 */
export async function companyChoice(company) {
  const existing = await existingOrganization(company?.organisasjonsnummer);
  if (existing?.member) return { kind: 'member', id: existing.id, name: existing.name };
  return companyRegistrationDecision(existing);
}

/** Opprett bedriften. Returnerer id og feltene som ble lagret. */
export async function registerCompany(nextCompany, { profile } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Du må være innlogget.');
  const id = await createGroup({
    name: nextCompany.navn,
    type: 'organization',
    language: 'nb',
    user,
    profile,
  });
  const patch = {
    company: nextCompany,
    orgnr: digitsOrgnr(nextCompany.organisasjonsnummer),
    projects: [],
    tenders: [],
    cpvCodes: [],
    cpvSource: '',
  };
  if (patch.orgnr) {
    try {
      const data = await fetchCompanyCpv(patch.orgnr);
      patch.cpvCodes = data.cpvCodes || [];
      patch.cpvSource = patch.cpvCodes.length ? 'doffin' : '';
      if (data.company?.name) patch.company = { ...nextCompany, navn: data.company.name };
    } catch {
      patch.cpvSource = '';
    }
  }
  await updateGroup(id, patch);
  return { id, patch };
}

/** Be om å bli med. Administratorene får varsel og kan invitere personen. */
export async function requestCompanyAccess({ companyId, companyName, name }) {
  const res = await httpsCallable(functions, 'requestCompanyJoin')({ companyId, name });
  if (!res?.data?.ok) {
    throw new Error(res?.data?.error === 'already-member'
      ? 'Du er allerede med i bedriften.'
      : 'Fant ikke bedriften.');
  }
  return { createdAt: res.data.createdAt, companyName: res.data.companyName || companyName };
}
