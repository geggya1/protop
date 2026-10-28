import { DEFAULT_MAIL_SIGNATURE, MAIL_FONTS, buildSignatureHtml } from './mailSignature.js';

const KEY = 'protop.mail.compose.v1';

export const MAIL_PREF_FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18];

export const DEFAULT_MAIL_COMPOSE_PREFS = {
  showBcc: false,
  compactList: false,
  fontFamily: MAIL_FONTS[0].value,
  fontSize: 11,
  readReceipt: false,
  signature: { ...DEFAULT_MAIL_SIGNATURE },
  /** Signaturer som HTML (kan limes inn fra Outlook). */
  signatures: [],
  /** Signatur for nye meldinger og for svar/videresending ('' = ingen). */
  signatureNew: '',
  signatureReply: '',
  /** Merk som lest når meldingen åpnes. */
  markReadOnOpen: true,
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
    if (typeof localStorage === 'undefined') return true;
    localStorage.setItem(KEY, value);
    return true;
  } catch {
    return false;
  }
}

function normalizeSignatures(list) {
  return (Array.isArray(list) ? list : [])
    .filter((s) => s && typeof s === 'object')
    .map((s, i) => ({
      id: String(s.id || `sig-${i + 1}`),
      name: String(s.name || `Signatur ${i + 1}`).slice(0, 60),
      html: String(s.html || ''),
    }))
    .slice(0, 12);
}

/** Gammel signatur (felter) blir én HTML-signatur første gang. */
function migrateLegacy(src, legacy) {
  if (Array.isArray(src.signatures)) return null;
  const html = buildSignatureHtml(legacy, { preview: true });
  if (!html) return { signatures: [], signatureNew: '', signatureReply: '' };
  const enabled = legacy.enabled !== false;
  return {
    signatures: [{ id: 'standard', name: 'Standard', html: html.replace(/\sdata-wp-signature="1"/g, '') }],
    signatureNew: enabled && legacy.includeOnNew !== false ? 'standard' : '',
    signatureReply: enabled && legacy.includeOnReply !== false ? 'standard' : '',
  };
}

export function normalizeMailComposePrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const font = MAIL_FONTS.some((f) => f.value === src.fontFamily)
    ? src.fontFamily
    : DEFAULT_MAIL_COMPOSE_PREFS.fontFamily;
  const size = Number(src.fontSize);
  const signature = { ...DEFAULT_MAIL_SIGNATURE, ...(src.signature || {}) };
  const migrated = migrateLegacy(src, signature);
  const signatures = normalizeSignatures(migrated ? migrated.signatures : src.signatures);
  const ids = new Set(signatures.map((s) => s.id));
  const pick = (id) => (ids.has(String(id || '')) ? String(id) : '');
  return {
    showBcc: src.showBcc === true,
    compactList: src.compactList === true,
    fontFamily: font,
    fontSize: MAIL_PREF_FONT_SIZES.includes(size) ? size : 11,
    readReceipt: src.readReceipt === true,
    signature,
    signatures,
    signatureNew: pick(migrated ? migrated.signatureNew : src.signatureNew),
    signatureReply: pick(migrated ? migrated.signatureReply : src.signatureReply),
    markReadOnOpen: src.markReadOnOpen !== false,
  };
}

export function loadMailComposePrefs() {
  try {
    const raw = readRaw();
    if (!raw) return normalizeMailComposePrefs({});
    return normalizeMailComposePrefs(JSON.parse(raw));
  } catch {
    return normalizeMailComposePrefs({});
  }
}

export function saveMailComposePrefs(next) {
  const prefs = normalizeMailComposePrefs(next);
  const ok = writeRaw(JSON.stringify(prefs));
  return ok ? prefs : { ...prefs, saveFailed: true };
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

/** Signaturen som skal inn i en ny melding av denne typen. */
export function signatureFor(prefs, mode) {
  const id = mode === 'new' ? prefs?.signatureNew : prefs?.signatureReply;
  return (prefs?.signatures || []).find((s) => s.id === id) || null;
}
