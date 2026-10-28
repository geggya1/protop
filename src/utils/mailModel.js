/**
 * Rene hjelpere for e-post: mapping fra Microsoft Graph, mottakere, emner,
 * sitat i svar, innebygde bilder, kategorier, flagg og følsomhet.
 * Ingen nettverk og ingen React, så alt kan testes med node.
 */
import { escapeHtml } from './mailHtml.js';

/* ───────── Mapper ───────── */

export const WELL_KNOWN_FOLDERS = ['inbox', 'drafts', 'sentitems', 'deleteditems', 'junkemail', 'archive', 'outbox'];

export const FOLDER_LABELS = {
  inbox: 'Innboks',
  sentitems: 'Sendte elementer',
  drafts: 'Kladd',
  deleteditems: 'Slettede elementer',
  junkemail: 'Søppelpost',
  archive: 'Arkiv',
  outbox: 'Utboks',
};

const DISPLAY_TO_WELL = {
  inbox: 'inbox',
  innboks: 'inbox',
  'sent items': 'sentitems',
  sentitems: 'sentitems',
  'sendte elementer': 'sentitems',
  drafts: 'drafts',
  kladd: 'drafts',
  utkast: 'drafts',
  'deleted items': 'deleteditems',
  'slettede elementer': 'deleteditems',
  'junk email': 'junkemail',
  'junk e-mail': 'junkemail',
  søppelpost: 'junkemail',
  archive: 'archive',
  arkiv: 'archive',
  outbox: 'outbox',
  utboks: 'outbox',
};

/** v1.0 mailFolder mangler wellKnownName på mange leietakere, så den velges ikke. */
export const FOLDER_SELECT = 'id,displayName,parentFolderId,unreadItemCount,totalItemCount,childFolderCount';

export function inferWellKnownName(raw, idToWell = new Map()) {
  if (raw?.id && idToWell.has(raw.id)) return idToWell.get(raw.id);
  const fromApi = String(raw?.wellKnownName || '').toLowerCase();
  if (fromApi) return fromApi;
  const name = String(raw?.displayName || '').trim().toLowerCase();
  return DISPLAY_TO_WELL[name] || null;
}

export function mapGraphFolder(raw, depth = 0, idToWell = new Map()) {
  const well = inferWellKnownName(raw, idToWell);
  return {
    id: raw.id,
    name: FOLDER_LABELS[well] || raw.displayName || 'Mappe',
    wellKnownName: well || null,
    parentFolderId: raw.parentFolderId || null,
    unread: Number(raw.unreadItemCount || 0),
    total: Number(raw.totalItemCount || 0),
    childFolderCount: Number(raw.childFolderCount || 0),
    depth,
  };
}

/**
 * Flater ut en side med mapper inkludert utvidede childFolders.
 * `pending` er mapper som har barn som ikke kom med i svaret.
 */
export function collectGraphFolders(rawList, idToWell = new Map(), depth = 0, maxDepth = 6) {
  const folders = [];
  const pending = [];
  const walk = (raw, d) => {
    if (!raw?.id) return;
    const folder = mapGraphFolder(raw, d, idToWell);
    folders.push(folder);
    const kids = Array.isArray(raw.childFolders) ? raw.childFolders : [];
    if (kids.length) {
      kids.forEach((kid) => walk(kid, d + 1));
      if (kids.length >= folder.childFolderCount) return;
    }
    if (folder.childFolderCount > 0 && d < maxDepth && !kids.length) pending.push(folder);
  };
  (rawList || []).forEach((raw) => walk(raw, depth));
  return { folders, pending };
}

export function folderByWell(folders, well) {
  return (folders || []).find((f) => f.wellKnownName === well) || null;
}

/* ───────── Adresser ───────── */

export function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

export function isValidAddress(value) {
  return EMAIL_RE.test(String(value || '').trim());
}

export function addressOf(raw) {
  const e = raw?.emailAddress || raw || {};
  return { name: String(e.name || '').trim(), address: String(e.address || '').trim() };
}

export function recipientsOf(list) {
  return (list || []).map(addressOf).filter((r) => r.address);
}

