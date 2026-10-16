/** Contact and password checks that do not touch Firebase. */

import { hasValidPhone } from './phone.js';

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

/** Same bar as RegisterScreen: 8+, upper, lower, digit. Symbol is optional. */
export function passwordStrength(password) {
  const value = String(password || '');
  const lenOK = value.length >= 8;
  const hasUpper = /[A-ZÆØÅ]/.test(value);
  const hasLower = /[a-zæøå]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9ÆØÅæøå]/.test(value);
  return {
    lenOK,
    hasUpper,
    hasLower,
    hasDigit,
    hasSymbol,
    strong: lenOK && hasUpper && hasLower && hasDigit,
  };
}
