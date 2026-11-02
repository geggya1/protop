/**
 * Samler teknisk info i bakgrunnen, så en bruker uten teknisk kunnskap
 * slipper å forklare det: konsollfeil, feilede nettverkskall, siste steg
 * (sider og knapper), nettleser, skjerm og versjon.
 *
 * installDiagnostics() kalles én gang ved oppstart. collectDiagnostics()
 * kalles når en sak sendes. Alt vaskes for tokens og nøkler på serveren
 * (src/helpdesk/triage.js → sanitizeDiagnostics) og her.
 */
import { Platform, Dimensions, PixelRatio } from 'react-native';
import Constants from 'expo-constants';
import { APP_BUILD_ID } from '../constants/build';
import { redactSecrets, stripUrl } from './triage';

const MAX = { console: 60, network: 40, crumbs: 40 };
const state = { console: [], network: [], crumbs: [], installed: false };

const APP_VERSION = String(Constants?.expoConfig?.version || Constants?.manifest?.version || '2.0.0');

function push(list, row, max) {
  const last = list[list.length - 1];
  if (last && last.message && last.message === row.message && last.level === row.level) {
    last.count = (last.count || 1) + 1;
    last.atMs = row.atMs;
    return;
  }
  list.push(row);
  if (list.length > max) list.splice(0, list.length - max);
}

function stringify(arg) {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\n${String(arg.stack).split('\n').slice(1, 4).join('\n')}` : ''}`;
  if (typeof arg === 'string') return arg;
  try { return JSON.stringify(arg).slice(0, 400); } catch { return String(arg); }
}

export function recordConsole(level, args, source = '') {
  const message = redactSecrets(Array.from(args || []).map(stringify).join(' ')).slice(0, 800);
  if (!message) return;
  // Støy fra utviklingsverktøy og helpdesken selv tas ikke med.
  if (/Download the React DevTools|\[HMR\]|webpack|helpdesk-diagnostics/i.test(message)) return;
  push(state.console, { level, message, source, count: 1, atMs: Date.now() }, MAX.console);
}

export function recordNetwork({ method = 'GET', url = '', status = 0, ok = false, durationMs = null, error = '' }) {
  const clean = stripUrl(url);
  if (!clean || /google-analytics|doubleclick|sentry|hot-update|\.map$/i.test(clean)) return;
  // Vellykkede kall lagres ikke, bare de som feilet.
  if (ok) return;
  push(state.network, {
    method: String(method).toUpperCase(), url: clean, status, ok, durationMs, error: redactSecrets(String(error || '')).slice(0, 200), atMs: Date.now(),
  }, MAX.network);
}

export function recordBreadcrumb(type, label) {
  // Ikon-fonter gir tegn i privat område (U+E000–U+F8FF), som blir □ i e-post.
  const text = redactSecrets(String(label || '')).replace(/[-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!text) return;
  const last = state.crumbs[state.crumbs.length - 1];
  if (last && last.label === text) return;
  state.crumbs.push({ type, label: text, atMs: Date.now() });
  if (state.crumbs.length > MAX.crumbs) state.crumbs.splice(0, state.crumbs.length - MAX.crumbs);
}

function installWeb() {
  const w = window;
  for (const level of ['error', 'warn']) {
    const original = console[level];
    console[level] = function patched(...args) {
      try { recordConsole(level, args); } catch { /* ignore */ }
      return original.apply(this, args);
    };
  }
  w.addEventListener('error', (event) => {
    if (event?.target && event.target !== w && event.target.tagName) {
      recordConsole('error', [`Kunne ikke laste ${event.target.tagName.toLowerCase()}: ${stripUrl(event.target.src || event.target.href || '')}`]);
      return;
    }
    recordConsole('error', [event?.error || event?.message || 'Ukjent feil'], event?.filename || '');
  }, true);
  w.addEventListener('unhandledrejection', (event) => {
    recordConsole('error', ['Unhandled promise:', event?.reason]);
  });
  if (typeof w.fetch === 'function') {
    const originalFetch = w.fetch.bind(w);
    w.fetch = async (input, init) => {
      const started = Date.now();
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = init?.method || input?.method || 'GET';
      try {
        const res = await originalFetch(input, init);
        if (!res.ok) recordNetwork({ method, url, status: res.status, ok: false, durationMs: Date.now() - started });
        return res;
      } catch (error) {
        recordNetwork({ method, url, status: 0, ok: false, durationMs: Date.now() - started, error: error?.message || 'nettverksfeil' });
        throw error;
      }
    };
  }
  const XHR = w.XMLHttpRequest;
  if (XHR?.prototype?.open) {
    const open = XHR.prototype.open;
    const send = XHR.prototype.send;
    XHR.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__hd = { method, url, started: 0 };
      return open.call(this, method, url, ...rest);
    };
    XHR.prototype.send = function patchedSend(...args) {
      if (this.__hd) {
        this.__hd.started = Date.now();
        this.addEventListener('loadend', () => {
          const { method, url, started } = this.__hd || {};
          if (this.status === 0 || this.status >= 400) {
            recordNetwork({ method, url, status: this.status, ok: false, durationMs: Date.now() - started, error: this.status === 0 ? 'avbrutt eller blokkert' : '' });
          }
        });
      }
      return send.apply(this, args);
    };
  }
  const onNav = () => recordBreadcrumb('side', w.location?.pathname || '');
  const { pushState, replaceState } = w.history || {};
  if (pushState) {
    w.history.pushState = function patchedPush(...args) { const r = pushState.apply(this, args); onNav(); return r; };
    w.history.replaceState = function patchedReplace(...args) { const r = replaceState.apply(this, args); onNav(); return r; };
  }
  w.addEventListener('popstate', onNav);
  w.document?.addEventListener('click', (event) => {
    const el = event.target?.closest?.('button,[role="button"],a,[role="tab"],[role="menuitem"]');
    if (!el) return;
    const label = el.getAttribute('aria-label') || el.innerText || el.textContent || '';
    if (label && label.length < 80) recordBreadcrumb('klikk', label);
  }, true);
  onNav();
}

