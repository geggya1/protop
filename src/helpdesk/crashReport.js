/**
 * Krasjrapporter: form, signatur og grenser. Ren logikk uten Firebase, så den kan testes
 * og brukes både i appen (crashReporter.js) og i helpdesken (service.js → agentCrashes).
 *
 * En rapport skrives til Firestore-samlingen `crashReports` av den innloggede brukeren
 * (firestore.rules validerer feltene). Bare helpdesk-teamet leser dem, via helpdesk-kallet.
 */
import { redactSecrets } from './triage.js';

export const CRASH_COLLECTION = 'crashReports';
export const CRASH_KINDS = ['error', 'unhandledrejection', 'render', 'native'];
export const CRASH_LIMITS = {
  message: 1000,
  stack: 6000,
  componentStack: 3000,
  route: 200,
  url: 300,
  userAgent: 300,
  buildId: 80,
  appVersion: 40,
  signature: 200,
  companyId: 128,
};
/** Felter reglene tillater (se firestore.rules → crashReports). */
export const CRASH_FIELDS = [
  'uid', 'kind', 'fatal', 'message', 'stack', 'componentStack', 'route', 'url', 'userAgent',
  'platform', 'appVersion', 'buildId', 'signature', 'companyId', 'createdAtMs', 'expireAt', 'count',
];
/** Rapporter slettes etter 30 dager (Firestore TTL på expireAt). */
export const CRASH_RETENTION_DAYS = 30;

const MAX_PER_SESSION = 20;
const SAME_SIGNATURE_MS = 5 * 60 * 1000;

// Støy som ikke er feil i appen: nettleserutvidelser, ResizeObserver og avbrutte kall.
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /Non-Error promise rejection captured/i,
  /AbortError|The user aborted a request/i,
];

