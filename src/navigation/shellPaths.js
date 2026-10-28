/**
 * Adresser for skallet på web: /hjem, /hjem/iso, /hjem/iso/avvik, /hjem/iso/avvik/:id.
 * Fanen og undersiden står i stien, så nettleserens tilbake og fram virker, og lenker kan deles og bokmerkes.
 * De viktigste detaljsidene har id-en som siste ledd (SHELL_DETAILS).
 * AppShell eier stien (pushState ved bytte, popstate ved tilbake). linking.js tolker den ved oppstart og tilbake.
 */

import { isFamilyProductMoreView } from './familyProduct.js';

export const SHELL_ROOT = '/hjem';

/** Faner med eget navn i adressen (resten bruker fane-id-en, som allerede er norsk). */
const TAB_SLUGS = {
  projects: 'prosjekt',
  notes: 'notater',
  mail: 'epost',
  chores: 'gjoremal',
  stars: 'stjerner',
  more: 'apper',
};

const KNOWN_TABS = new Set([
  'home', 'plan', 'notes', 'mail', 'chat', 'chores', 'stars', 'more',
  'selskap', 'underenheter', 'ansatte', 'hr', 'arbeid', 'timeliste', 'okonomi', 'kunder',
  'anbud', 'kontrakt', 'projects', 'moter', 'utstyr', 'iso', 'skjema',
]);

const SLUG_TABS = Object.fromEntries(Object.entries(TAB_SLUGS).map(([tab, slug]) => [slug, tab]));

const clean = (v) => String(v ?? '').trim();

/**
 * Detaljsider med egen adresse (UX-20): id-en står sist, etter listen den hører til.
 * /hjem/prosjekt/:id, /hjem/okonomi/faktura/:id, /hjem/ansatte/:id, /hjem/iso/avvik/:id.
 * list er navnet på listen («‹ Prosjekter»), thing brukes når lenken ikke kan åpnes.
 */
export const SHELL_DETAILS = {
  project: { tab: 'projects', subView: null, list: 'Prosjekter', thing: 'prosjektet' },
  invoice: { tab: 'okonomi', subView: 'faktura', list: 'Fakturaer', thing: 'fakturaen' },
  employee: { tab: 'ansatte', subView: null, list: 'Ansatte', thing: 'personen' },
  finding: { tab: 'iso', subView: 'avvik', list: 'Avvik og forbedring', thing: 'saken' },
};

/** Detaljsiden som hører til fanen og undersiden, eller null. */
export function shellDetailKind(tab, subView = null) {
  const sub = clean(subView) || null;
  return Object.keys(SHELL_DETAILS).find((kind) => (
    SHELL_DETAILS[kind].tab === tab && SHELL_DETAILS[kind].subView === sub
  )) || null;
}

const decode = (v) => {
  if (!v) return null;
  try { return decodeURIComponent(v); } catch { return v; }
};

/**
 * Stien for en fane og underside, og en detalj når siden har adresse for den.
 * Hjem-fanen er /hjem uansett underside. Prosjekt og Ansatte har ingen undersider: neste ledd er id-en.
 */
export function shellPathFor(tab, subView = null, detail = null) {
  const t = clean(tab);
  if (!t || t === 'home' || !KNOWN_TABS.has(t)) return SHELL_ROOT;
  const root = `${SHELL_ROOT}/${TAB_SLUGS[t] || t}`;
  const id = clean(detail);
  if (shellDetailKind(t, null)) return id ? `${root}/${encodeURIComponent(id)}` : root;
  const sub = clean(subView);
  if (!sub) return root;
  const page = `${root}/${encodeURIComponent(sub)}`;
  return id && shellDetailKind(t, sub) ? `${page}/${encodeURIComponent(id)}` : page;
}

/**
 * Ett steg i samspillet mellom adressen og detaljsiden i modulen (useShellDetail).
 * seen: { url, open } fra forrige steg. urlId: id-en i adressen. openId: id-en modulen viser ('' = listen).
 * action: { type: 'open', id } eller { type: 'close' } når adressen er endret utenfra (lenke, tilbake/fram),
 * { type: 'report', id } når modulen har åpnet eller lukket en detalj selv, ellers null.
 */
export function detailSyncStep(seen, { urlId = '', openId = '' } = {}) {
  const url = clean(urlId);
  const open = clean(openId);
  const next = { url, open };
  if (url !== (seen?.url ?? '')) {
    if (url === open) return { seen: next, action: null };
    return { seen: next, action: url ? { type: 'open', id: url } : { type: 'close' } };
  }
  if (open !== (seen?.open ?? '') && open !== url) return { seen: next, action: { type: 'report', id: open } };
  return { seen: next, action: null };
}

/**
 * Tolker /hjem[/fane[/underside[/id]]] (med eller uten skråstrek til slutt og spørring). null = ikke en skallsti.
 * Svar: { tab, subView } og detail når adressen peker på en detaljside.
 */
