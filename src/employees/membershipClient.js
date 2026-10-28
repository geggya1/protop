/**
 * Kall til serveren for ansettelse og medlemskap (functions/companyMembership.js).
 * Avslutning, papirkurv, permanent sletting og reaktivering må gå her: bare serveren
 * kan fjerne personen fra bedriften og stenge tilgangen i reglene.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

function callableMessage(error, fallback) {
  const message = String(error?.message || '').replace(/^FirebaseError:\s*/i, '');
  const cleaned = message.replace(/^(INTERNAL|PERMISSION_DENIED|FAILED_PRECONDITION|NOT_FOUND|INVALID_ARGUMENT):\s*/i, '').trim();
  if (!cleaned || /^internal$/i.test(cleaned)) return fallback;
  return cleaned;
}

async function run(name, data, fallback) {
  const call = httpsCallable(functions, name, { timeout: 30000 });
  try {
    const result = await call(data);
    return result.data || { ok: true };
  } catch (error) {
    throw new Error(callableMessage(error, fallback));
  }
}

/** Sett status (og ev. sluttdato) eller slett permanent. Medlemskapet følger på serveren. */
export function setEmploymentStatus({
  companyId, employeeId, employeeCompanyId = '', status = '', periodTo, purge = false,
}) {
  const data = { companyId, employeeId, status, purge };
  if (employeeCompanyId && employeeCompanyId !== companyId) data.employeeCompanyId = employeeCompanyId;
  if (periodTo !== undefined) data.periodTo = periodTo || '';
  return run('setEmploymentStatus', data, 'Kunne ikke endre ansettelsen. Prøv igjen.');
}

/** Trekk tilbake en sendt bedriftsinvitasjon. */
export function withdrawEmployeeInvite({ companyId, employeeId }) {
  return run('withdrawEmployeeInvite', { companyId, employeeId }, 'Kunne ikke trekke tilbake invitasjonen.');
}

/** Forlat bedriften selv. */
export function leaveCompany(companyId) {
  return run('leaveCompany', { companyId }, 'Kunne ikke forlate bedriften. Prøv igjen.');
}
