import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { assertSafeOutboundUrl, isBlockedOutboundHost } from './security.js';
import {
  DISPLAY_TIME_ZONE,
  addDaysToDateKey,
  encodeOutlookCalendarPathId,
  formatInTimeZone,
  graphEventWallClock,
  graphWindowForDateKeys,
  graphWindowUtcPadded,
  parseGraphDateTime,
} from './graphDate.js';
import {
  DEFAULT_OAUTH_ORIGIN,
  MS_OAUTH_SCOPES,
  MS_SIGNIN_OAUTH_SCOPES,
  MS_TOKEN_URL,
  confidentialExchangeFailureMessage,
  friendlyMicrosoftAuthMessage,
  isAllowedMicrosoftSignInRedirectUri,
  isMicrosoftAuthExpiredMessage,
  isSpaTokenRestrictionError,
  microsoftGrantedCalendarAccess,
  microsoftGrantedMailAccess,
  mergeOauthScopes,
  microsoftTokenRequestHeaders,
  originFromRedirectUri,
} from './msOauth.js';

const MAX_MS_CALENDARS = 20;
const MAX_MS_PAGES = 6;
const GRAPH = 'https://graph.microsoft.com/v1.0';
const GRAPH_TZ = 'W. Europe Standard Time';

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const MS_TOKEN = MS_TOKEN_URL;

const SOURCE_COLORS = {
  ics: '#64748b',
  google: '#4285f4',
  microsoft: '#0078d4',
};

const EXTERNAL_CALENDAR_COLORS = [
  '#0f766e', '#c2410c', '#6d28d9', '#be185d', '#a16207',
  '#b91c1c', '#047857', '#4338ca', '#0e7490', '#a21caf',
  '#4d7c0f', '#9a3412', '#7e22ce', '#115e59', '#9d174d', '#3f6212',
];

function canonicalCalendarColorId(graphCalendarId, isDefault = false) {
  if (isDefault) return 'default';
  const cal = String(graphCalendarId || 'primary').trim() || 'primary';
  if (cal === 'primary' || cal === 'account' || cal === 'default') return 'default';
  return cal;
}