export function parseShellPath(path) {
  const raw = clean(path).split(/[?#]/)[0].replace(/\/+$/, '');
  const m = raw.match(/^\/?hjem(?:\/([^/]+))?(?:\/([^/]+))?(?:\/([^/]+))?$/i);
  if (!m) return null;
  if (!m[1]) return { tab: 'home', subView: null };
  const slug = decode(m[1].toLowerCase());
  const tab = SLUG_TABS[slug] || slug;
  const sub = decode(m[2]);
  const third = decode(m[3]);
  if (!KNOWN_TABS.has(tab)) return third ? null : { tab: 'home', subView: null };
  // Prosjekt og Ansatte: /hjem/prosjekt/:id
  if (shellDetailKind(tab, null)) {
    if (third) return null;
    return sub ? { tab, subView: null, detail: sub } : { tab, subView: null };
  }
  // Familiesidene (/hjem/apper/spill …) finnes ikke i ProTop-bygget (L-35).
  if (tab === 'more' && isFamilyProductMoreView(sub)) return { tab: 'home', subView: null };
  if (third) return shellDetailKind(tab, sub) ? { tab, subView: sub, detail: third } : null;
  return { tab, subView: sub || null };
}

export function isShellPath(path) {
  return !!parseShellPath(path);
}

/** Spørringer som hører til én side. De følger ikke med til andre sider, ellers åpner en oppdatering den siden igjen. */
const PAGE_QUERY = [
  { tab: 'okonomi', subView: 'indeks', keys: ['indeksAvtale', 'indeksSak', 'indeksVis'] },
];

/** Spørringen som skal stå i adressen for fanen og undersiden. Andre siders spørringer fjernes. */
export function shellSearchFor(tab, subView, search = '') {
  const raw = clean(search).replace(/^\?/, '');
  if (!raw) return '';
  const params = new URLSearchParams(raw);
  let removed = false;
  for (const page of PAGE_QUERY) {
    if (page.tab === tab && page.subView === (subView || null)) continue;
    for (const key of page.keys) {
      if (!params.has(key)) continue;
      params.delete(key);
      removed = true;
    }
  }
  if (!removed) return `?${raw}`;
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/** Bedrift lander på selskapssiden når adressen bare er / eller /hjem. Personlig Hjem nås fra menyen. */
export function companyLandingTab(path, { company = false, allowed = true } = {}) {
  if (!company || !allowed) return null;
  const root = !clean(path).split(/[?#]/)[0].replace(/\/+$/, '');
  return root || parseShellPath(path)?.tab === 'home' ? 'selskap' : null;
}

/** Faner som bare finnes i Bedrift. */
const COMPANY_ONLY_TABS = new Set([
  'selskap', 'underenheter', 'ansatte', 'hr', 'arbeid', 'okonomi', 'kunder',
  'anbud', 'kontrakt', 'projects', 'utstyr', 'iso', 'skjema',
]);

/**
 * Stien etter et bytte med Privat/Bedrift (EGEN-04). Bryteren velger arbeidsområdet, og siden
 * følger med: en bedriftsside finnes ikke i Privat, så Privat starter på Hjem i stedet for
 * «Du er ikke i en bedrift». Sider som finnes begge steder (Kalender, Oppgaver …) blir stående.
 * null = behold stien.
 */
export function shellPathAfterSwitch(path, side) {
  const at = parseShellPath(path);
  if (!at || side !== 'personal') return null;
  return isCompanyOnlyTab(at.tab) ? SHELL_ROOT : null;
}

/** Fanen finnes bare i Bedrift. */
export function isCompanyOnlyTab(tab) {
  return COMPANY_ONLY_TABS.has(clean(tab));
}

/* Siste skallsti og nøkkelen til Hjem-ruten. Brukes av linking når Hjem får fokus igjen. */
let currentShellPath = SHELL_ROOT;
let homeRouteKey = '';
// Siden siden ble åpnet på. Overlever innloggingen, så en delt lenke (/hjem/iso/avvik) åpner riktig side etterpå.
let entryShellPath = null;

/** Husk skallstien siden ble åpnet på. Hjem alene huskes ikke: dit går innloggingen uansett. */
export function rememberEntryShellPath(path) {
  const p = parseShellPath(path);
  if (!p) return;
  currentShellPath = shellPathFor(p.tab, p.subView, p.detail);
  entryShellPath = currentShellPath === SHELL_ROOT ? null : currentShellPath;
}

/** Stien siden ble åpnet på, én gang. Brukes når innloggingen er ferdig. */
export function takeEntryShellPath() {
  const p = entryShellPath;
  entryShellPath = null;
  return p;
}

if (typeof window !== 'undefined' && window.location) rememberEntryShellPath(window.location.pathname);

export function setShellLocation(path) {
  if (isShellPath(path)) currentShellPath = path;
}

export function getShellLocation() {
  return currentShellPath;
}

/** Web: rydder adressen før skallet monteres i et annet arbeidsområde (se shellPathAfterSwitch). */
export function leaveShellPathForSwitch(side) {
  if (typeof window === 'undefined' || !window.location || !window.history?.replaceState) return null;
  const next = shellPathAfterSwitch(window.location.pathname, side);
  if (!next) return null;
  currentShellPath = next;
  try { window.history.replaceState({ ...(window.history.state || {}), shell: next }, '', next); } catch { /* ignore */ }
  return next;
}

export function setHomeRouteKey(key) {
  homeRouteKey = clean(key);
}

export function getHomeRouteKey() {
  return homeRouteKey;
}

/**
 * Navigasjonstilstand for en skallsti. Med Hjem-rutens nøkkel beholdes skallet montert når nettleseren
 * går tilbake (React Navigation tilbakestiller ellers roten med en ny nøkkel og laster alt på nytt).
 */
export function shellLinkState(path) {
  const parsed = parseShellPath(path);
  if (!parsed) return null;
  const key = getHomeRouteKey();
  return {
    routes: [{
      name: 'Home',
      ...(key ? { key } : {}),
      params: {
        openShell: { tab: parsed.tab, subView: parsed.subView, ...(parsed.detail ? { detail: parsed.detail } : {}) },
      },
    }],
  };
}

/** Stien React Navigation skal vise når Hjem har fokus: skallet eier den, så den endres ikke her. */
export function homePathForLinking(currentPath) {
  return isShellPath(currentPath) ? clean(currentPath).split(/[?#]/)[0] : getShellLocation();
}