export function toGraphRecipients(list) {
  return (list || [])
    .filter((r) => isValidAddress(r?.address))
    .map((r) => ({
      emailAddress: {
        address: r.address.trim(),
        ...(r.name && normalizeAddress(r.name) !== normalizeAddress(r.address) ? { name: r.name } : {}),
      },
    }));
}

export function formatRecipient(r) {
  if (!r?.address) return '';
  if (r.name && normalizeAddress(r.name) !== normalizeAddress(r.address)) return `${r.name} <${r.address}>`;
  return r.address;
}

export function recipientLabel(r) {
  return r?.name || r?.address || '';
}

/** Fjerner duplikater og adressene i `exclude`. */
export function uniqueRecipients(list, exclude = []) {
  const skip = new Set((exclude || []).map(normalizeAddress).filter(Boolean));
  const out = [];
  (list || []).forEach((r) => {
    const key = normalizeAddress(r?.address);
    if (!key || skip.has(key)) return;
    skip.add(key);
    out.push({ name: r.name || '', address: r.address.trim() });
  });
  return out;
}

function splitRecipientText(text) {
  const parts = [];
  let cur = '';
  let quoted = false;
  let angle = false;
  for (const ch of String(text || '')) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === '<') angle = true;
    if (!quoted && ch === '>') angle = false;
    if (!quoted && !angle && (ch === ';' || ch === ',' || ch === '\n')) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** «Ola Nordmann <ola@x.no>; kari@y.no» → [{ name, address }] */
export function parseRecipients(text) {
  return splitRecipientText(text).map((token) => {
    const hit = token.match(/^(.*)<([^>]+)>\s*$/);
    if (hit) {
      return {
        name: hit[1].trim().replace(/^"|"$/g, '').trim(),
        address: hit[2].trim(),
      };
    }
    return { name: '', address: token.replace(/^mailto:/i, '') };
  });
}

/**
 * Mottakere i svar. Svar til alle tar med Til og Kopi, men aldri deg selv.
 * Svar på din egen melding går til de opprinnelige mottakerne, som i Outlook.
 */
export function replyRecipients(message, selfAddress, { all = false } = {}) {
  const self = normalizeAddress(selfAddress);
  const from = message?.from?.address ? [message.from] : [];
  const fromSelf = !!self && normalizeAddress(message?.from?.address) === self;
  const replyTo = (message?.replyTo || []).length ? message.replyTo : from;
  const origTo = message?.to || [];
  const origCc = message?.cc || [];
  if (!all) {
    return { to: uniqueRecipients(fromSelf ? origTo : replyTo, [self]), cc: [] };
  }
  const to = uniqueRecipients(fromSelf ? origTo : [...replyTo, ...origTo], [self]);
  const cc = uniqueRecipients(origCc, [self, ...to.map((r) => r.address)]);
  return { to, cc };
}

/* ───────── Emne ───────── */

const SUBJECT_PREFIX_RE = /^\s*((re|sv|aw|vs|fw|fwd|wg|tr|antw|vb)\s*(\[\d+\])?\s*:\s*)+/i;

export function baseSubject(subject) {
  return String(subject || '').replace(SUBJECT_PREFIX_RE, '').trim();
}

export function replySubject(subject) {
  const base = baseSubject(subject);
  return base ? `SV: ${base}` : 'SV:';
}

export function forwardSubject(subject) {
  const base = baseSubject(subject);
  return base ? `VS: ${base}` : 'VS:';
}

/* ───────── Meldinger ───────── */

export const MESSAGE_LIST_SELECT = [
  'id', 'subject', 'from', 'sender', 'toRecipients', 'ccRecipients', 'receivedDateTime', 'sentDateTime',
  'isRead', 'isDraft', 'hasAttachments', 'bodyPreview', 'importance', 'flag', 'categories',
  'conversationId', 'parentFolderId',
].join(',');

export const MESSAGE_FULL_SELECT = `${MESSAGE_LIST_SELECT},body,bccRecipients,replyTo,isReadReceiptRequested,isDeliveryReceiptRequested,internetMessageId`;

