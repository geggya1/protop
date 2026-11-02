/**
 * Helpdesk: regelbasert triage og vasking av teknisk info.
 * Brukes alltid på serveren, også når Gemini svarer, så saken får
 * kategori, modul og prioritet uansett. Ren JS (node-testbar).
 */

import { CATEGORIES, LIMITS, MODULES, PRIORITIES } from './model.js';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const KEY_RE = /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{16,}|re_[A-Za-z0-9]{16,}|xkeysib-[A-Za-z0-9-]{16,}|SG\.[A-Za-z0-9_.-]{16,})\b/g;
const BEARER_RE = /\b(Bearer|token|apikey|api_key|key|password|passord|secret)(["':=\s]+)([^\s"'&,;]{6,})/gi;
const FNR_RE = /\b\d{6}\s?\d{5}\b/g;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;

/** Fjerner hemmeligheter og fødselsnummer fra tekst som lagres som teknisk info. */
export function redactSecrets(text, { keepEmails = false } = {}) {
  let out = String(text == null ? '' : text);
  out = out.replace(JWT_RE, '[token]');
  out = out.replace(KEY_RE, '[nøkkel]');
  out = out.replace(BEARER_RE, (_, k, sep) => `${k}${sep}[skjult]`);
  out = out.replace(FNR_RE, '[fødselsnr]');
  out = out.replace(CARD_RE, (m) => (m.replace(/\D/g, '').length >= 13 ? '[kortnr]' : m));
  if (!keepEmails) out = out.replace(EMAIL_RE, '[e-post]');
  return out;
}

/** URL uten spørrestreng og fragment (de kan inneholde tokens). */
export function stripUrl(url) {
  const raw = String(url || '');
  try {
    const u = new URL(raw, 'https://protop.no');
    const local = raw.startsWith('/') && !raw.startsWith('//');
    return local ? u.pathname : `${u.origin}${u.pathname}`;
  } catch {
    return raw.split(/[?#]/)[0].slice(0, 300);
  }
}

function str(value, max) {
  return redactSecrets(String(value == null ? '' : value)).slice(0, max);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Teknisk info fra klienten: avgrenset, vasket og uten hemmeligheter.
 * Alt er valgfritt. Ukjente felt kastes.
 */
export function sanitizeDiagnostics(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const env = raw.env && typeof raw.env === 'object' ? raw.env : {};
  const console = Array.isArray(raw.console) ? raw.console : [];
  const network = Array.isArray(raw.network) ? raw.network : [];
  const crumbs = Array.isArray(raw.breadcrumbs) ? raw.breadcrumbs : [];
  return {
    capturedAtMs: num(raw.capturedAtMs) || Date.now(),
    page: {
      path: stripUrl(raw.page?.path || ''),
      title: str(raw.page?.title, 120),
      tab: str(raw.page?.tab, 40),
      subView: str(raw.page?.subView, 60),
      workspace: str(raw.page?.workspace, 20),
      companyName: str(raw.page?.companyName, 120),
    },
    env: {
      appVersion: str(env.appVersion, 40),
      buildId: str(env.buildId, 60),
      platform: str(env.platform, 20),
      os: str(env.os, 60),
      browser: str(env.browser, 60),
      userAgent: str(env.userAgent, 300),
      language: str(env.language, 20),
      timezone: str(env.timezone, 60),
      screen: str(env.screen, 30),
      viewport: str(env.viewport, 30),
      pixelRatio: num(env.pixelRatio),
      online: env.online === false ? false : env.online === true ? true : null,
      standalone: env.standalone === true,
      touch: env.touch === true,
      memoryMb: num(env.memoryMb),
      connection: str(env.connection, 20),
      cookiesEnabled: env.cookiesEnabled === false ? false : env.cookiesEnabled === true ? true : null,
      darkMode: env.darkMode === true,
    },
    console: console.slice(-LIMITS.consoleEntries).map((row) => ({
      level: ['error', 'warn', 'info', 'log'].includes(row?.level) ? row.level : 'log',
      message: str(row?.message, 600),
      source: str(stripUrl(row?.source || ''), 200),
      count: Math.min(999, Math.max(1, num(row?.count) || 1)),
      atMs: num(row?.atMs),
    })).filter((row) => row.message),
    network: network.slice(-LIMITS.networkEntries).map((row) => ({
      method: str(row?.method, 10).toUpperCase() || 'GET',
      url: str(stripUrl(row?.url || ''), 300),
      status: num(row?.status),
      ok: row?.ok === true,
      durationMs: num(row?.durationMs),
      error: str(row?.error, 200),
      atMs: num(row?.atMs),
    })).filter((row) => row.url),
    breadcrumbs: crumbs.slice(-LIMITS.breadcrumbs).map((row) => ({
      type: str(row?.type, 20) || 'nav',
      label: str(row?.label, 160),
      atMs: num(row?.atMs),
    })).filter((row) => row.label),
  };
}

export function diagnosticsSummary(diag) {
  if (!diag) return { errors: 0, warnings: 0, failedRequests: 0 };
  return {
    errors: (diag.console || []).filter((c) => c.level === 'error').length,
    warnings: (diag.console || []).filter((c) => c.level === 'warn').length,
    failedRequests: (diag.network || []).filter((n) => !n.ok).length,
  };
}

/* ─────────── Regelbasert triage ─────────── */

const fold = (text) => String(text || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/ø/g, 'o')
  .replace(/æ/g, 'ae')
  .replace(/å/g, 'a');

/** Ordene i reglene står i grunnform. Godta vanlige bøyninger: faktura → fakturaen, timeliste → timelisten. */
const inflect = ([id, re]) => [
  id,
  new RegExp(re.source.replace(/\)\\b$/, ')(?:en|et|er|ene|ane|a|s|n|ing|ingen|te)?\\b'), re.flags),
];

const CATEGORY_RULES = [
  ['bug', /\b(feil|feilmelding|bug|error|krasj|krasjer|crash|hvit skjerm|blank|tom side|henger|laster ikke|lastes ikke|fungerer ikke|virker ikke|funker ikke|reagerer ikke|odelagt|broken|exception|500|404|forsvant|forsvunnet|mistet|borte)\b/],
  ['account', /\b(logg(e)? inn|innlogging|passord|glemt|tilbakestill|to-?trinn|2fa|bankid|e-?post(adresse)? (bekreft|endre)|bekreft(e|else)|slette (konto|meg)|konto(en)?|login|sign ?in|password)\b/],
  ['access', /\b(tilgang|invit(er|asjon)|ansatt(e)?|rolle|rettighet|ser ikke (modul|menyen|siden)|mangler (modul|menyen)|admin|leder|godkjenner|access|permission)\b/],
  ['feature', /\b(onske|onsker|forslag|savner|kunne dere|hadde vaert fint|feature|request|ide)\b/],
  ['billing', /\b(abonnement|pris|betal(e|ing)|kort|kvittering fra protop|faktura fra protop|trekk|refusjon|oppsigelse|subscription|billing|poweroffice|kid)\b/],
  ['data', /\b(eksport(ere)?|import(ere)?|slett(e|ing)|personvern|gdpr|mine data|backup|gjenopprett|duplikat|feil tall|feil sum|data)\b/],
  ['question', /\b(hvordan|hvor finner|hva er|kan jeg|hvorfor|how do|where)\b/],
].map(inflect);

const MODULE_RULES = [
  ['poweroffice', /\b(poweroffice|power office|go-?klient)\b/],
  ['okonomi', /\b(faktura|fakturer|kid|purring|inkasso|utlegg|okonomi|indeksregulering|indeks|fakturagrunnlag|kreditnota)\b/],
  ['arbeid', /\b(timeliste|timer|timeforing|timesaldo|godkjenn(e|ing) timer|stemple|overtid|timerapport)\b/],
  ['fravaer', /\b(fravaer|ferie|syk(emelding|dom)?|egenmelding|permisjon|avspasering)\b/],
  ['hr', /\b(hr|medarbeidersamtale|rekruttering|lonn|arbeidsavtale|personell|hms-kort)\b/],
  ['anbud', /\b(anbud|doffin|ted|tilbud|konkurranse|kgv|mercell|eu-supply)\b/],
  ['kontrakt', /\b(kontrakt|avtale(r)?)\b/],
  ['kunder', /\b(kunde|kunder|kunderegister)\b/],
  ['projects', /\b(prosjekt(er)?)\b/],
  ['iso', /\b(iso|k-?hms|avvik|internrevisjon|risiko|beredskap)\b/],
  ['utstyr', /\b(utstyr|maskin|verktoy)\b/],
  ['kjorebok', /\b(kjorebok|kilometer|km-?godtgjorelse|kjoring)\b/],
  ['ansatte', /\b(ansatt|ansatte|invitere|invitasjon)\b/],
  ['login', /\b(logg(e)? inn|innlogging|passord|google-?konto|microsoft-?konto|bekreft e-?post)\b/],
  ['chat', /\b(chat|melding(er)?|e-?post|outlook|innboks)\b/],
  ['plan', /\b(kalender|avtale i kalender|mote)\b/],
  ['mobile', /\b(iphone|android|mobil(en)?|app(en)? pa telefon|hjemskjerm|installer)\b/],
].map(inflect);

const URGENT_RE = /\b(haster|akutt|kritisk|alle (ansatte|brukere)|ingen kan|hele firmaet|kommer ikke inn|lonn(skjoring)? i dag|frist (i dag|i morgen)|tapt data|data(ene)? er borte|forsvunnet)\b/;
const HIGH_RE = /\b(kommer ikke videre|stoppet|blokkert|fakturaen (gar|går) ikke|kan ikke sende|kan ikke logge inn|mistet)\b/;
const ANGRY_RE = /\b(elendig|ubrukelig|frustrert|irritert|sint|helt hapolost|katastrofe|uakseptabelt|!!+)/;

/** Rask triage uten AI. Returnerer forslag, ikke fasit. */
export function ruleTriage({ subject = '', body = '', diagnostics = null, category = '' } = {}) {
  const text = fold(`${subject}\n${body}`);
  let cat = CATEGORIES[category] && category !== 'other' ? category : '';
  if (!cat) {
    for (const [id, re] of CATEGORY_RULES) {
      if (re.test(text)) { cat = id; break; }
    }
  }
  const summary = diagnosticsSummary(diagnostics);
  if (!cat && (summary.errors > 0 || summary.failedRequests > 2)) cat = 'bug';
  let moduleId = 'general';
  for (const [id, re] of MODULE_RULES) {
    if (re.test(text)) { moduleId = id; break; }
  }
  if (moduleId === 'general' && diagnostics?.page?.tab && MODULES[diagnostics.page.tab]) {
    moduleId = diagnostics.page.tab;
  }
  let priority = 'normal';
  if (URGENT_RE.test(text)) priority = 'urgent';
  else if (HIGH_RE.test(text) || (cat === 'bug' && summary.errors >= 3)) priority = 'high';
  else if (cat === 'feature' || cat === 'question') priority = 'low';
  const sentiment = ANGRY_RE.test(`${subject} ${body}`.toLowerCase()) ? 'negative' : 'neutral';
  const tags = new Set();
  if (summary.errors) tags.add('konsollfeil');
  if (summary.failedRequests) tags.add('nettverksfeil');
  if (diagnostics?.env?.online === false) tags.add('offline');
  if (diagnostics?.env?.platform && diagnostics.env.platform !== 'web') tags.add(diagnostics.env.platform);
  if (diagnostics?.env?.standalone) tags.add('pwa');
  if (sentiment === 'negative') tags.add('misfornøyd');
  return {
    category: cat || 'question',
    module: moduleId,
    priority: PRIORITIES[priority] ? priority : 'normal',
    sentiment,
    tags: [...tags],
  };
}

/** Kort sammendrag av teknisk info til AI-prompt og e-post til teamet. */
export function diagnosticsDigest(diag, { maxConsole = 8, maxNetwork = 6 } = {}) {
  if (!diag) return 'Ingen teknisk info sendt med.';
  const lines = [];
  const env = diag.env || {};
  lines.push(`Side: ${diag.page?.path || '?'} (fane ${diag.page?.tab || '?'}${diag.page?.subView ? `/${diag.page.subView}` : ''}, ${diag.page?.workspace || '?'})`);
  lines.push(`App: ${env.appVersion || '?'} build ${env.buildId || '?'} · ${env.platform || '?'} · ${env.os || '?'} · ${env.browser || '?'}`);
  lines.push(`Skjerm ${env.screen || '?'} / vindu ${env.viewport || '?'} · språk ${env.language || '?'} · ${env.online === false ? 'OFFLINE' : 'online'}`);
  const errs = (diag.console || []).filter((c) => c.level === 'error' || c.level === 'warn').slice(-maxConsole);
  if (errs.length) {
    lines.push('Konsoll:');
    for (const c of errs) lines.push(`  [${c.level}]${c.count > 1 ? ` x${c.count}` : ''} ${c.message.slice(0, 300)}`);
  }
  const fails = (diag.network || []).filter((n) => !n.ok).slice(-maxNetwork);
  if (fails.length) {
    lines.push('Feilede kall:');
    for (const n of fails) lines.push(`  ${n.method} ${n.url} → ${n.status || n.error || 'nettverksfeil'}`);
  }
  const crumbs = (diag.breadcrumbs || []).slice(-6);
  if (crumbs.length) lines.push(`Siste steg: ${crumbs.map((c) => c.label).join(' → ')}`);
  return lines.join('\n');
}
