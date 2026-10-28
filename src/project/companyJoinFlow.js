/**
 * Velg en bedrift fra Brønnøysund: finnes den i ProTop, ber personen om tilgang.
 * Finnes den ikke, opprettes den med personen som administrator.
 * Brukes av «Opprett bedrift» og «Be om innpass».
 */
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../firebase';
import { createGroup } from '../utils/groups';
import { fetchCompanyCpv } from '../anbud/doffinClient';
import { claimCompanyOrgnr, findCompanyByOrgnr } from './companyLookupClient';
import { companyRegistrationDecision, digitsOrgnr, newCompanyFields } from './companyRegistry';

/** Doffin får litt tid. Svarer den ikke, opprettes bedriften uten CPV-koder. */
const CPV_LOOKUP_MS = 20000;

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

/**
 * Opprett bedriften. Orgnr, selskapsdata og CPV skrives i samme batch som selskapet,
 * så et avbrudd ikke gir en bedrift uten orgnr (og et duplikat senere).
 * Returnerer id og feltene som ble lagret.
 */
export async function registerCompany(nextCompany, { profile } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Du må være innlogget.');
  const orgnr = digitsOrgnr(nextCompany?.organisasjonsnummer);
  let cpvData = null;
  if (orgnr) {
    let timer = null;
    try {
      cpvData = await Promise.race([
        fetchCompanyCpv(orgnr),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), CPV_LOOKUP_MS); }),
      ]);
    } catch {
      cpvData = null;
    } finally {
      clearTimeout(timer);
    }
  }
  const patch = newCompanyFields(nextCompany, cpvData);
  const id = await createGroup({
    name: nextCompany.navn,
    type: 'organization',
    language: 'nb',
    user,
    profile,
    fields: patch,
  });
  // Serveren knytter orgnummeret til bedriften, så oppslaget alltid finner den samme.
  // Venter ikke: bedriften er opprettet, og oppslaget avgjør eierskapet også uten dette kallet.
  if (patch.orgnr) {
    claimCompanyOrgnr(id).then((res) => {
      if (res?.taken) console.warn('[registerCompany] orgnummeret er allerede knyttet til', res.taken.name);
    }).catch(() => {});
  }
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
