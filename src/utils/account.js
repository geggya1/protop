import { isValidUsername, suggestUsername, usernameTaken } from './usernames';
import {
  isSyntheticEmail,
  isValidEmail,
  hasContactInfo,
  hasContactAccount,
  passwordStrength,
} from './accountContact';

export {
  isSyntheticEmail,
  isValidEmail,
  hasContactInfo,
  hasContactAccount,
  passwordStrength,
};

export async function uniqueUsername(base, exceptUid) {
  let uname = isValidUsername(base) ? String(base).trim().toLowerCase() : suggestUsername(base || 'user');
  for (let i = 0; i < 8; i += 1) {
    const busy = await usernameTaken(uname, exceptUid);
    if (!busy) return uname;
    uname = suggestUsername(base || 'user');
  }
  return `${suggestUsername(base || 'user')}${Date.now().toString().slice(-3)}`;
}