function colorForExternalCalendar(connectionId, graphCalendarId = 'primary', source = '', opts = {}) {
  const cal = canonicalCalendarColorId(graphCalendarId, opts.isDefault);
  const key = `${source || ''}|${connectionId || 'ext'}|${cal}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return EXTERNAL_CALENDAR_COLORS[Math.abs(h) % EXTERNAL_CALENDAR_COLORS.length];
}

const SOURCE_LABELS = {
  ics: 'ICS',
  google: 'Google',
  microsoft: 'Outlook',
};

/** Microsoft Graph OAuth. Client secret enables long-lived Web refresh tokens. */
function getMicrosoftCreds() {
  const clientId = String(process.env.MICROSOFT_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.MICROSOFT_CLIENT_SECRET || '').trim();
  return {
    clientId,
    clientSecret,
    configured: !!clientId,
    confidential: !!clientId && !!clientSecret,
  };
}

function requireAuth(auth) {
  if (!auth?.uid) throw new Error('Du må være innlogget.');
  return auth.uid;
}

function connRef(db, uid, id) {
  return db.doc(`users/${uid}/calendarConnections/${id}`);
}

function stripSecrets(data) {
  if (!data) return null;
  const {
    accessToken, refreshToken, icsUrl, ...safe
  } = data;
  if (data.type === 'ics' && icsUrl) {
    try {
      safe.icsHost = new URL(String(icsUrl)).hostname.replace(/^www\./i, '') || null;
    } catch {
      safe.icsHost = null;
    }
  }
  return safe;
}

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKey(k) {
  const [y, m, d] = String(k).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toTimeStr(d) {
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function unfoldIcs(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '');
}

function parseIcsDate(raw, tzHint) {
  const val = String(raw || '').trim();
  if (!val) return null;
  if (/^\d{8}$/.test(val)) {
    const y = Number(val.slice(0, 4));
    const m = Number(val.slice(4, 6)) - 1;
    const d = Number(val.slice(6, 8));
    return new Date(y, m, d);
  }
  if (/^\d{8}T\d{6}Z?$/.test(val)) {
    const y = Number(val.slice(0, 4));
    const m = Number(val.slice(4, 6)) - 1;
    const d = Number(val.slice(6, 8));
    const hh = Number(val.slice(9, 11));
    const mm = Number(val.slice(11, 13));
    const ss = Number(val.slice(13, 15));
    if (val.endsWith('Z')) return new Date(Date.UTC(y, m, d, hh, mm, ss));
    return new Date(y, m, d, hh, mm, ss);
  }
  const parsed = new Date(val);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseIcsEvents(icsText) {
  const text = unfoldIcs(icsText);
  const events = [];
  const chunks = text.split('BEGIN:VEVENT');
  chunks.slice(1).forEach((chunk) => {
    const body = chunk.split('END:VEVENT')[0] || '';
    const fields = {};
    body.split('\n').forEach((line) => {
      const idx = line.indexOf(':');
      if (idx < 1) return;
      const rawKey = line.slice(0, idx);
      const val = line.slice(idx + 1).trim();
      const key = rawKey.split(';')[0].toUpperCase();
      if (!fields[key]) fields[key] = val;
    });
    const start = parseIcsDate(fields.DTSTART);
    if (!start) return;
    const end = parseIcsDate(fields.DTEND) || start;
    const allDay = String(fields.DTSTART || '').length === 8;
    events.push({
      uid: fields.UID || `${fields.SUMMARY}-${fields.DTSTART}`,
      title: fields.SUMMARY || 'Hendelse',
      start,
      end,
      allDay,
      rrule: fields.RRULE || null,
    });
  });
  return events;
}

function occursOnDate(ev, d) {
  const k = toDateKey(d);
  const startK = toDateKey(ev.start);
  let endK = toDateKey(ev.end || ev.start);
  // All-day ICS/Google: DTEND / end.date er eksklusiv
  if (ev.allDay && endK > startK) {
    const adj = new Date(ev.end.getFullYear(), ev.end.getMonth(), ev.end.getDate() - 1);
    endK = toDateKey(adj);
  }
  if (endK < startK) endK = startK;

  if (!ev.rrule) return k >= startK && k <= endK;

  const rule = String(ev.rrule).toUpperCase();
  const untilMatch = rule.match(/UNTIL=(\d{8}T?\d{0,6}Z?)/);
  if (untilMatch) {
    const until = parseIcsDate(untilMatch[1]);
    if (until && d > until) return false;
  }

  const start = ev.start;
  if (d < new Date(start.getFullYear(), start.getMonth(), start.getDate())) return false;

  if (rule.includes('FREQ=DAILY')) {
    const interval = Number((rule.match(/INTERVAL=(\d+)/) || [])[1] || 1);
    const diff = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
      - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
    return diff >= 0 && diff % interval === 0;
  }

  if (rule.includes('FREQ=WEEKLY')) {
    const interval = Number((rule.match(/INTERVAL=(\d+)/) || [])[1] || 1);
    const byDay = (rule.match(/BYDAY=([^;]+)/) || [])[1];
    const days = byDay
      ? byDay.split(',').map((x) => ({ SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }[x.slice(-2)])).filter((n) => n != null)
      : [start.getDay()];
    const diffWeeks = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
      - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / (86400000 * 7));
    if (diffWeeks < 0 || diffWeeks % interval !== 0) return false;
    return days.includes(d.getDay());
  }

  return startK === k;
}

function dateParts(d, timeZone) {
  if (timeZone) {
    const formatted = formatInTimeZone(d, timeZone);
    if (formatted) return formatted;
  }
  return { dateKey: toDateKey(d), timeStr: toTimeStr(d) };
}

function normalizeExternalEvent({
  id, title, start, end, allDay, source, sourceLabel, connectionId, timeZone,
}) {
  const startParts = dateParts(start, timeZone);
  const endParts = dateParts(end || start, timeZone);
  let dateKey = startParts.dateKey;
  let endDateKey = endParts.dateKey;
  if (allDay && end && endDateKey > dateKey) {
    // Eksklusiv sluttdato → inkluderende dag før
    if (timeZone) {
      const adj = new Date(end.getTime() - 86400000);
      endDateKey = dateParts(adj, timeZone).dateKey;
    } else {
      const adj = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      endDateKey = toDateKey(adj);
    }
  }
  if (endDateKey < dateKey) endDateKey = dateKey;
  return {
    id,
    title: title || 'Hendelse',
    dateKey,
    endDateKey,
    startTime: allDay ? null : startParts.timeStr,
    endTime: allDay ? null : endParts.timeStr,
    allDay: !!allDay,
    recurring: false,
    source,
    sourceLabel,
    connectionId,
    private: true,
    color: colorForExternalCalendar(connectionId || sourceLabel || source, 'primary', source || 'ics'),
    readOnly: true,
  };
}

async function fetchIcsBody(url) {
  const parsed = assertSafeOutboundUrl(url, { allowHttp: false });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    // manual redirects so we re-validate each hop (SSRF)
    let current = parsed.toString();
    let text = '';
    for (let hop = 0; hop < 3; hop += 1) {
      const res = await fetch(current, {
        headers: { Accept: 'text/calendar', 'User-Agent': 'Weekplan/1.0' },
        redirect: 'manual',
        signal: ctrl.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error('ICS-henting feilet (redirect uten location)');
        const next = assertSafeOutboundUrl(new URL(loc, current).toString(), { allowHttp: false });
        if (isBlockedOutboundHost(next.hostname)) throw new Error('ICS-URL blokkert');
        current = next.toString();
        continue;
      }
      if (!res.ok) throw new Error(`ICS-henting feilet (${res.status})`);
      text = await res.text();
      break;
    }
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Ugyldig ICS-fil');
    if (text.length > 2_000_000) throw new Error('ICS-filen er for stor');
    return text;
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('ICS-henting tok for lang tid');
    if (e?.code === 'invalid-argument') throw new Error(e.message || 'Ugyldig ICS-URL');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function eventsFromIcs(icsText, startKey, endKey) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end) return [];
  const parsed = parseIcsEvents(icsText);
  const out = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    parsed.forEach((ev) => {
      if (!occursOnDate(ev, d)) return;
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), ev.start.getHours(), ev.start.getMinutes());
      const dayEnd = ev.allDay
        ? dayStart
        : new Date(d.getFullYear(), d.getMonth(), d.getDate(), ev.end.getHours(), ev.end.getMinutes());
      out.push(normalizeExternalEvent({
        id: `ics-${ev.uid}-${toDateKey(d)}`,
        title: ev.title,
        start: ev.allDay ? d : dayStart,
        end: ev.allDay ? d : dayEnd,
        allDay: ev.allDay,
        source: 'ics',
        sourceLabel: SOURCE_LABELS.ics,
        connectionId: null,
      }));
    });
  }
  return out;
}

async function refreshGoogleToken(db, uid, conn) {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_WEB_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
  if (!clientSecret || !conn.refreshToken) throw new Error('Google-token utløpt — koble til på nytt.');
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Google-token fornyelse feilet');
  const patch = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await connRef(db, uid, conn.id).set(patch, { merge: true });
  return { ...conn, ...patch };
}

function isConfidentialMicrosoftConnection(conn, clientSecret) {
  return !!clientSecret && conn?.tokenKind === 'web';
}

async function postMicrosoftToken(params, { confidential, redirectUri, oauthOrigin }) {
  const res = await fetch(MS_TOKEN, {
    method: 'POST',
    headers: microsoftTokenRequestHeaders({ confidential, redirectUri, oauthOrigin }),
    body: params,
  });
  const tok = await res.json().catch(() => ({}));
  return { ok: res.ok, tok };
}

async function redeemMicrosoftAuthCode({ code, redirectUri, codeVerifier, scope }) {
  const { clientId, clientSecret } = getMicrosoftCreds();
  const requestedScope = String(scope || '').trim() || MS_OAUTH_SCOPES;
  const buildParams = (confidential) => {
    const params = new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: requestedScope,
    });
    if (confidential && clientSecret) params.set('client_secret', clientSecret);
    if (codeVerifier) params.set('code_verifier', codeVerifier);
    return params;
  };

  if (clientSecret) {
    const first = await postMicrosoftToken(buildParams(true), { confidential: true, redirectUri });
    // Never fall back to SPA here: SPA refresh tokens die after 24h (AADSTS700084).
    return { ...first, tokenKind: 'web' };
  }

  const spa = await postMicrosoftToken(buildParams(false), { confidential: false, redirectUri });
  return { ...spa, tokenKind: 'spa' };
}

async function refreshMicrosoftToken(db, uid, conn) {
  const { clientId, clientSecret } = getMicrosoftCreds();
  if (!clientId || !conn.refreshToken) {
    throw new Error(friendlyMicrosoftAuthMessage('Outlook-token utløpt — koble til på nytt.'));
  }
  const confidential = isConfidentialMicrosoftConnection(conn, clientSecret);
  const params = new URLSearchParams({
    client_id: clientId,
    refresh_token: conn.refreshToken,
    grant_type: 'refresh_token',
    scope: String(conn.grantedScope || '').trim() || MS_OAUTH_SCOPES,
  });
  if (confidential) params.set('client_secret', clientSecret);
  const { ok, tok } = await postMicrosoftToken(params, {
    confidential,
    redirectUri: conn.redirectUri,
    oauthOrigin: conn.oauthOrigin,
  });
  if (!ok) {
    throw new Error(friendlyMicrosoftAuthMessage(tok.error_description || 'Outlook-token fornyelse feilet'));
  }
  const patch = {
    accessToken: tok.access_token,
    expiresAt: Date.now() + (Number(tok.expires_in || 3600) * 1000),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (tok.refresh_token) patch.refreshToken = tok.refresh_token;
  if (tok.scope) patch.grantedScope = mergeOauthScopes(conn.grantedScope, tok.scope);
  await connRef(db, uid, conn.id).set(patch, { merge: true });
  return { ...conn, ...patch };
}

async function ensureFreshToken(db, uid, conn) {
  if (!conn.accessToken) throw new Error('Kalenderen er ikke koblet til.');
  const expiresAt = Number(conn.expiresAt || 0);
  if (expiresAt > Date.now() + 60000) return conn;
  if (conn.type === 'google') return refreshGoogleToken(db, uid, conn);
  if (conn.type === 'microsoft') return refreshMicrosoftToken(db, uid, conn);
  return conn;
}

async function fetchGoogleEvents(conn, startKey, endKey) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  const min = new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString();
  const max = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59).toISOString();
  const headers = { Authorization: `Bearer ${conn.accessToken}` };

  let calendarIds = ['primary'];
  try {
    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', {
      headers,
    });
    const listData = await listRes.json();
    if (listRes.ok && Array.isArray(listData.items) && listData.items.length) {
      calendarIds = listData.items
        .filter((c) => c.selected !== false && c.accessRole !== 'freeBusyReader')
        .map((c) => c.id)
        .filter(Boolean);
      if (!calendarIds.length) calendarIds = ['primary'];
    }
  } catch {
    calendarIds = ['primary'];
  }

  const out = [];
  for (const calId of calendarIds) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
    url.searchParams.set('timeMin', min);
    url.searchParams.set('timeMax', max);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!res.ok) {
      if (calId === 'primary' || calendarIds.length === 1) {
        throw new Error(data.error?.message || 'Google Kalender feilet');
      }
      continue;
    }
    for (const ev of data.items || []) {
      const allDay = !!ev.start?.date;
      const startDate = allDay
        ? parseDateKey(ev.start.date)
        : new Date(ev.start.dateTime);
      const endDate = allDay
        ? parseDateKey(ev.end?.date || ev.start.date)
        : new Date(ev.end?.dateTime || ev.start.dateTime);
      if (!startDate || Number.isNaN(startDate.getTime())) continue;
      out.push(normalizeExternalEvent({
        id: `google-${ev.id}-${toDateKey(startDate)}`,
        title: ev.summary,
        start: startDate,
        end: endDate && !Number.isNaN(endDate.getTime()) ? endDate : startDate,
        allDay,
        source: 'google',
        sourceLabel: conn.email ? `Google · ${conn.email}` : (conn.label || SOURCE_LABELS.google),
        connectionId: conn.id,
        connectionEmail: conn.email || null,
        timeZone: DISPLAY_TIME_ZONE,
      }));
    }
  }
  return out;
}

class GraphError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GraphError';
    this.status = status;
  }
}

function friendlyGraphError(status, graphMessage) {
  if (status === 401) {
    return 'Outlook-tilkoblingen er utløpt eller ugyldig. Fjern kalenderen og logg inn på nytt.';
  }
  if (status === 403) {
    return 'Mangler rettighet til å lese kalenderen (Calendars.Read). For jobbkonto kan administrator måtte gi samtykke i Azure AD.';
  }
  if (status === 404) return 'Kalenderen ble ikke funnet.';
  return graphMessage || `Outlook-feil (${status})`;
}

async function graphFetch(url, accessToken, { preferTimezone = true } = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  if (preferTimezone) headers.Prefer = `outlook.timezone="${GRAPH_TZ}"`;
  const res = await fetch(url, { headers });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const msg = data.error?.message || '';
    if (preferTimezone && res.status === 400 && /time.?zone|prefer/i.test(msg)) {
      return graphFetch(url, accessToken, { preferTimezone: false });
    }
    throw new GraphError(friendlyGraphError(res.status, msg), res.status);
  }
  return data;
}

function mapMicrosoftEvents(rawEvents, conn, calendarMeta = null) {
  const out = [];
  const email = String(conn?.email || '').trim();
  const connLabel = email
    ? `Outlook · ${email}`
    : (conn?.label || SOURCE_LABELS.microsoft);
  const graphCalendarId = calendarMeta?.id || 'primary';
  const graphCalendarName = calendarMeta?.name
    || (graphCalendarId === 'primary' ? 'Kalender' : 'Kalender');
  const mailboxEmail = calendarMeta?.ownerEmail || email || '';
  const graphCalendarIsDefault = !!calendarMeta?.isDefault || graphCalendarId === 'primary';

  for (const ev of rawEvents || []) {
    const allDay = !!ev.isAllDay;
    const wall = graphEventWallClock(ev.start, { allDay });
    const startDate = parseGraphDateTime(ev.start, { allDay });
    if (!wall && !startDate) continue;
    const endWall = graphEventWallClock(ev.end, { allDay });
    const endDate = parseGraphDateTime(ev.end, { allDay }) || startDate;
    const startParts = wall || formatInTimeZone(startDate, DISPLAY_TIME_ZONE);
    const endParts = endWall || formatInTimeZone(endDate, DISPLAY_TIME_ZONE) || startParts;
    let dateKey = startParts.dateKey;
    let endDateKey = endParts.dateKey || dateKey;
    if (allDay && endDateKey > dateKey) {
      endDateKey = addDaysToDateKey(endDateKey, -1);
      if (endDateKey < dateKey) endDateKey = dateKey;
    }
    out.push({
      id: `ms-${conn.id}-${ev.id}-${dateKey}`,
      title: ev.subject || 'Hendelse',
      dateKey,
      endDateKey,
      startTime: allDay ? null : startParts.timeStr,
      endTime: allDay ? null : endParts.timeStr,
      allDay,
      recurring: false,
      source: 'microsoft',
      sourceLabel: connLabel,
      connectionId: conn.id,
      connectionEmail: email || null,
      graphCalendarId,
      graphCalendarName,
      graphCalendarIsDefault,
      mailboxEmail: mailboxEmail || null,
      private: true,
      color: colorForExternalCalendar(conn.id, graphCalendarId, 'microsoft', {
        isDefault: graphCalendarIsDefault,
      }),
      readOnly: true,
    });
  }
  return out;
}

function calendarViewUrl(calendarId, min, max, variant, encodeTimes = 1) {
  let base;
  if (calendarId) {
    base = `${GRAPH}/me/calendars/${encodeOutlookCalendarPathId(calendarId, encodeTimes)}/calendarView`;
  } else if (variant === 'user') {
    // GET /me/calendarView — documented user default calendar view
    base = `${GRAPH}/me/calendarView`;
  } else {
    base = `${GRAPH}/me/calendar/calendarView`;
  }
  return `${base}?startDateTime=${encodeURIComponent(min)}&endDateTime=${encodeURIComponent(max)}&$top=250`;
}

async function fetchMicrosoftCalendarView(accessToken, calendarId, min, max, variant, encodeTimes = 1) {
  const out = [];
  let next = calendarViewUrl(calendarId, min, max, variant, encodeTimes);
  let pages = 0;
  while (next && pages < MAX_MS_PAGES) {
    pages += 1;
    const data = await graphFetch(next, accessToken);
    out.push(...(data.value || []));
    next = data['@odata.nextLink'] || null;
  }
  return out;
}

function isInterestCalendarName(name) {
  return /helligdag|holiday|bursdag|birthday|fødselsdag/i.test(String(name || ''));
}

async function listMicrosoftCalendars(accessToken) {
  const out = [];
  const seen = new Set();
  const add = (cal) => {
    if (!cal?.id || seen.has(cal.id)) return;
    seen.add(cal.id);
    out.push(cal);
  };
  try {
    const list = await graphFetch(`${GRAPH}/me/calendars?$top=100`, accessToken);
    (list.value || []).forEach(add);
  } catch (e) {
    if (e?.status === 401) throw e;
    logger.warn('Outlook calendar list failed', { message: e?.message, status: e?.status });
  }
  try {
    const groups = await graphFetch(`${GRAPH}/me/calendarGroups?$top=20`, accessToken);
    for (const g of groups.value || []) {
      if (!g?.id) continue;
      try {
        const nested = await graphFetch(
          `${GRAPH}/me/calendarGroups/${encodeURIComponent(g.id)}/calendars?$top=50`,
          accessToken,
        );
        (nested.value || []).forEach(add);
      } catch (e) {
        if (e?.status === 401) throw e;
      }
    }
  } catch (e) {
    if (e?.status === 401) throw e;
  }
  return out;
}

async function fetchMicrosoftEvents(conn, startKey, endKey, { skipOwnerEmails = [] } = {}) {
  const oslo = graphWindowForDateKeys(startKey, endKey);
  const utc = graphWindowUtcPadded(startKey, endKey);
  const windows = [oslo];
  if (utc.min !== oslo.min || utc.max !== oslo.max) windows.push(utc);

  const out = [];
  const seen = new Set();
  const skipped = [];
  const layers = [];
  const layerSeen = new Set();
  let successCount = 0;
  let firstError = null;
  let rawCount = 0;
  const skipOwners = new Set(
    (skipOwnerEmails || []).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean),
  );

  const email = String(conn?.email || '').trim();

  const rememberLayer = (meta) => {
    const id = meta?.id || 'primary';
    if (layerSeen.has(id)) return;
    layerSeen.add(id);
    layers.push({
      id,
      name: meta?.name || (id === 'primary' ? 'Kalender' : 'Kalender'),
      ownerEmail: meta?.ownerEmail || email || null,
      isDefault: !!meta?.isDefault || id === 'primary',
    });
  };

  const take = (mapped) => {
    for (const ev of mapped) {
      if (seen.has(ev.id)) continue;
      const from = ev.dateKey;
      const to = ev.endDateKey || ev.dateKey;
      if (from > endKey || to < startKey) continue;
      seen.add(ev.id);
      out.push(ev);
    }
  };

  const tryView = async (calendarId, meta, variant) => {
    const label = meta?.name || calendarId || 'Outlook';
    const encodeAttempts = calendarId ? [1, 2] : [1];
    for (const encodeTimes of encodeAttempts) {
      for (const win of windows) {
        try {
          const raw = await fetchMicrosoftCalendarView(
            conn.accessToken, calendarId, win.min, win.max, variant, encodeTimes,
          );
          rawCount += raw.length;
          take(mapMicrosoftEvents(raw, conn, meta));
          rememberLayer(meta || { id: 'primary', name: 'Kalender', isDefault: true });
          successCount += 1;
          if (raw.length) return true;
          break;
        } catch (e) {
          if (e?.status === 401) throw e;
          if (e?.status === 404 && encodeTimes === 1 && calendarId) break;
          if (e?.status === 400) continue;
          if (!firstError) firstError = e;
          skipped.push(label);
          return false;
        }
      }
    }
    return false;
  };

  await tryView('', { id: 'primary', name: 'Kalender', ownerEmail: email, isDefault: true }, 'user');
  await tryView('', { id: 'primary', name: 'Kalender', ownerEmail: email, isDefault: true }, 'calendar');

  const calendars = await listMicrosoftCalendars(conn.accessToken);
  let extra = 0;
  for (const cal of calendars) {
    if (!cal?.id) continue;
    if (extra >= MAX_MS_CALENDARS) break;
    extra += 1;
    const ownerEmail = cal.owner?.address || cal.owner?.name || null;
    const ownerKey = String(ownerEmail || '').trim().toLowerCase();
    // Another Outlook-konto er koblet separat — ikke hent den som delt under denne.
    if (ownerKey && skipOwners.has(ownerKey) && ownerKey !== email.toLowerCase()) {
      continue;
    }
    const isShared = !!(ownerEmail && email && ownerEmail.toLowerCase() !== email.toLowerCase())
      || cal.isDefaultCalendar === false;
    const name = cal.name || (isShared ? (ownerEmail || 'Delt kalender') : 'Kalender');
    rememberLayer({
      id: cal.id,
      name,
      ownerEmail: ownerEmail || email || null,
      isDefault: !!cal.isDefaultCalendar,
    });
    await tryView(cal.id, {
      id: cal.id,
      name,
      ownerEmail: ownerEmail || email || null,
      isDefault: !!cal.isDefaultCalendar,
    });
  }

  if (successCount === 0 && firstError) throw firstError;
  return {
    events: out,
    layers,
    skipped: [...new Set(skipped)].filter((n) => !isInterestCalendarName(n)),
    successCount,
    rawCount,
    calendarCount: calendars.length,
  };
}

export async function handleListCalendarConnections(_data, auth, db) {
  const uid = requireAuth(auth);
  const snap = await db.collection(`users/${uid}/calendarConnections`).get();
  return {
    ok: true,
    connections: snap.docs.map((d) => {
      const safe = stripSecrets({ id: d.id, ...d.data() });
      if (safe?.type === 'microsoft') {
        if (safe.lastError) {
          safe.lastError = friendlyMicrosoftAuthMessage(safe.lastError);
          safe.needsReauth = isMicrosoftAuthExpiredMessage(safe.lastError);
        }
        safe.longLived = safe.tokenKind === 'web';
        safe.mailAccess = microsoftGrantedMailAccess(safe.grantedScope);
      }
      return safe;
    }),
  };
}

export async function handleAddIcsCalendar(data, auth, db) {
  const uid = requireAuth(auth);
  const url = String(data?.url || '').trim().replace(/\/+$/, '');
  const label = String(data?.label || 'ICS-kalender').trim() || 'ICS-kalender';
  if (!/^https:\/\/.+/i.test(url)) {
    return { ok: false, error: 'ICS-lenken må starte med https://' };
  }
  try {
    try {
      assertSafeOutboundUrl(url, { allowHttp: false });
    } catch (e) {
      return { ok: false, error: e?.message || 'Ugyldig ICS-lenke' };
    }
    const existing = await db.collection(`users/${uid}/calendarConnections`).get();
    const duplicate = existing.docs.some((d) => {
      const prev = String(d.data()?.icsUrl || '').trim().replace(/\/+$/, '');
      return d.data()?.type === 'ics' && prev && prev === url;
    });
    if (duplicate) {
      return { ok: false, error: 'Denne ICS-lenken er allerede lagt til.' };
    }
    const body = await fetchIcsBody(url);
    const id = db.collection('_').doc().id;
    await connRef(db, uid, id).set({
      type: 'ics',
      label,
      icsUrl: url,
      enabled: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    eventsFromIcs(body, toDateKey(new Date()), toDateKey(new Date()));
    return { ok: true, id, connection: { id, type: 'ics', label, enabled: true } };
  } catch (e) {
    logger.warn('addIcsCalendar failed', { message: e?.message });
    return { ok: false, error: e?.message || 'Kunne ikke lese ICS-filen' };
  }
}

export async function handleRemoveCalendarConnection(data, auth, db) {
  const uid = requireAuth(auth);
  const id = String(data?.id || '');
  if (!id) return { ok: false, error: 'Mangler tilkoblings-id' };
  await connRef(db, uid, id).delete();
  return { ok: true };
}

export async function handleGetCalendarOAuthConfig(_data, auth) {
  requireAuth(auth);
  const googleClientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
    || process.env.GOOGLE_WEB_CLIENT_ID
    || '';
  const {
    clientId: microsoftClientId,
    configured: microsoftConfigured,
    confidential,
  } = getMicrosoftCreds();
  const googleConfigured = !!(googleClientId && process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
  logger.info('Outlook oauth config', {
    hasClientId: !!microsoftClientId,
    confidential,
  });
  return {
    ok: true,
    google: { clientId: googleClientId, configured: googleConfigured },
    microsoft: {
      clientId: microsoftClientId,
      configured: microsoftConfigured,
      hasClientSecret: confidential,
    },
  };
}

/**
 * Unauthenticated Microsoft code exchange for Firebase account sign-in.
 * Reuses the Azure-registered /oauth/calendar redirect (Firebase __/auth/handler
 * is often missing → AADSTS50011).
 */
export async function handleExchangeMicrosoftSignIn(data) {
  const code = String(data?.code || '').trim();
  const redirectUri = String(data?.redirectUri || '').trim();
  const codeVerifier = data?.codeVerifier ? String(data.codeVerifier) : '';
  if (!code || !redirectUri) return { ok: false, error: 'Mangler OAuth-data' };
  if (!isAllowedMicrosoftSignInRedirectUri(redirectUri)) {
    return { ok: false, error: 'Ugyldig redirect URI for Microsoft-innlogging.' };
  }

  const { clientSecret, configured } = getMicrosoftCreds();
  if (!configured) return { ok: false, error: 'Microsoft er ikke konfigurert ennå.' };
  if (!clientSecret && !codeVerifier) {
    return { ok: false, error: 'Microsoft-innlogging mangler PKCE eller client secret.' };
  }

  const redeemed = await redeemMicrosoftAuthCode({
    code,
    redirectUri,
    codeVerifier,
    scope: String(data?.scope || '').trim() || MS_SIGNIN_OAUTH_SCOPES,
  });
  const tok = redeemed.tok || {};
  if (!redeemed.ok) {
    return {
      ok: false,
      spaRestriction: isSpaTokenRestrictionError(tok.error_description),
      error: confidentialExchangeFailureMessage(
        tok.error_description || 'Microsoft-innlogging feilet',
      ),
    };
  }
  if (!tok.id_token && !tok.access_token) {
    return { ok: false, error: 'Microsoft sendte ikke innloggingstoken.' };
  }
  return {
    ok: true,
    idToken: tok.id_token || null,
    accessToken: tok.access_token || null,
    expiresIn: Number(tok.expires_in || 3600),
    scope: tok.scope || '',
  };
}

export async function handleExchangeCalendarOAuth(data, auth, db) {
  const uid = requireAuth(auth);
  const provider = String(data?.provider || '');
  const code = String(data?.code || '');
  const redirectUri = String(data?.redirectUri || '');
  const preissuedAccess = String(data?.accessToken || '').trim();

  if (provider === 'google') {
    if (!code || !redirectUri) return { ok: false, error: 'Mangler OAuth-data' };
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_WEB_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) return { ok: false, error: 'Google Kalender er ikke konfigurert ennå.' };
    const res = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tok = await res.json();
    if (!res.ok) return { ok: false, error: tok.error_description || 'Google-innlogging feilet' };
    let email = '';
    try {
      const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      const info = await me.json();
      email = info.email || '';
    } catch {}
    const id = db.collection('_').doc().id;
    await connRef(db, uid, id).set({
      type: 'google',
      label: email ? `Google · ${email}` : 'Google Kalender',
      email,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token || null,
      expiresAt: Date.now() + (Number(tok.expires_in || 3600) * 1000),
      enabled: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, id, connection: { id, type: 'google', label: email || 'Google Kalender', email, enabled: true } };
  }

  if (provider === 'microsoft') {
    const { clientSecret, configured } = getMicrosoftCreds();
    if (!configured) return { ok: false, error: 'Outlook er ikke konfigurert ennå.' };

    let tok;
    let via = 'server';
    let tokenKind = clientSecret ? 'web' : 'spa';
    if (code && redirectUri) {
      const codeVerifier = data?.codeVerifier ? String(data.codeVerifier) : '';
      if (!clientSecret && !codeVerifier) {
        return { ok: false, error: 'Outlook-innlogging mangler PKCE eller client secret.' };
      }
      const redeemed = await redeemMicrosoftAuthCode({
        code,
        redirectUri,
        codeVerifier,
        scope: data?.scope,
      });
      tok = redeemed.tok;
      tokenKind = redeemed.tokenKind;
      if (!redeemed.ok) {
        return {
          ok: false,
          spaRestriction: isSpaTokenRestrictionError(tok.error_description),
          error: confidentialExchangeFailureMessage(tok.error_description || 'Microsoft-innlogging feilet'),
        };
      }
    } else if (preissuedAccess) {
      // Native / SPA fallback: browser already redeemed the PKCE code.
      via = 'browser';
      tokenKind = 'spa';
      tok = {
        access_token: preissuedAccess,
        refresh_token: data?.refreshToken ? String(data.refreshToken) : null,
        expires_in: Number(data?.expiresIn || 3600),
        scope: data?.scope || '',
      };
    } else {
      return { ok: false, error: 'Mangler OAuth-data' };
    }

    const requestedMail = data?.mail === true
      || microsoftGrantedMailAccess(data?.scope)
      || microsoftGrantedMailAccess(tok);
    const gotMail = microsoftGrantedMailAccess(tok);
    const gotCal = microsoftGrantedCalendarAccess(tok);

    if (requestedMail && !gotMail) {
      return {
        ok: false,
        error: 'Microsoft ga ikke e-posttilgang (Mail.Read). For jobbkonto må administrator ofte godkjenne appen i Azure AD. Prøv igjen og godkjenn e-post.',
      };
    }
    if (!requestedMail && !gotCal) {
      return {
        ok: false,
        error: 'Microsoft ga ikke kalendertilgang (Calendars.Read). For jobbkonto må administrator ofte godkjenne appen i Azure AD. Prøv å logge inn på nytt og godkjenn kalenderlesing.',
      };
    }

    let email = '';
    try {
      const me = await fetch(`${GRAPH}/me`, {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      const info = await me.json();
      email = info.mail || info.userPrincipalName || '';
    } catch {}
    const oauthOrigin = originFromRedirectUri(redirectUri, DEFAULT_OAUTH_ORIGIN);
    const emailKey = String(email || '').trim().toLowerCase();
    const reconnectId = String(data?.connectionId || '').trim();
    let id = reconnectId;
    let existingData = null;
    if (id) {
      const existing = await connRef(db, uid, id).get();
      if (!existing.exists || existing.data()?.type !== 'microsoft') {
        id = '';
      } else {
        existingData = existing.data() || null;
      }
    }
    if (emailKey) {
      const snap = await db.collection(`users/${uid}/calendarConnections`).get();
      const same = snap.docs.find((d) => {
        const prev = d.data() || {};
        return prev.type === 'microsoft'
          && String(prev.email || '').trim().toLowerCase() === emailKey;
      });
      if (same) {
        id = same.id;
        existingData = same.data() || null;
      }
    }
    if (!id) id = db.collection('_').doc().id;
    const mergedScope = mergeOauthScopes(existingData?.grantedScope, tok.scope);
    const patch = {
      type: 'microsoft',
      label: email ? `Outlook · ${email}` : (gotCal ? 'Outlook Kalender' : 'Outlook e-post'),
      email,
      accessToken: tok.access_token,
      expiresAt: Date.now() + (Number(tok.expires_in || 3600) * 1000),
      grantedScope: mergedScope || tok.scope || null,
      redirectUri: redirectUri || null,
      oauthOrigin,
      tokenKind,
      enabled: true,
      lastError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (tok.refresh_token) patch.refreshToken = tok.refresh_token;
    else if (!existingData) patch.refreshToken = null;
    if (!reconnectId || id !== reconnectId) {
      patch.createdAt = FieldValue.serverTimestamp();
    }
    await connRef(db, uid, id).set(patch, { merge: true });
    logger.info('Outlook OAuth stored', {
      uid,
      via,
      tokenKind,
      hasRefresh: !!(tok.refresh_token || existingData?.refreshToken),
      email,
      reconnect: !!reconnectId,
      mail: gotMail,
    });
    return {
      ok: true,
      id,
      tokenKind,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token || existingData?.refreshToken || null,
      expiresIn: Number(tok.expires_in || 3600),
      scope: mergedScope || tok.scope || null,
      connection: {
        id,
        type: 'microsoft',
        label: email || (gotCal ? 'Outlook Kalender' : 'Outlook e-post'),
        email,
        enabled: true,
        tokenKind,
        longLived: tokenKind === 'web',
        mailAccess: microsoftGrantedMailAccess(mergedScope || tok.scope),
      },
    };
  }

  return { ok: false, error: 'Ukjent kalenderleverandør' };
}

export async function handleFetchExternalCalendarEvents(data, auth, db) {
  const uid = requireAuth(auth);
  const startKey = String(data?.startDateKey || '');
  const endKey = String(data?.endDateKey || '');
  if (!startKey || !endKey) return { ok: false, error: 'Mangler datoperiode' };

  const snap = await db.collection(`users/${uid}/calendarConnections`).get();
  const all = [];
  const layersByConnection = {};
  const errors = [];
  const connections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Outlook first so a hanging ICS feed cannot starve Graph within the function timeout.
  connections.sort((a, b) => Number(a.type !== 'microsoft') - Number(b.type !== 'microsoft'));
  const msEmails = connections
    .filter((c) => c.type === 'microsoft' && c.enabled !== false && c.email)
    .map((c) => String(c.email).trim().toLowerCase())
    .filter(Boolean);

  for (const conn of connections) {
    if (conn.enabled === false) continue;
    let fetched = [];
    let skippedCount = 0;
    let skipWarning = null;
    try {
      if (conn.type === 'ics' && conn.icsUrl) {
        const body = await fetchIcsBody(conn.icsUrl);
        fetched = eventsFromIcs(body, startKey, endKey).map((e) => ({
          ...e,
          connectionId: conn.id,
          sourceLabel: conn.label || SOURCE_LABELS.ics,
        }));
      } else if (conn.type === 'google') {
        const fresh = await ensureFreshToken(db, uid, conn);
        fetched = await fetchGoogleEvents(fresh, startKey, endKey);
      } else if (conn.type === 'microsoft') {
        if (conn.grantedScope && !microsoftGrantedCalendarAccess({ scope: conn.grantedScope })) {
          continue;
        }
        const skipOwnerEmails = msEmails.filter(
          (e) => e !== String(conn.email || '').trim().toLowerCase(),
        );
        let fresh = await ensureFreshToken(db, uid, conn);
        let result;
        try {
          result = await fetchMicrosoftEvents(fresh, startKey, endKey, { skipOwnerEmails });
        } catch (e) {
          if (e?.status === 401 && fresh.refreshToken) {
            fresh = await refreshMicrosoftToken(db, uid, fresh);
            result = await fetchMicrosoftEvents(fresh, startKey, endKey, { skipOwnerEmails });
          } else {
            throw e;
          }
        }
        fetched = result.events || [];
        skippedCount = (result.skipped || []).length;
        if (result.layers?.length) {
          layersByConnection[conn.id] = {
            connectionId: conn.id,
            type: 'microsoft',
            email: conn.email || null,
            label: conn.label || null,
            calendars: result.layers,
          };
        }
        if (skippedCount > 0) {
          const skippedNames = (result.skipped || []).slice(0, 4).join(', ');
          const skipMsg = `Hoppet over kalendere uten lesetilgang${skippedNames ? ` (${skippedNames})` : ''} i ${conn.email || 'Outlook'}.`;
          if (!fetched.length) {
            throw new Error(skipMsg);
          }
          skipWarning = skipMsg;
        }
        logger.info('Outlook calendar sync', {
          uid,
          connId: conn.id,
          rawCount: result.rawCount,
          mapped: fetched.length,
          successCount: result.successCount,
          skippedCount,
          range: `${startKey}..${endKey}`,
        });
      }
      all.push(...fetched);
      await connRef(db, uid, conn.id).set({
        lastError: FieldValue.delete(),
        lastWarning: skipWarning || FieldValue.delete(),
        lastSyncCount: fetched.length,
        lastSkippedCount: skippedCount,
        lastSyncedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      logger.warn('fetchExternalCalendarEvents connection failed', {
        uid, connId: conn.id, type: conn.type, message: e?.message, status: e?.status,
      });
      const message = conn.type === 'microsoft'
        ? friendlyMicrosoftAuthMessage(e?.message || 'Klarte ikke hente hendelser')
        : (e?.message || 'Klarte ikke hente hendelser');
      errors.push({
        connectionId: conn.id,
        type: conn.type,
        email: conn.email || null,
        label: conn.label || null,
        message,
      });
      try {
        await connRef(db, uid, conn.id).set({
          lastError: message,
          lastSyncCount: 0,
          lastSkippedCount: 0,
          lastSyncedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch {}
    }
  }

  all.sort((a, b) => {
    const d = String(a.dateKey).localeCompare(String(b.dateKey));
    if (d !== 0) return d;
    return String(a.startTime || '').localeCompare(String(b.startTime || ''));
  });

  return {
    ok: true,
    events: all,
    errors,
    layers: Object.values(layersByConnection),
  };
}

export { requireAuth };

export async function loadMicrosoftConnection(db, uid, connectionId) {
  const id = String(connectionId || '').trim();
  if (!id) throw new Error('Mangler konto-id');
  const snap = await connRef(db, uid, id).get();
  if (!snap.exists) throw new Error('Fant ikke Outlook-kontoen.');
  const conn = { id: snap.id, ...snap.data() };
  if (conn.type !== 'microsoft') throw new Error('Dette er ikke en Outlook-konto.');
  return ensureFreshToken(db, uid, conn);
}
