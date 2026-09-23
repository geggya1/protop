/** Must match functions/deleteAccountLogic.js — language-independent on purpose. */
export const DELETE_ACCOUNT_CONFIRM = 'DELETE';

export function isDeleteAccountConfirmed(value) {
  return String(value || '').trim().toUpperCase() === DELETE_ACCOUNT_CONFIRM;
}
