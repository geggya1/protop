/**
 * Sidevisninger i bruksloggen samles på klienten (EGEN-05). Ett kall per side ga 429 fra
 * recordUsage (grense per time) ved vanlig navigasjon, og hendelser gikk tapt.
 * Nå sendes én «navigation»-hendelse per minutt (eller når fanen skjules eller selskapet
 * byttes) med sidene som ble åpnet. Ren logikk; sending og tidtaker gis inn.
 */

export const NAVIGATION_FLUSH_MS = 60 * 1000;
/** Etter «for mange forespørsler»: vent før aktivitet logges igjen. */
export const USAGE_BACKOFF_MS = 15 * 60 * 1000;
const MAX_PAGES = 12;

function text(value) {
  return String(value ?? '').trim();
}

export function pageLabel(page) {
  return [text(page?.tab), text(page?.subView)].filter(Boolean).join(' › ');
}

/** Én hendelse for sidene i køen, eller null. Sidene står i rekkefølge, uten like naboer. */
export function navigationEvent(companyId, pages) {
  const list = (Array.isArray(pages) ? pages : []).filter((page) => pageLabel(page));
  if (!list.length) return null;
  const last = list[list.length - 1];
  const labels = list.slice(-MAX_PAGES).map(pageLabel);
  const joined = labels.join(', ');
  return {
    type: 'navigation',
    companyId: text(companyId),
    summary: `Åpnet ${joined}`.slice(0, 180),
    detail: {
      tab: text(last.tab),
      subView: text(last.subView),
      pages: joined.slice(0, 120),
      count: list.length,
    },
  };
}

export function isRateLimited(result) {
  const message = text(result?.error || result?.message);
  const code = text(result?.code);
  return code.includes('resource-exhausted') || /for mange forespørsler|resource-exhausted|429/i.test(message);
}

/**
 * send(event) → Promise. Tidtakeren kan byttes i tester.
 * add({ companyId, tab, subView }) legger siden i køen; flush() sender nå.
 */
export function createNavigationBatcher({
  send,
  flushMs = NAVIGATION_FLUSH_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  let companyId = '';
  let pages = [];
  let timer = null;
  let lastKey = '';

  function flush() {
    if (timer != null) clearTimer(timer);
    timer = null;
    const event = navigationEvent(companyId, pages);
    pages = [];
    if (!event) return Promise.resolve(null);
    return Promise.resolve(send(event)).catch(() => null);
  }

  function add(page) {
    const nextCompany = text(page?.companyId);
    const key = `${nextCompany}:${pageLabel(page)}`;
    if (!pageLabel(page) || key === lastKey) return false;
    lastKey = key;
    if (pages.length && nextCompany !== companyId) flush();
    companyId = nextCompany;
    pages.push({ tab: text(page.tab), subView: text(page.subView) });
    if (timer == null) timer = setTimer(() => { flush(); }, flushMs);
    return true;
  }

  return { add, flush, pending: () => pages.length };
}
