import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

function callableError(error, fallback) {
  const message = String(error?.message || '').replace(/^FirebaseError:\s*/i, '');
  const cleaned = message.replace(/^[A-Z_]+:\s*/i, '').trim();
  return cleaned || fallback;
}

async function callPlan(name, companyId) {
  const id = String(companyId || '').trim();
  if (!id) return { ok: false, error: 'Mangler selskap.' };
  const call = httpsCallable(functions, name, { timeout: 120000 });
  try {
    const result = await call({ companyId: id });
    return result.data || { ok: false, error: 'Tomt svar fra ferieplanen.' };
  } catch (error) {
    return { ok: false, error: callableError(error, 'Kunne ikke kontakte ferieplanen.') };
  }
}

export function publishVacationPlanNotice(companyId) {
  return callPlan('publishVacationPlan', companyId);
}

export function sweepVacationPlan(companyId) {
  return callPlan('sweepVacationPlan', companyId);
}
