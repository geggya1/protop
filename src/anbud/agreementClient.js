import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

function call() {
  return httpsCallable(functions, 'agreementTreatment', { timeout: 20000 });
}

export async function publishAgreementShare({ companyId, caseId }) {
  const result = await call()({ action: 'publishShare', companyId, caseId });
  return result.data || { ok: false, error: 'Kunne ikke dele avtalen.' };
}

export async function notifyAgreementParty(input) {
  const result = await call()({ action: 'notify', ...input });
  return result.data || { ok: false };
}

export async function loadAgreementShare(token) {
  const result = await call()({ action: 'load', token });
  return result.data || { ok: false, error: 'Kunne ikke åpne avtalen.' };
}

export async function actOnAgreementShare(input) {
  const result = await call()({ action: 'act', ...input });
  return result.data || { ok: false, error: 'Kunne ikke oppdatere avtalen.' };
}
