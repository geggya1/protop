import { DEFAULT_MAIL_SIGNATURE, MAIL_FONTS } from './mailSignature.js';

const KEY = 'weekplan.mail.compose.v1';

export const DEFAULT_MAIL_COMPOSE_PREFS = {
  showBcc: false,
  compactList: false,
  fontFamily: MAIL_FONTS[0].value,
  fontSize: 11,
  readReceipt: false,
  signature: { ...DEFAULT_MAIL_SIGNATURE },
};

function readRaw() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeRaw(value) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, value);
  } catch { /* ignore */ }
}

export function normalizeMailComposePrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const font = MAIL_FONTS.some((f) => f.value === src.fontFamily)
    ? src.fontFamily
    : DEFAULT_MAIL_COMPOSE_PREFS.fontFamily;
  const size = Number(src.fontSize);
  return {
    showBcc: src.showBcc === true,
    compactList: src.compactList === true,
    fontFamily: font,
    fontSize: [10, 11, 12, 14, 16, 18].includes(size) ? size : 11,
    readReceipt: src.readReceipt === true,
    signature: { ...DEFAULT_MAIL_SIGNATURE, ...(src.signature || {}) },
  };
}

export function loadMailComposePrefs() {
  try {
    const raw = readRaw();
    if (!raw) return { ...DEFAULT_MAIL_COMPOSE_PREFS, signature: { ...DEFAULT_MAIL_SIGNATURE } };
    return normalizeMailComposePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MAIL_COMPOSE_PREFS, signature: { ...DEFAULT_MAIL_SIGNATURE } };
  }
}

export function saveMailComposePrefs(next) {
  const prefs = normalizeMailComposePrefs(next);
  writeRaw(JSON.stringify(prefs));
  return prefs;
}

export function patchMailComposePrefs(patch) {
  const current = loadMailComposePrefs();
  const next = normalizeMailComposePrefs({
    ...current,
    ...patch,
    signature: { ...current.signature, ...(patch?.signature || {}) },
  });
  return saveMailComposePrefs(next);
}