function installNative() {
  const handler = global.ErrorUtils?.getGlobalHandler?.();
  if (handler && global.ErrorUtils?.setGlobalHandler) {
    global.ErrorUtils.setGlobalHandler((error, isFatal) => {
      try { recordConsole('error', [isFatal ? 'Krasj:' : 'Feil:', error]); } catch { /* ignore */ }
      handler(error, isFatal);
    });
  }
  for (const level of ['error', 'warn']) {
    const original = console[level];
    console[level] = (...args) => {
      try { recordConsole(level, args); } catch { /* ignore */ }
      return original(...args);
    };
  }
}

export function installDiagnostics() {
  if (state.installed) return;
  state.installed = true;
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') installWeb();
    else installNative();
  } catch { /* må aldri stoppe appen */ }
}

function browserName(ua) {
  const m = ua.match(/(Edg|OPR|Chrome|Firefox|Version)\/(\d+)/);
  if (!m) return '';
  const name = { Edg: 'Edge', OPR: 'Opera', Version: /Safari/.test(ua) ? 'Safari' : 'Browser' }[m[1]] || m[1];
  return `${name} ${m[2]}`;
}

function osName(ua) {
  if (/iPhone|iPad|iPod/.test(ua)) return `iOS ${(ua.match(/OS (\d+[_\d]*)/) || [])[1]?.replace(/_/g, '.') || ''}`.trim();
  if (/Android/.test(ua)) return `Android ${(ua.match(/Android (\d+(\.\d+)?)/) || [])[1] || ''}`.trim();
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

/** Siste side brukeren var på før hjelpesenteret (der problemet som regel er). */
function previousPage(current) {
  const here = String(current || '');
  for (let i = state.crumbs.length - 1; i >= 0; i -= 1) {
    const c = state.crumbs[i];
    if (c.type !== 'side') continue;
    if (c.label === here || /\/(apper|more)\/help\b|\/hjelp\b/.test(c.label)) continue;
    return c.label;
  }
  return '';
}

/** Øyeblikksbilde som sendes med saken. `page` kommer fra skallet (fane, bedrift …). */
export function collectDiagnostics(page = {}) {
  const win = Dimensions.get('window');
  const scr = Dimensions.get('screen');
  const env = {
    appVersion: APP_VERSION,
    buildId: APP_BUILD_ID,
    platform: Platform.OS,
    pixelRatio: PixelRatio.get(),
    viewport: `${Math.round(win.width)}x${Math.round(win.height)}`,
    screen: `${Math.round(scr.width)}x${Math.round(scr.height)}`,
  };
  let path = page.path || '';
  let title = page.title || '';
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const nav = window.navigator || {};
    const ua = String(nav.userAgent || '');
    Object.assign(env, {
      userAgent: ua,
      browser: browserName(ua),
      os: osName(ua),
      language: nav.language || '',
      online: nav.onLine !== false,
      cookiesEnabled: nav.cookieEnabled !== false,
      touch: (nav.maxTouchPoints || 0) > 0,
      memoryMb: nav.deviceMemory ? nav.deviceMemory * 1024 : null,
      connection: nav.connection?.effectiveType || '',
      standalone: !!(window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone),
      darkMode: !!window.matchMedia?.('(prefers-color-scheme: dark)').matches,
      screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    });
    path = path || window.location?.pathname || '';
    title = title || document?.title || '';
  } else {
    env.os = `${Platform.OS} ${Platform.Version || ''}`.trim();
  }
  try { env.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* ignore */ }
  return {
    capturedAtMs: Date.now(),
    page: { ...page, path, title, from: page.from || previousPage(path) },
    env,
    console: state.console.slice(-40),
    network: state.network.slice(-25),
    breadcrumbs: state.crumbs.slice(-25),
  };
}

/** For testing og demo. */
export function _diagnosticsState() {
  return state;
}
