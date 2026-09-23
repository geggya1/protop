import { isValidUsername, suggestUsername, usernameTaken } from './usernames';
import { hasValidPhone } from './phone';

const SYNTHETIC = /@weekplan\.app$/i;

export function isSyntheticEmail(email) {
  return SYNTHETIC.test(String(email || ''));
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || '').trim());
}

export function hasContactInfo(email, phone) {
  return isValidEmail(email) || hasValidPhone(phone);
}

export function hasContactAccount(user, extra = {}) {
  const email = extra.email || user?.email || '';
  const phone = extra.phone || user?.phoneNumber || '';
  const realEmail = isValidEmail(email) && !isSyntheticEmail(email);
  const realPhone = hasValidPhone(phone);
  return realEmail || realPhone;
}

export async function uniqueUsername(base, exceptUid) {
  let uname = isValidUsername(base) ? String(base).trim().toLowerCase() : suggestUsername(base || 'user');
  for (let i = 0; i < 8; i += 1) {
    const busy = await usernameTaken(uname, exceptUid);
    if (!busy) return uname;
    uname = suggestUsername(base || 'user');
  }
  return `${suggestUsername(base || 'user')}${Date.now().toString().slice(-3)}`;
}
