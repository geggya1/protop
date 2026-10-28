/**
 * «Last ned mine data» (GDPR art. 15 og 20). Ren logikk: tar imot det appen har
 * hentet med brukerens egen lesetilgang og lager én JSON-fil.
 * Bare rader som hører til brukeren tas med. Tilgangsnøkler og hemmeligheter fjernes.
 */

export const EXPORT_FORMAT = 'protop-mine-data';
export const EXPORT_VERSION = 1;

const SECRET_KEY = /token|secret|password|passord|apikey|api_key|icsurl|credential/i;
const MAX_DEPTH = 8;

function isTimestamp(value) {
  return value && typeof value === 'object'
    && (typeof value.toDate === 'function'
      || (Number.isFinite(value.seconds) && Number.isFinite(value.nanoseconds) && Object.keys(value).length <= 3));
}

function timestampIso(value) {
  try {
    const date = typeof value.toDate === 'function'
      ? value.toDate()
      : new Date(value.seconds * 1000 + Math.round(value.nanoseconds / 1e6));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

/** Firestore-verdier til ren JSON: tidsstempler blir ISO-tekst, hemmelige felt fjernes. */
export function toPlain(value, depth = 0) {
  if (value == null) return value ?? null;
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (isTimestamp(value)) return timestampIso(value);
  if (depth >= MAX_DEPTH) return null;
  if (Array.isArray(value)) return value.map((row) => toPlain(row, depth + 1)).filter((row) => row !== undefined);
  // GeoPoint og DocumentReference fra Firestore.
  if (Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Object.keys(value).length <= 2) {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof value.path === 'string' && typeof value.id === 'string' && value.firestore) return value.path;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    const plain = toPlain(inner, depth + 1);
    if (plain !== undefined) out[key] = plain;
  }
  return out;
}

function includesUid(list, uid) {
  return Array.isArray(list) && list.includes(uid);
}

/**
 * Raden hører til brukeren: laget av, sendt av eller tildelt brukeren.
 * Timer, fravær og utlegg gjelder den ansatte de er ført på (`byEmployee`), ikke den
 * som registrerte dem. En leder får altså ikke andres timer i sin fil.
 */
export function ownsRow(row, { uid, employeeIds = [] } = {}, { byEmployee = false } = {}) {
  if (!row || !uid) return false;
  const employeeId = String(row.employeeId || '');
  if (byEmployee) return !!employeeId && employeeIds.includes(employeeId);
  const owners = [row.createdBy, row.createdByUid, row.ownerUid, row.uid, row.userId, row.senderId, row.authorUid, row.personUid];
  if (owners.includes(uid)) return true;
  if (row.assignedTo === uid || includesUid(row.assignedTo, uid) || includesUid(row.assigneeUids, uid)) return true;
  return includesUid(row.memberIds, uid);
}

function own(rows, who, options) {
  return (Array.isArray(rows) ? rows : []).filter((row) => ownsRow(row, who, options)).map((row) => toPlain(row));
}

/** Chat: hele tråder brukeren er med i. I fellesrommet for hele bedriften bare egne meldinger. */
function chatExport(chat, uid) {
  const shared = chat?.id === 'family' || chat?.id === 'team';
  const messages = (Array.isArray(chat?.messages) ? chat.messages : [])
    .filter((row) => !row?.deleted && (!shared || row?.senderId === uid))
    .map((row) => ({
      id: row.id,
      at: toPlain(row.createdAt) || (row.createdAtMs ? new Date(row.createdAtMs).toISOString() : null),
      fromMe: row.senderId === uid,
      senderName: row.senderName || '',
      text: row.text || '',
      type: row.type || 'text',
    }));
  return {
    id: chat?.id || '',
    title: chat?.title || chat?.name || '',
    sharedRoom: shared,
    messages,
  };
}

/**
 * Bygger filen. `companies` er én rad per bedrift/gruppe med listene appen hentet.
 * `employees` er ansattpostene som er koblet til brukeren (personUid).
 */
export function buildMyDataExport({
  uid,
  account = {},
  profile = null,
  localConsents = null,
  companies = [],
  personal = {},
  friendChats = [],
  now = new Date(),
} = {}) {
  const plainProfile = toPlain(profile || {}) || {};
  const { consents = null, consentHistory = [], ...profileRest } = plainProfile;
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    about: 'Kopi av dine egne data i ProTop. Opplysninger bedriften har registrert om deg (for eksempel lønn og HR), får du hos bedriften.',
    account: {
      uid,
      email: account.email || '',
      displayName: account.displayName || '',
      providers: Array.isArray(account.providers) ? account.providers : [],
    },
    profile: profileRest,
    consents: {
      account: consents,
      thisDevice: toPlain(localConsents),
      history: consentHistory,
    },
    companies: (Array.isArray(companies) ? companies : []).map((company) => {
      const employeeIds = (company.employees || []).map((row) => String(row?.id || '')).filter(Boolean);
      const who = { uid, employeeIds };
      return {
        id: company.id,
        name: company.name || '',
        type: company.type || '',
        myEmployeeRecords: (company.employees || []).map((row) => toPlain(row)),
        notes: own(company.notes, who),
        tasks: own(company.tasks, who),
        calendar: own(company.events, who),
        hours: own(company.timeEntries, who, { byEmployee: true }),
        absence: own(company.absences, who, { byEmployee: true }),
        expenses: own(company.expenses, who, { byEmployee: true }),
        chats: (company.chats || []).map((chat) => chatExport(chat, uid)).filter((chat) => chat.messages.length),
      };
    }),
    personal: Object.fromEntries(
      Object.entries(personal || {}).map(([key, rows]) => [key, (Array.isArray(rows) ? rows : []).map((row) => toPlain(row))]),
    ),
    friendChats: (Array.isArray(friendChats) ? friendChats : []).map((chat) => chatExport(chat, uid)),
  };
}

export function exportFileName(now = new Date()) {
  return `protop-mine-data-${now.toISOString().slice(0, 10)}.json`;
}

/** Antall rader i filen, for beskjeden etter nedlasting. */
export function exportCount(data) {
  let count = 0;
  for (const company of data?.companies || []) {
    for (const key of ['notes', 'tasks', 'calendar', 'hours', 'absence', 'expenses']) count += (company[key] || []).length;
    for (const chat of company.chats || []) count += chat.messages.length;
  }
  for (const rows of Object.values(data?.personal || {})) count += rows.length;
  for (const chat of data?.friendChats || []) count += chat.messages.length;
  return count;
}