function clip(value, max) {
  const s = redactSecrets(String(value == null ? '' : value));
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Fjerner spørrestreng og fragment, og bruker bare stien for egne adresser. */
export function cleanUrl(url) {
  const s = String(url || '');
  if (!s) return '';
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`;
  } catch {
    return s.split(/[?#]/)[0];
  }
}

function errorParts(error) {
  if (error instanceof Error || (error && typeof error === 'object' && ('message' in error || 'stack' in error))) {
    const name = error.name && error.name !== 'Error' ? `${error.name}: ` : '';
    return { message: `${name}${error.message || ''}`.trim() || String(error), stack: String(error.stack || '') };
  }
  if (typeof error === 'string') return { message: error, stack: '' };
  try {
    return { message: JSON.stringify(error), stack: '' };
  } catch {
    return { message: String(error), stack: '' };
  }
}

/** Første linje i stacken som peker på appens kode (ikke på React eller bundleren). */
function topFrame(stack) {
  const lines = String(stack || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const frame = lines.find((l) => /^at |@/.test(l) && !/react-dom|react-native-web|metro|__d\b|node_modules/.test(l))
    || lines.find((l) => /^at |@/.test(l)) || '';
  // Bundle-hash og linje/kolonne varierer mellom bygg; navnet på funksjonen er stabilt.
  return frame.replace(/\(.*\)$/, '').replace(/@.*$/, '').replace(/^at\s+/, '').slice(0, 80);
}

/** Samme feil får samme signatur, uavhengig av tall og id-er i meldingen. */
export function crashSignature(kind, message, stack) {
  const msg = String(message || '')
    .replace(/[0-9a-f]{8,}/gi, '#')
    .replace(/\d+/g, '#')
    .replace(/(["'«]).*?(["'»])/g, '$1…$2')
    .slice(0, 140);
  return `${kind}|${msg}|${topFrame(stack)}`.slice(0, CRASH_LIMITS.signature);
}

export function isNoise(message) {
  const m = String(message || '');
  return !m || NOISE.some((re) => re.test(m));
}

/**
 * Bygger rapporten som skrives til Firestore. Returnerer null for støy.
 * ctx: { kind, fatal, componentStack, route, url, userAgent, platform, appVersion, buildId,
 *        companyId, uid, nowMs }
 */
export function buildCrashReport(error, ctx = {}) {
  const kind = CRASH_KINDS.includes(ctx.kind) ? ctx.kind : 'error';
  const { message, stack } = errorParts(error);
  if (isNoise(message)) return null;
  const nowMs = Number(ctx.nowMs) || Date.now();
  const report = {
    uid: String(ctx.uid || ''),
    kind,
    fatal: !!ctx.fatal,
    message: clip(message, CRASH_LIMITS.message),
    stack: clip(stack, CRASH_LIMITS.stack),
    componentStack: clip(ctx.componentStack || '', CRASH_LIMITS.componentStack),
    route: clip(ctx.route || '', CRASH_LIMITS.route),
    url: clip(cleanUrl(ctx.url), CRASH_LIMITS.url),
    userAgent: clip(ctx.userAgent || '', CRASH_LIMITS.userAgent),
    platform: ['web', 'ios', 'android'].includes(ctx.platform) ? ctx.platform : 'web',
    appVersion: clip(ctx.appVersion || '', CRASH_LIMITS.appVersion),
    buildId: clip(ctx.buildId || '', CRASH_LIMITS.buildId),
    signature: crashSignature(kind, message, stack),
    companyId: clip(ctx.companyId || '', CRASH_LIMITS.companyId),
    createdAtMs: nowMs,
    expireAt: new Date(nowMs + CRASH_RETENTION_DAYS * 24 * 3600 * 1000),
    count: 1,
  };
  return report;
}

/** Holder styr på hva som er sendt i økten: høyst 20 rapporter, og samme feil høyst hvert 5. min. */
export function createCrashThrottle({ maxPerSession = MAX_PER_SESSION, sameSignatureMs = SAME_SIGNATURE_MS } = {}) {
  let sent = 0;
  const lastBySignature = new Map();
  return {
    allow(signature, nowMs = Date.now()) {
      if (sent >= maxPerSession) return false;
      const last = lastBySignature.get(signature);
      if (last !== undefined && nowMs - last < sameSignatureMs) return false;
      lastBySignature.set(signature, nowMs);
      sent += 1;
      return true;
    },
    get sent() { return sent; },
  };
}

/** Grupperer rapporter per signatur for helpdesken (nyeste først). */
export function groupCrashReports(rows = []) {
  const groups = new Map();
  for (const r of rows) {
    if (!r || !r.signature) continue;
    let g = groups.get(r.signature);
    if (!g) {
      g = {
        signature: r.signature,
        kind: r.kind,
        message: r.message,
        count: 0,
        fatal: 0,
        users: new Set(),
        companies: new Set(),
        platforms: new Set(),
        builds: new Set(),
        firstAtMs: r.createdAtMs,
        lastAtMs: r.createdAtMs,
        sample: null,
      };
      groups.set(r.signature, g);
    }
    g.count += Number(r.count) || 1;
    if (r.fatal) g.fatal += 1;
    if (r.uid) g.users.add(r.uid);
    if (r.companyId) g.companies.add(r.companyId);
    if (r.platform) g.platforms.add(r.platform);
    if (r.buildId) g.builds.add(r.buildId);
    g.firstAtMs = Math.min(g.firstAtMs, r.createdAtMs || g.firstAtMs);
    if (!g.sample || (r.createdAtMs || 0) >= (g.lastAtMs || 0)) {
      g.lastAtMs = Math.max(g.lastAtMs || 0, r.createdAtMs || 0);
      g.sample = {
        stack: r.stack || '',
        componentStack: r.componentStack || '',
        route: r.route || '',
        url: r.url || '',
        userAgent: r.userAgent || '',
        appVersion: r.appVersion || '',
        buildId: r.buildId || '',
      };
    }
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      users: g.users.size,
      companies: g.companies.size,
      platforms: [...g.platforms],
      builds: [...g.builds].slice(-5),
    }))
    .sort((a, b) => (b.lastAtMs || 0) - (a.lastAtMs || 0));
}
