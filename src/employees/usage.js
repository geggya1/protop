/**
 * Brukslogg for en medarbeider: hendelser, sist aktiv, sist timeføring og IP.
 * IP settes på serveren. Klienten får ikke bestemme den.
 */

export const USAGE_TYPES = new Set([
  'active',
  'login',
  'navigation',
  'hour',
  'hour_deleted',
  'invite_sent',
  'invite_accepted',
  'invite_declined',
  'change',
]);

// pages/count: samlede sidevisninger (usageBatch.js), én hendelse per minutt.
const DETAIL_KEYS = ['tab', 'subView', 'hours', 'date', 'projectName', 'entryId', 'path', 'accessLevel', 'pages', 'count'];

function text(value) {
  return String(value ?? '').trim();
}

export function emptyUsageSummary() {
  return {
    lastActiveAt: '',
    lastActiveIp: '',
    lastLoginAt: '',
    lastHourAt: '',
    lastHourSummary: '',
    lastEventAt: '',
    lastEventLabel: '',
  };
}

export function normalizeUsageSummary(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const summary = emptyUsageSummary();
  summary.lastActiveAt = text(source.lastActiveAt);
  summary.lastActiveIp = text(source.lastActiveIp);
  summary.lastLoginAt = text(source.lastLoginAt);
  summary.lastHourAt = text(source.lastHourAt);
  summary.lastHourSummary = text(source.lastHourSummary).slice(0, 180);
  summary.lastEventAt = text(source.lastEventAt);
  summary.lastEventLabel = text(source.lastEventLabel).slice(0, 180);
  return summary;
}

export function sanitizeIp(value) {
  const raw = text(value).replace(/^::ffff:/, '');
  if (!raw || raw.length > 64) return '';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(raw)) {
    const parts = raw.split('.').map((part) => Number(part));
    if (parts.every((part) => part >= 0 && part <= 255)) return raw;
    return '';
  }
  if (/^[0-9a-f:]+$/i.test(raw) && raw.includes(':')) return raw.toLowerCase();
  return '';
}

export function clientIpFromHeaders(headers = {}) {
  const forwarded = headers['x-forwarded-for'] || headers['x-appengine-user-ip'] || '';
  const first = String(forwarded).split(',')[0];
  return sanitizeIp(first) || sanitizeIp(headers['x-real-ip']) || '';
}

function cleanDetail(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const detail = {};
  for (const key of DETAIL_KEYS) {
    if (source[key] == null || source[key] === '') continue;
    if (key === 'hours') {
      const hours = Number(source[key]);
      if (Number.isFinite(hours)) detail.hours = Math.round(hours * 100) / 100;
      continue;
    }
    if (key === 'count') {
      const count = Math.round(Number(source[key]));
      if (Number.isFinite(count) && count > 0) detail.count = Math.min(count, 1000);
      continue;
    }
    detail[key] = text(source[key]).slice(0, 120);
  }
  return detail;
}

export function usageEventLabel(type, detail = {}) {
  if (type === 'login') return 'Logget inn';
  if (type === 'active') return 'Aktiv i ProTop';
  if (type === 'navigation') {
    const tab = text(detail.pages || detail.tab || detail.path);
    return tab ? `Åpnet ${tab}` : 'Byttet side';
  }
  if (type === 'hour') {
    const hours = detail.hours != null ? `${detail.hours} t` : 'Timer';
    const date = text(detail.date);
    const project = text(detail.projectName);
    return [hours, date, project].filter(Boolean).join(' · ') || 'Registrerte timer';
  }
  if (type === 'hour_deleted') return 'Slettet timeføring';
  if (type === 'invite_sent') return 'Invitasjon sendt';
  if (type === 'invite_accepted') return 'Invitasjon godtatt';
  if (type === 'invite_declined') return 'Invitasjon avslått';
  if (type === 'change') return 'Oppdaterte opplysninger';
  return 'Hendelse';
}

export function normalizeUsageEvent(input, {
  at = '',
  ip = '',
  userAgent = '',
  actorUid = '',
} = {}) {
  const type = text(input?.type);
  if (!USAGE_TYPES.has(type)) return null;
  const stamp = text(at) || new Date().toISOString();
  const detail = cleanDetail(input?.detail);
  const summary = text(input?.summary).slice(0, 180) || usageEventLabel(type, detail);
  return {
    type,
    at: stamp,
    summary,
    detail,
    ip: sanitizeIp(ip),
    userAgent: text(userAgent).slice(0, 180),
    actorUid: text(actorUid),
    companyId: text(input?.companyId),
    employeeId: text(input?.employeeId),
  };
}

export function applyUsageSummary(summary, event) {
  const next = normalizeUsageSummary(summary);
  if (!event?.at) return next;
  next.lastEventAt = event.at;
  next.lastEventLabel = text(event.summary).slice(0, 180);
  if (event.type === 'active' || event.type === 'login' || event.type === 'navigation') {
    next.lastActiveAt = event.at;
    if (event.ip) next.lastActiveIp = event.ip;
  }
  if (event.type === 'login') next.lastLoginAt = event.at;
  if (event.type === 'hour') {
    next.lastHourAt = event.at;
    next.lastHourSummary = text(event.summary).slice(0, 180);
    next.lastActiveAt = event.at;
    if (event.ip) next.lastActiveIp = event.ip;
  }
  if (event.type === 'hour_deleted') {
    next.lastActiveAt = event.at;
    if (event.ip) next.lastActiveIp = event.ip;
  }
  return next;
}

export function formatUsageStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function usageSummaryLines(summary) {
  const row = normalizeUsageSummary(summary);
  return [
    { id: 'active', label: 'Sist aktiv', value: formatUsageStamp(row.lastActiveAt) },
    { id: 'ip', label: 'IP-adresse', value: row.lastActiveIp },
    { id: 'login', label: 'Sist innlogget', value: formatUsageStamp(row.lastLoginAt) },
    { id: 'hour', label: 'Sist registrert time', value: [formatUsageStamp(row.lastHourAt), row.lastHourSummary].filter(Boolean).join(' · ') },
    { id: 'event', label: 'Siste hendelse', value: [formatUsageStamp(row.lastEventAt), row.lastEventLabel].filter(Boolean).join(' · ') },
  ].filter((line) => line.value);
}
