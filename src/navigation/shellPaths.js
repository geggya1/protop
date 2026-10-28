/**
 * Adresser for skallet på web: /hjem, /hjem/iso, /hjem/iso/avvik.
 * Fanen og undersiden står i stien, så nettleserens tilbake og fram virker, og lenker kan deles og bokmerkes.
 * AppShell eier stien (pushState ved bytte, popstate ved tilbake). linking.js tolker den ved oppstart og tilbake.
 */

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

/** Stien for en fane og underside. Hjem-fanen er /hjem uansett underside. */
export function shellPathFor(tab, subView = null) {
  const t = clean(tab);
  if (!t || t === 'home' || !KNOWN_TABS.has(t)) return SHELL_ROOT;
  const slug = TAB_SLUGS[t] || t;
  const sub = clean(subView);
  return sub ? `${SHELL_ROOT}/${slug}/${encodeURIComponent(sub)}` : `${SHELL_ROOT}/${slug}`;
}

/** Tolker /hjem[/fane[/underside]] (med eller uten skråstrek til slutt og spørring). null = ikke en skallsti. */
export function parseShellPath(path) {
  const raw = clean(path).split(/[?#]/)[0].replace(/\/+$/, '');
  const m = raw.match(/^\/?hjem(?:\/([^/]+))?(?:\/([^/]+))?$/i);
  if (!m) return null;
  if (!m[1]) return { tab: 'home', subView: null };
  let slug = m[1].toLowerCase();
  try { slug = decodeURIComponent(slug); } catch { /* behold */ }
  const tab = SLUG_TABS[slug] || slug;
  if (!KNOWN_TABS.has(tab)) return { tab: 'home', subView: null };
  let sub = m[2] || null;
  if (sub) {
    try { sub = decodeURIComponent(sub); } catch { /* behold */ }
  }
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

/* Siste skallsti og nøkkelen til Hjem-ruten. Brukes av linking når Hjem får fokus igjen. */
let currentShellPath = SHELL_ROOT;
let homeRouteKey = '';
// Siden siden ble åpnet på. Overlever innloggingen, så en delt lenke (/hjem/iso/avvik) åpner riktig side etterpå.
let entryShellPath = null;

/** Husk skallstien siden ble åpnet på. Hjem alene huskes ikke: dit går innloggingen uansett. */
export function rememberEntryShellPath(path) {
  const p = parseShellPath(path);
  if (!p) return;
  currentShellPath = shellPathFor(p.tab, p.subView);
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
      params: { openShell: { tab: parsed.tab, subView: parsed.subView } },
    }],
  };
}

/** Stien React Navigation skal vise når Hjem har fokus: skallet eier den, så den endres ikke her. */
export function homePathForLinking(currentPath) {
  return isShellPath(currentPath) ? clean(currentPath).split(/[?#]/)[0] : getShellLocation();
}
