import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { INVITE_TOKEN_KEY } from './invite.js';

function callableError(error, fallback) {
  const message = String(error?.message || '').replace(/^FirebaseError:\s*/i, '');
  const cleaned = message.replace(/^INTERNAL:\s*/i, '').trim();
  return cleaned || fallback;
}

export function rememberEmployeeInviteToken(token) {
  const value = String(token || '').trim();
  if (typeof localStorage === 'undefined') return;
  if (!value) localStorage.removeItem(INVITE_TOKEN_KEY);
  else localStorage.setItem(INVITE_TOKEN_KEY, value);
}

export function readEmployeeInviteToken() {
  let fromUrl = '';
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      fromUrl = new URLSearchParams(window.location.search).get('employeeInvite') || '';
    } catch {
      fromUrl = '';
    }
  }
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(INVITE_TOKEN_KEY) || '' : '';
  const token = String(fromUrl || stored).trim();
  if (token) rememberEmployeeInviteToken(token);
  return token;
}

export async function sendEmployeeInvites({ companyId, employeeIds }) {
  const call = httpsCallable(functions, 'sendEmployeeInvites', { timeout: 60000 });
  try {
    const result = await call({ companyId, employeeIds });
    return result.data || { ok: false, error: 'Kunne ikke sende invitasjonene.' };
  } catch (error) {
    return { ok: false, error: callableError(error, 'Kunne ikke sende invitasjonene.') };
  }
}

export async function claimStoredEmployeeInvite() {
  const token = readEmployeeInviteToken();
  if (!token) return { ok: true, skipped: true };
  const call = httpsCallable(functions, 'claimEmployeeInvite', { timeout: 20000 });
  try {
    const result = await call({ token });
    const data = result.data || { ok: false, error: 'Kunne ikke åpne invitasjonen.' };
    if (data.ok || /finnes ikke|allerede brukt|utløpt|samsvarer ikke/i.test(data.error || '')) {
      rememberEmployeeInviteToken('');
    }
    return data;
  } catch (error) {
    const message = callableError(error, 'Kunne ikke åpne invitasjonen.');
    if (/finnes ikke|allerede brukt|utløpt|samsvarer ikke/i.test(message)) {
      rememberEmployeeInviteToken('');
    }
    return { ok: false, error: message };
  }
}
