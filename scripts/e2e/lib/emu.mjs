/**
 * Hjelpere mot de lokale emulatorene (Auth, Firestore, Functions) for flyt-boten.
 * Alle kall går bare til 127.0.0.1 — aldri mot protop-c189c i skyen.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toValue } from '../../help-bot/seed.mjs';

export const PROJECT_ID = 'protop-c189c';
export const AUTH = '127.0.0.1:9099';
export const FS = '127.0.0.1:8085';
export const FN = '127.0.0.1:5001';
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MAIL_LOG = join(ROOT, 'e2e-out', 'mail.jsonl');

const DOCS = `http://${FS}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner' };

/** Firestore REST Value → JS. */
export function fromValue(v) {
  if (!v || typeof v !== 'object') return v;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return v;
}

export function fromFields(fields = {}) {
  const out = {};
  for (const [k, val] of Object.entries(fields)) out[k] = fromValue(val);
  return out;
}

/** Tømmer Auth og Firestore i emulatoren. */
export async function resetEmulators() {
  await fetch(`http://${FS}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
}

export async function getDoc(path) {
  const res = await fetch(`${DOCS}/${path}`, { headers: OWNER });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getDoc ${path}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return fromFields(json.fields || {});
}

export async function putDoc(path, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = toValue(v);
  const res = await fetch(`${DOCS}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...OWNER },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`putDoc ${path}: ${res.status} ${await res.text()}`);
}

export async function listDocs(collectionPath) {
  const out = [];
  let token = '';
  do {
    const url = `${DOCS}/${collectionPath}?pageSize=300${token ? `&pageToken=${token}` : ''}`;
    const res = await fetch(url, { headers: OWNER });
    if (!res.ok) return out;
    const json = await res.json();
    for (const d of json.documents || []) {
      out.push({ id: d.name.split('/').pop(), path: d.name.split('/documents/')[1], ...fromFields(d.fields || {}) });
    }
    token = json.nextPageToken || '';
  } while (token);
  return out;
}

async function authCall(endpoint, body, { owner = false } = {}) {
  const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/${endpoint}?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(owner ? OWNER : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

/** Oppretter (eller gjenbruker) en Auth-bruker. Returnerer uid. */
export async function createAuthUser({ email, password, name, verified = true }) {
  const signIn = await authCall('accounts:signInWithPassword', { email, password, returnSecureToken: true });
  let uid = signIn.ok ? signIn.json.localId : null;
  if (!uid) {
    const created = await authCall('accounts:signUp', { email, password, displayName: name, returnSecureToken: true });
    if (!created.ok) throw new Error(`signUp ${email}: ${JSON.stringify(created.json)}`);
    uid = created.json.localId;
  }
  if (verified) {
    await authCall(`projects/${PROJECT_ID}/accounts:update`, { localId: uid, emailVerified: true, displayName: name }, { owner: true });
  }
  return uid;
}

export async function idToken(email, password) {
  const r = await authCall('accounts:signInWithPassword', { email, password, returnSecureToken: true });
  if (!r.ok) throw new Error(`signIn ${email}: ${JSON.stringify(r.json)}`);
  return r.json.idToken;
}

export async function authUserByEmail(email) {
  const r = await authCall(`projects/${PROJECT_ID}/accounts:lookup`, { email: [email] }, { owner: true });
  return r.json?.users?.[0] || null;
}

/** Kaller en callable som en innlogget bruker. */
export async function callFn(name, data, token) {
  const res = await fetch(`http://${FN}/${PROJECT_ID}/europe-west1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

/** Alle e-poster fanget av mailcatcher.js. */
export function readMails() {
  if (!existsSync(MAIL_LOG)) return [];
  return readFileSync(MAIL_LOG, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean).map((m) => {
    const b = m.body || {};
    const to = (b.to || []).map((t) => (typeof t === 'string' ? t : t.email)).concat(
      (b.personalizations || []).flatMap((p) => (p.to || []).map((t) => t.email)),
    ).concat(b.recipient ? [b.recipient] : []);
    const html = b.htmlContent || b.html || (b.content || []).map((c) => c.value).join('\n') || '';
    const text = b.textContent || b.text || '';
    return { at: m.at, url: m.url, to: to.map((t) => String(t).toLowerCase()), subject: b.subject || '', html, text, raw: b };
  });
}

export function mailsTo(email) {
  const e = String(email).toLowerCase();
  return readMails().filter((m) => m.to.includes(e));
}

export function linksIn(mail) {
  const blob = `${mail?.html || ''}\n${mail?.text || ''}`;
  return [...new Set([...blob.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0].replace(/&amp;/g, '&')))];
}

export async function waitFor(fn, { timeout = 20000, every = 500, label = 'betingelse' } = {}) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`Tidsavbrudd: ${label}`);
}