/** MAPI PidTagSensitivity: 0 normal, 1 personlig, 2 privat, 3 konfidensielt. */
export const SENSITIVITY_PROP_ID = 'Integer 0x0036';

export const SENSITIVITY_OPTIONS = [
  { id: 'normal', value: 0, label: 'Normal' },
  { id: 'personal', value: 1, label: 'Personlig' },
  { id: 'private', value: 2, label: 'Privat' },
  { id: 'confidential', value: 3, label: 'Konfidensielt' },
];

export function sensitivityOf(props) {
  const hit = (props || []).find((p) => /^integer\s+0x0*36$/i.test(String(p?.id || '').trim()));
  const n = Number(hit?.value);
  return SENSITIVITY_OPTIONS.find((o) => o.value === n)?.id || 'normal';
}

export function sensitivityProps(id) {
  const opt = SENSITIVITY_OPTIONS.find((o) => o.id === id) || SENSITIVITY_OPTIONS[0];
  return [{ id: SENSITIVITY_PROP_ID, value: String(opt.value) }];
}

export function sensitivityLabel(id) {
  return SENSITIVITY_OPTIONS.find((o) => o.id === id)?.label || 'Normal';
}

export function mapGraphMessage(raw) {
  const flagStatus = String(raw?.flag?.flagStatus || 'notFlagged');
  return {
    id: raw.id,
    subject: raw.subject || '(uten emne)',
    from: addressOf(raw.from || raw.sender),
    to: recipientsOf(raw.toRecipients),
    cc: recipientsOf(raw.ccRecipients),
    receivedAt: raw.receivedDateTime || raw.sentDateTime || null,
    sentAt: raw.sentDateTime || null,
    isRead: raw.isRead === true,
    isDraft: raw.isDraft === true,
    hasAttachments: raw.hasAttachments === true,
    preview: String(raw.bodyPreview || '').replace(/\s+/g, ' ').trim(),
    importance: String(raw.importance || 'normal').toLowerCase(),
    flagStatus,
    flagged: flagStatus === 'flagged',
    flagDue: raw?.flag?.dueDateTime?.dateTime || null,
    categories: Array.isArray(raw.categories) ? raw.categories.filter(Boolean) : [],
    conversationId: raw.conversationId || null,
    parentFolderId: raw.parentFolderId || null,
  };
}

export function mapGraphAttachment(raw) {
  return {
    id: raw.id,
    name: raw.name || 'vedlegg',
    contentType: raw.contentType || 'application/octet-stream',
    size: Number(raw.size || 0),
    isInline: raw.isInline === true,
    kind: String(raw['@odata.type'] || '').replace('#microsoft.graph.', '') || 'fileAttachment',
  };
}

export function mapGraphMessageFull(raw, attachments = []) {
  const base = mapGraphMessage(raw);
  const type = String(raw?.body?.contentType || '').toLowerCase();
  const content = String(raw?.body?.content || '');
  const html = type === 'html'
    ? content
    : `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${escapeHtml(content || raw.bodyPreview || '')}</pre>`;
  return {
    ...base,
    bcc: recipientsOf(raw.bccRecipients),
    replyTo: recipientsOf(raw.replyTo),
    html,
    sensitivity: sensitivityOf(raw.singleValueExtendedProperties),
    readReceipt: raw.isReadReceiptRequested === true,
    deliveryReceipt: raw.isDeliveryReceiptRequested === true,
    internetMessageId: raw.internetMessageId || null,
    attachments: (attachments || []).map(mapGraphAttachment),
    full: true,
  };
}

