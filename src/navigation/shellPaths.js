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
  'anbud', 'kontrakt', 'projects', 'utstyr', 'iso', 'skjema',
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

/* Siste skallsti og nøkkelen til Hjem-ruten. Brukes av linking når Hjem får fokus igjen. */
let currentShellPath = SHELL_ROOT;
let homeRouteKey = '';

if (typeof window !== 'undefined' && window.location && isShellPath(window.location.pathname)) {
  const p = parseShellPath(window.location.pathname);
  currentShellPath = shellPathFor(p.tab, p.subView);
}

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
