/**
 * Optional browser Graph calendarView using a stored access token.
 *
 * Long-lived refresh tokens live on the server (Web app + client secret).
 * The browser only keeps a short-lived access token for a faster first paint.
 */

import { colorForExternalCalendar } from './calendarColors';

const TOKEN_KEY = 'weekplan.outlook.graphToken';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const MS_TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_TZ = 'W. Europe Standard Time';
const MS_SCOPES = 'openid offline_access User.Read Calendars.Read Calendars.Read.Shared';

function friendlyRefreshError(raw) {
  const s = String(raw || '');
  if (/AADSTS70008|AADSTS700084|AADSTS700082|AADSTS9002313|AADSTS9002327/i.test(s)) {
    return 'Outlook-økten utløp. Trykk «Koble til på nytt» under kalenderinnstillinger.';
  }
  if (/delt kalender|kunne ikke leses|ICS-henting/i.test(s)) {
    return s;
  }
  if (/AADSTS/i.test(s)) {
    return 'Outlook-innloggingen feilet. Trykk «Koble til på nytt» under kalenderinnstillinger.';
  }
  return s || 'Outlook-token utløpt — koble til på nytt.';
}

function storage() {
  if (typeof localStorage !== 'undefined') return localStorage;
  if (typeof sessionStorage !== 'undefined') return sessionStorage;
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function osloOffsetForDateKey(dateKey) {
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  if (!y || !m || !d) return '+01:00';
  const lastSundayUtc = (year, monthIndex) => {
    const dt = new Date(Date.UTC(year, monthIndex + 1, 0));
    dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
    return dt.getTime();
  };
  const start = lastSundayUtc(y, 2);
  const end = lastSundayUtc(y, 9);
  const noon = Date.UTC(y, m - 1, d, 12);
  return noon >= start && noon < end ? '+02:00' : '+01:00';
}

function addDaysToDateKey(key, delta) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return key;
  const dt = new Date(Date.UTC(y, m - 1, d + Number(delta || 0)));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function wallClock(dateObj, allDay) {
  if (!dateObj) return null;
  const s = String(typeof dateObj === 'string' ? dateObj : (dateObj.dateTime || dateObj.date || '')).trim();
  if (!s) return null;
  const dateKey = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const hm = s.slice(11, 16);
  return {
    dateKey,
    timeStr: allDay ? null : (/^\d{2}:\d{2}$/.test(hm) ? hm : null),
  };
}

function mapEvent(ev, connectionId, calendarMeta = null, connectionEmail = '') {
  const allDay = !!ev.isAllDay;
  const start = wallClock(ev.start, allDay);
  if (!start?.dateKey) return null;
  const end = wallClock(ev.end, allDay) || start;
  let endDateKey = end.dateKey;
  if (allDay && endDateKey > start.dateKey) {
    endDateKey = addDaysToDateKey(endDateKey, -1);
    if (endDateKey < start.dateKey) endDateKey = start.dateKey;
  }
  const email = String(connectionEmail || '').trim();
  const graphCalendarId = calendarMeta?.id || 'primary';
  const graphCalendarName = calendarMeta?.name || 'Kalender';
  const mailboxEmail = calendarMeta?.ownerEmail || email || null;
  const graphCalendarIsDefault = !!calendarMeta?.isDefault || graphCalendarId === 'primary';
  return {
    id: `ms-${connectionId || 'outlook'}-${ev.id}-${start.dateKey}`,
    title: ev.subject || 'Hendelse',
    dateKey: start.dateKey,
    endDateKey,
    startTime: allDay ? null : start.timeStr,
    endTime: allDay ? null : end.timeStr,
    allDay,
    recurring: false,
    source: 'microsoft',
    sourceLabel: email ? `Outlook · ${email}` : 'Outlook',
    connectionId: connectionId || 'outlook',
    connectionEmail: email || null,
    graphCalendarId,
    graphCalendarName,
    graphCalendarIsDefault,
    mailboxEmail,
    private: true,
    color: colorForExternalCalendar(
      connectionId || 'outlook',
      graphCalendarId,
      'microsoft',
      { isDefault: graphCalendarIsDefault },
    ),
    readOnly: true,
  };
}

function writeToken(payload) {
  const store = storage();
  if (!store || !payload?.accessToken) return;
  try {
    const prev = readTokenRaw() || {};
    const next = {
      ...prev,
      accessToken: payload.accessToken,
      connectionId: payload.connectionId || prev.connectionId || 'outlook',
      clientId: payload.clientId || prev.clientId,
      scope: payload.scope || prev.scope,
      email: payload.email != null ? payload.email : prev.email,
      expiresAt: Date.now() + (Number(payload.expiresIn || 3600) * 1000) - 60_000,
    };
    if (payload.refreshToken) next.refreshToken = payload.refreshToken;
    store.setItem(TOKEN_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}

export function saveOutlookGraphToken({
  accessToken, refreshToken, expiresIn, connectionId, clientId, scope, email,
} = {}) {
  if (!accessToken) return;
  writeToken({
    accessToken,
    refreshToken: refreshToken || undefined,
    expiresIn,
    connectionId: connectionId || 'outlook',
    clientId,
    scope,
    email,
  });
}

export function clearOutlookGraphToken() {
  try { storage()?.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

function readTokenRaw() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(TOKEN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function refreshInBrowser(tok) {
  if (!tok?.refreshToken || !tok?.clientId) return null;
  const res = await fetch(MS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: tok.clientId,
      grant_type: 'refresh_token',
      refresh_token: tok.refreshToken,
      scope: MS_SCOPES,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(friendlyRefreshError(data.error_description || 'Outlook-token utløpt — koble til på nytt.'));
  }
  writeToken({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tok.refreshToken,
    expiresIn: Number(data.expires_in || 3600),
    connectionId: tok.connectionId,
    clientId: tok.clientId,
    scope: data.scope || tok.scope,
    email: tok.email,
  });
  return readTokenRaw();
}

async function getValidToken() {
  const tok = readTokenRaw();
  if (!tok?.accessToken) return null;
  if (Number(tok.expiresAt || 0) > Date.now()) return tok;
  try {
    return await refreshInBrowser(tok);
  } catch {
    return null;
  }
}

async function graphFetch(url, accessToken, { preferTimezone = true } = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  if (preferTimezone) headers.Prefer = `outlook.timezone="${GRAPH_TZ}"`;
  const res = await fetch(url, { headers });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    const msg = data.error?.message || '';
    if (preferTimezone && res.status === 400 && /time.?zone|prefer/i.test(msg)) {
      return graphFetch(url, accessToken, { preferTimezone: false });
    }
    const err = new Error(msg || `Outlook-feil (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function encodeOutlookCalendarPathId(calendarId, times = 1) {
  let s = String(calendarId || '');
  const n = Math.max(1, Number(times) || 1);
  for (let i = 0; i < n; i += 1) s = encodeURIComponent(s);
  return s;
}

function viewUrl(calendarId, min, max, variant, encodeTimes = 1) {
  let base;
  if (calendarId) {
    base = `${GRAPH}/me/calendars/${encodeOutlookCalendarPathId(calendarId, encodeTimes)}/calendarView`;
  } else if (variant === 'user') {
    base = `${GRAPH}/me/calendarView`;
  } else {
    base = `${GRAPH}/me/calendar/calendarView`;
  }
  return `${base}?startDateTime=${encodeURIComponent(min)}&endDateTime=${encodeURIComponent(max)}&$top=250`;
}

async function calendarView(accessToken, calendarId, min, max, variant) {
  const encodeAttempts = calendarId ? [1, 2] : [1];
  let lastErr = null;
  for (const encodeTimes of encodeAttempts) {
    try {
      const out = [];
      let next = viewUrl(calendarId, min, max, variant, encodeTimes);
      let pages = 0;
      while (next && pages < 6) {
        pages += 1;
        const data = await graphFetch(next, accessToken);
        out.push(...(data.value || []));
        next = data['@odata.nextLink'] || null;
      }
      return out;
    } catch (e) {
      lastErr = e;
      if (e?.status === 404 && encodeTimes === 1 && calendarId) continue;
      throw e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

function windowsForRange(startKey, endKey) {
  const oslo = {
    min: `${startKey}T00:00:00${osloOffsetForDateKey(startKey)}`,
    max: `${endKey}T23:59:59${osloOffsetForDateKey(endKey)}`,
  };
  const utc = {
    min: `${addDaysToDateKey(startKey, -1)}T00:00:00.0000000Z`,
    max: `${addDaysToDateKey(endKey, 1)}T23:59:59.0000000Z`,
  };
  return [oslo, utc];
}

/**
 * Fetch Outlook events for a YYYY-MM-DD range using the stored Graph token.
 * Returns { events, errors, usedClient, diagnostics, layers }.
 */
export async function fetchOutlookEventsFromGraph(startKey, endKey) {
  const tok = await getValidToken();
  if (!tok) return { events: [], errors: [], usedClient: false, diagnostics: null, layers: [] };

  const windows = windowsForRange(startKey, endKey);
  const seen = new Set();
  const events = [];
  const errors = [];
  const skipped = [];
  const layers = [];
  const layerSeen = new Set();
  let calendarCount = 0;
  let rawCount = 0;
  const email = String(tok.email || '').trim();

  const rememberLayer = (meta) => {
    const id = meta?.id || 'primary';
    if (layerSeen.has(id)) return;
    layerSeen.add(id);
    layers.push({
      id,
      name: meta?.name || 'Kalender',
      ownerEmail: meta?.ownerEmail || email || null,
      isDefault: !!meta?.isDefault || id === 'primary',
    });
  };

  const take = (raw, meta) => {
    for (const ev of raw || []) {
      const mapped = mapEvent(ev, tok.connectionId, meta, email);
      if (!mapped || seen.has(mapped.id)) continue;
      const from = mapped.dateKey;
      const to = mapped.endDateKey || mapped.dateKey;
      if (from > endKey || to < startKey) continue;
      seen.add(mapped.id);
      events.push(mapped);
    }
  };

  const tryView = async (calendarId, meta, variant) => {
    const label = meta?.name || 'Outlook-kalender';
    for (const win of windows) {
      try {
        const raw = await calendarView(tok.accessToken, calendarId, win.min, win.max, variant);
        rawCount += raw.length;
        rememberLayer(meta);
        take(raw, meta);
        if (raw.length) return;
      } catch (e) {
        if (e?.status === 401) throw e;
        if (e?.status === 400) continue;
        skipped.push(label);
        errors.push({
          type: 'microsoft',
          connectionId: tok.connectionId || null,
          email: email || null,
          calendar: label,
          message: String(e?.message || label),
        });
        return;
      }
    }
  };

  try {
    const primaryMeta = {
      id: 'primary', name: 'Kalender', ownerEmail: email || null, isDefault: true,
    };
    await tryView('', primaryMeta, 'user');
    await tryView('', primaryMeta, 'calendar');

    const list = await graphFetch(`${GRAPH}/me/calendars?$top=100`, tok.accessToken).catch((e) => {
      if (e?.status === 401) throw e;
      return { value: [] };
    });
    const calendars = [...(list.value || [])];
    try {
      const groups = await graphFetch(`${GRAPH}/me/calendarGroups?$top=20`, tok.accessToken);
      for (const g of groups.value || []) {
        if (!g?.id) continue;
        const nested = await graphFetch(
          `${GRAPH}/me/calendarGroups/${encodeURIComponent(g.id)}/calendars?$top=50`,
          tok.accessToken,
        ).catch(() => ({ value: [] }));
        for (const cal of nested.value || []) {
          if (cal?.id && !calendars.some((c) => c.id === cal.id)) calendars.push(cal);
        }
      }
    } catch {
      // ignore group listing failures
    }
    calendarCount = calendars.length;
    let n = 0;
    for (const cal of calendars) {
      if (!cal?.id || n >= 20) continue;
      n += 1;
      const ownerEmail = cal.owner?.address || cal.owner?.name || null;
      const meta = {
        id: cal.id,
        name: cal.name || (ownerEmail || 'Kalender'),
        ownerEmail: ownerEmail || email || null,
        isDefault: !!cal.isDefaultCalendar,
      };
      rememberLayer(meta);
      await tryView(cal.id, meta);
    }
  } catch (e) {
    errors.push({
      type: 'microsoft',
      connectionId: tok.connectionId || null,
      email: email || null,
      message: e?.message || 'Klarte ikke lese Outlook-kalenderen i nettleseren.',
    });
    if (e?.status === 401 || e?.status === 403) {
      return {
        events: [],
        errors,
        usedClient: true,
        layers: [],
        diagnostics: { calendarCount, rawCount, skipped: [...new Set(skipped)] },
      };
    }
  }

  return {
    events,
    errors: [...new Map(errors.map((e) => [e.message, e])).values()],
    usedClient: true,
    layers: tok.connectionId ? [{
      connectionId: tok.connectionId,
      type: 'microsoft',
      email: email || null,
      calendars: layers,
    }] : [],
    diagnostics: {
      calendarCount,
      rawCount,
      skipped: [...new Set(skipped)],
    },
  };
}