/** Vedlegg som kan være innebygde bilder i HTML-en (cid:). */
export function inlineCandidates(message) {
  const html = String(message?.html || '');
  if (!/cid:/i.test(html)) return [];
  return (message?.attachments || []).filter((a) => (
    a.kind === 'fileAttachment' && (a.isInline || /^image\//i.test(a.contentType))
  ));
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bytter cid:-referanser med data-URL-er. `known` brukes når et utkast lagres igjen. */
export function replaceCidImages(html, images) {
  let out = String(html || '');
  const known = {};
  const used = new Set();
  (images || []).forEach((img) => {
    const cid = String(img?.contentId || '').replace(/^<|>$/g, '');
    if (!cid || !img.contentBytes) return;
    const dataUrl = `data:${img.contentType || 'image/png'};base64,${img.contentBytes}`;
    const re = new RegExp(`cid:${escapeRegExp(cid)}`, 'gi');
    if (!re.test(out)) return;
    out = out.replace(new RegExp(`cid:${escapeRegExp(cid)}`, 'gi'), dataUrl);
    known[dataUrl] = cid;
    used.add(img.id);
  });
  return { html: out, known, used };
}

/** Synlige vedlegg: alt som ikke er brukt som bilde i teksten. */
export function visibleAttachments(message, usedInline) {
  const used = usedInline instanceof Set ? usedInline : new Set(usedInline || []);
  return (message?.attachments || []).filter((a) => !used.has(a.id) && !(a.isInline && /^image\//i.test(a.contentType)));
}

export function hashString(value) {
  const s = String(value || '');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function extFromMime(mime) {
  const sub = String(mime || '').split('/')[1] || 'png';
  if (/jpe?g/i.test(sub)) return 'jpg';
  if (/svg/i.test(sub)) return 'svg';
  return sub.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'png';
}

/**
 * Bilder som ligger som data-URL i teksten sendes som innebygde vedlegg (cid:).
 * `known` mapper data-URL → eksisterende cid, så et utkast ikke får doble bilder.
 */
export function dataImagesToInline(html, { known = {} } = {}) {
  const attachments = [];
  const seen = new Map();
  let n = 0;
  const out = String(html || '').replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(data:(image\/[a-z0-9.+-]+);base64,([^"']+))\2/gi,
    (all, pre, q, dataUrl, mime, b64) => {
      if (known[dataUrl]) return `${pre}${q}cid:${known[dataUrl]}${q}`;
      let cid = seen.get(dataUrl);
      if (!cid) {
        n += 1;
        cid = `img-${hashString(b64)}@protop`;
        seen.set(dataUrl, cid);
        attachments.push({
          name: `bilde${n}.${extFromMime(mime)}`,
          contentType: mime.toLowerCase(),
          contentBytes: b64.replace(/\s+/g, ''),
          contentId: cid,
          isInline: true,
        });
      }
      return `${pre}${q}cid:${cid}${q}`;
    },
  );
  return { html: out, attachments };
}

export function base64Size(b64) {
  const s = String(b64 || '').replace(/\s+/g, '');
  if (!s) return 0;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - pad;
}

/* ───────── HTML i svar og utkast ───────── */

export const COMPOSE_MARK = 'protop-compose';

/** Setter vår tekst først i <body> i utkastet Graph lager (der sitatet allerede ligger). */
export function injectIntoBody(draftHtml, ourHtml) {
  const src = String(draftHtml || '');
  const ours = `<div id="${COMPOSE_MARK}">${ourHtml || '<div><br></div>'}</div>`;
  const hit = src.match(/<body[^>]*>/i);
  if (!hit) return `${ours}${src}`;
  const at = hit.index + hit[0].length;
  return `${src.slice(0, at)}${ours}${src.slice(at)}`;
}

export function extractBodyInner(html) {
  const src = String(html || '');
  const hit = src.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return hit ? hit[1] : src;
}

/** Fjerner stilark og Office-rester så innlimt HTML ikke påvirker resten av siden. */
export function stripForeignStyles(html) {
  return String(html || '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<xml[\s\S]*?<\/xml>/gi, '')
    .replace(/<(meta|link|base|title)\b[^>]*>/gi, '')
    .replace(/<\/?(html|body|o:p|w:[a-z]+|v:[a-z]+)\b[^>]*>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

const DAYS_SHORT = ['søn.', 'man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.'];
const DAYS_LONG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function validDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «tir. 27.10.2026 22:58», som lesefeltet i Outlook. */
export function formatMailDateLong(iso) {
  const d = validDate(iso);
  if (!d) return '';
  return `${DAYS_SHORT[d.getDay()]} ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** «tirsdag 27. oktober 2026 22:58» i sitathodet. */
export function formatQuoteDate(iso) {
  const d = validDate(iso);
  if (!d) return '';
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDueDate(value) {
  const d = validDate(value && !/Z$|[+-]\d\d:\d\d$/.test(value) ? `${value}Z` : value);
  if (!d) return '';
  return `${DAYS_SHORT[d.getUTCDay()]} ${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

function recipientsLine(list) {
  return (list || []).map((r) => escapeHtml(formatRecipient(r))).join('; ');
}

/** Hodet over den opprinnelige meldingen, slik Outlook skriver det. */
export function quoteHeaderHtml(message) {
  const rows = [
    ['Fra', escapeHtml(formatRecipient(message?.from))],
    ['Sendt', escapeHtml(formatQuoteDate(message?.receivedAt || message?.sentAt))],
    ['Til', recipientsLine(message?.to)],
    ['Kopi', recipientsLine(message?.cc)],
    ['Emne', escapeHtml(message?.subject || '')],
  ].filter(([, v]) => v);
  return `<div style="font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#1a2744"><hr style="border:0;border-top:1px solid #d0d7e2;margin:12px 0">${rows.map(([k, v]) => `<b>${k}:</b> ${v}`).join('<br>')}</div>`;
}

/* ───────── Liste, grupper og filtre ───────── */

export const MAIL_FILTERS = [
  { id: 'all', label: 'Alle' },
  { id: 'unread', label: 'Ulest' },
  { id: 'flagged', label: 'Flagget' },
  { id: 'attachments', label: 'Med vedlegg' },
  { id: 'important', label: 'Høy viktighet' },
];

export function normalizeMailFilter(value) {
  return MAIL_FILTERS.some((f) => f.id === value) ? value : 'all';
}

/**
 * $filter for meldingslisten. Graph krever at feltet i $orderby står først i
 * $filter, så receivedDateTime legges alltid først når det filtreres.
 */
export function graphListFilter(filter, since = '') {
  const parts = [];
  if (filter === 'unread') parts.push('isRead eq false');
  else if (filter === 'flagged') parts.push("flag/flagStatus eq 'flagged'");
  else if (filter === 'attachments') parts.push('hasAttachments eq true');
  else if (filter === 'important') parts.push("importance eq 'high'");
  if (since) parts.unshift(`receivedDateTime ge ${since}`);
  else if (parts.length) parts.unshift('receivedDateTime ge 1900-01-01T00:00:00Z');
  return parts.join(' and ');
}

export function matchesMailFilter(m, filter) {
  if (!m) return false;
  if (filter === 'unread') return !m.isRead;
  if (filter === 'flagged') return !!m.flagged;
  if (filter === 'attachments') return !!m.hasAttachments;
  if (filter === 'important') return m.importance === 'high';
  return true;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Grupper som i Outlook: I dag, I går, Tidligere denne uken, Forrige uke … */
export function mailSectionLabel(iso, now = new Date()) {
  const d = validDate(iso);
  if (!d) return 'Eldre';
  const t = d.getTime();
  const today = startOfDay(now);
  const yesterday = today - 86400000;
  const weekday = (now.getDay() + 6) % 7;
  const weekStart = today - weekday * 86400000;
  const lastWeekStart = weekStart - 7 * 86400000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  if (t >= today) return 'I dag';
  if (t >= yesterday) return 'I går';
  if (t >= weekStart) return 'Tidligere denne uken';
  if (t >= lastWeekStart) return 'Forrige uke';
  if (t >= monthStart) return 'Tidligere denne måneden';
  if (t >= lastMonthStart) return 'Forrige måned';
  return 'Eldre';
}

export function groupMailRows(list, now = new Date()) {
  const out = [];
  let last = '';
  (list || []).forEach((m) => {
    const label = mailSectionLabel(m.receivedAt, now);
    if (label !== last) {
      out.push({ type: 'head', id: `h-${label}`, label });
      last = label;
    }
    out.push({ type: 'msg', id: m.id, message: m });
  });
  return out;
}

/* ───────── Kategorier ───────── */

export const CATEGORY_PRESETS = {
  preset0: '#e3424a', preset1: '#f2853d', preset2: '#a87850', preset3: '#e8b500', preset4: '#3fa45b',
  preset5: '#20a39e', preset6: '#8a9a2b', preset7: '#2f80ed', preset8: '#8e6ac8', preset9: '#c2185b',
  preset10: '#90a4ae', preset11: '#546e7a', preset12: '#9e9e9e', preset13: '#616161', preset14: '#212121',
  preset15: '#b71c1c', preset16: '#e65100', preset17: '#5d4037', preset18: '#c79100', preset19: '#1b5e20',
  preset20: '#00695c', preset21: '#827717', preset22: '#1a237e', preset23: '#4a148c', preset24: '#880e4f',
};

/** Standardkategoriene i norsk Outlook. */
export const DEFAULT_CATEGORIES = [
  { name: 'Rød kategori', color: 'preset0' },
  { name: 'Oransje kategori', color: 'preset1' },
  { name: 'Gul kategori', color: 'preset3' },
  { name: 'Grønn kategori', color: 'preset4' },
  { name: 'Blå kategori', color: 'preset7' },
  { name: 'Lilla kategori', color: 'preset8' },
];

const EN_DEFAULTS = {
  'red category': 'preset0',
  'orange category': 'preset1',
  'yellow category': 'preset3',
  'green category': 'preset4',
  'blue category': 'preset7',
  'purple category': 'preset8',
};

export function categoryColor(name, master = []) {
  const key = String(name || '').trim().toLowerCase();
  const hit = (master || []).find((c) => String(c?.name || c?.displayName || '').toLowerCase() === key);
  const preset = hit?.color
    || DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === key)?.color
    || EN_DEFAULTS[key];
  if (preset && CATEGORY_PRESETS[preset]) return CATEGORY_PRESETS[preset];
  const n = parseInt(hashString(key), 36) % 10;
  return CATEGORY_PRESETS[`preset${n}`];
}

/** Kategoriliste: postboksens egne først, så standard og de som finnes på meldinger. */
export function categoryChoices(master, messages = []) {
  const out = [];
  const seen = new Set();
  const add = (name, color) => {
    const key = String(name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name: String(name).trim(), color: categoryColor(name, master) || color });
  };
  (master || []).forEach((c) => add(c.name || c.displayName));
  if (!(master || []).length) DEFAULT_CATEGORIES.forEach((c) => add(c.name));
  (messages || []).forEach((m) => (m?.categories || []).forEach((c) => add(c)));
  return out;
}

export function toggleCategory(list, name) {
  const cur = Array.isArray(list) ? list : [];
  const key = String(name || '').toLowerCase();
  return cur.some((c) => c.toLowerCase() === key)
    ? cur.filter((c) => c.toLowerCase() !== key)
    : [...cur, name];
}

/* ───────── Flagg ───────── */

export const FLAG_OPTIONS = [
  { id: 'today', label: 'I dag' },
  { id: 'tomorrow', label: 'I morgen' },
  { id: 'thisWeek', label: 'Denne uken' },
  { id: 'nextWeek', label: 'Neste uke' },
  { id: 'noDate', label: 'Ingen dato' },
  { id: 'complete', label: 'Merk som fullført' },
  { id: 'clear', label: 'Fjern flagg' },
];

function dateOnly(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T00:00:00`;
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** PATCH-kropp for flagg. Datoer sendes som datoer (UTC midnatt), slik Outlook viser dem. */
export function flagPatch(kind, now = new Date()) {
  if (kind === 'clear') return { flag: { flagStatus: 'notFlagged' } };
  if (kind === 'complete') {
    return { flag: { flagStatus: 'complete', completedDateTime: { dateTime: dateOnly(now), timeZone: 'UTC' } } };
  }
  if (kind === 'noDate' || !kind) return { flag: { flagStatus: 'flagged' } };
  const weekday = (now.getDay() + 6) % 7;
  let start = now;
  let due = now;
  if (kind === 'tomorrow') {
    start = addDays(now, 1);
    due = start;
  } else if (kind === 'thisWeek') {
    due = weekday <= 4 ? addDays(now, 4 - weekday) : now;
  } else if (kind === 'nextWeek') {
    start = addDays(now, 7 - weekday);
    due = addDays(start, 4);
  }
  return {
    flag: {
      flagStatus: 'flagged',
      startDateTime: { dateTime: dateOnly(start), timeZone: 'UTC' },
      dueDateTime: { dateTime: dateOnly(due), timeZone: 'UTC' },
    },
  };
}

export function applyFlagLocally(message, patch) {
  const flag = patch?.flag || {};
  const status = flag.flagStatus || 'notFlagged';
  return {
    ...message,
    flagStatus: status,
    flagged: status === 'flagged',
    flagDue: status === 'flagged' ? (flag.dueDateTime?.dateTime || null) : null,
  };
}

/* ───────── Vedlegg ───────── */

export function formatBytes(n) {
  const v = Number(n || 0);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.max(1, Math.round(v / 1024))} kB`;
  return `${(v / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function attachmentIcon(name, contentType) {
  const n = String(name || '').toLowerCase();
  const t = String(contentType || '').toLowerCase();
  if (t.includes('pdf') || n.endsWith('.pdf')) return 'document-text-outline';
  if (t.startsWith('image/')) return 'image-outline';
  if (/\.(xlsx?|csv|ods)$/.test(n) || t.includes('sheet') || t.includes('excel')) return 'grid-outline';
  if (/\.(docx?|odt|rtf)$/.test(n) || t.includes('word')) return 'document-outline';
  if (/\.(pptx?|odp)$/.test(n) || t.includes('presentation')) return 'easel-outline';
  if (/\.(zip|7z|rar)$/.test(n) || t.includes('zip')) return 'archive-outline';
  if (/\.(msg|eml)$/.test(n) || t.includes('message')) return 'mail-outline';
  if (/\.(dwg|dxf|ifc|skp)$/.test(n)) return 'cube-outline';
  return 'attach-outline';
}

/* ───────── Kontakter og avatarer ───────── */

const AVATAR_COLORS = ['#2f80ed', '#3fa45b', '#8e6ac8', '#e3424a', '#20a39e', '#f2853d', '#c2185b', '#546e7a'];

export function avatarColor(address) {
  const key = normalizeAddress(address) || '?';
  return AVATAR_COLORS[parseInt(hashString(key), 36) % AVATAR_COLORS.length];
}

/** Slår sammen kontakter fra meldinger. Hyppige adresser foreslås først. */
export function mergeContacts(existing, recipients, weight = 1) {
  const map = new Map();
  (existing || []).forEach((c) => {
    const key = normalizeAddress(c?.address);
    if (key) map.set(key, { ...c });
  });
  (recipients || []).forEach((r) => {
    const key = normalizeAddress(r?.address);
    if (!key || !isValidAddress(key)) return;
    const prev = map.get(key);
    map.set(key, {
      name: r.name || prev?.name || '',
      address: prev?.address || r.address.trim(),
      count: (prev?.count || 0) + weight,
    });
  });
  return [...map.values()].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 600);
}

export function contactsFromMessages(messages) {
  let out = [];
  (messages || []).forEach((m) => {
    out = mergeContacts(out, [m.from, ...(m.to || []), ...(m.cc || [])].filter(Boolean));
  });
  return out;
}

export function suggestContacts(contacts, query, exclude = [], limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const skip = new Set((exclude || []).map(normalizeAddress));
  const scored = [];
  (contacts || []).forEach((c) => {
    const addr = normalizeAddress(c.address);
    if (!addr || skip.has(addr)) return;
    const name = String(c.name || '').toLowerCase();
    const words = name.split(/\s+/);
    let score = 0;
    if (addr.startsWith(q)) score = 3;
    else if (words.some((w) => w.startsWith(q)) || name.startsWith(q)) score = 3;
    else if (addr.includes(q) || name.includes(q)) score = 1;
    if (score) scored.push({ c, score: score * 1000 + (c.count || 0) });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.c);
}
