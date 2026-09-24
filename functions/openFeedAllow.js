/**
 * Allowlist for åpne feeds som ikke kan hentes direkte fra nettleseren (CORS).
 * Brukes av Cloud Function fetchOpenFeed. Ingen Firebase-import, så den kan testes rent.
 */

const RULES = [
  { host: 'www.vg.no', prefixes: ['/rss/'] },
  { host: 'vg.no', prefixes: ['/rss/'] },
  { host: 'services.dn.no', prefixes: ['/api/feed/'] },
  { host: 'e24.no', prefixes: ['/rss'] },
  { host: 'www.e24.no', prefixes: ['/rss'] },
  { host: 'query1.finance.yahoo.com', prefixes: ['/v8/finance/chart/'] },
  { host: 'query2.finance.yahoo.com', prefixes: ['/v8/finance/chart/'] },
];

export function validateOpenFeedUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || ''));
  } catch {
    const err = new Error('Ugyldig adresse');
    err.code = 'invalid-argument';
    throw err;
  }
  if (url.protocol !== 'https:') {
    const err = new Error('Bare https er tillatt');
    err.code = 'invalid-argument';
    throw err;
  }
  if (url.username || url.password || (url.port && url.port !== '443')) {
    const err = new Error('Ugyldig adresse');
    err.code = 'invalid-argument';
    throw err;
  }
  const rule = RULES.find((item) => item.host === url.hostname);
  if (!rule || !rule.prefixes.some((prefix) => url.pathname.startsWith(prefix))) {
    const err = new Error('Kilden er ikke tillatt');
    err.code = 'permission-denied';
    throw err;
  }
  if (url.hostname === 'query1.finance.yahoo.com' || url.hostname === 'query2.finance.yahoo.com') {
    const symbol = decodeURIComponent(url.pathname.split('/').pop() || '');
    if (!/^[A-Z0-9][A-Z0-9.^=-]{0,14}$/i.test(symbol)) {
      const err = new Error('Ugyldig aksjesymbol');
      err.code = 'invalid-argument';
      throw err;
    }
  }
  return url.toString();
}
