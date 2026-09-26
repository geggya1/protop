/** Offentlig filliste fra innleveringsportalen. Selve filene krever interesse hos portalen. */

function decode(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mercellTenderId(url) {
  const raw = String(url || '');
  const fromQuery = raw.match(/[?&]id=(\d{6,})/i);
  if (fromQuery) return fromQuery[1];
  const fromPath = raw.match(/mercell\.com\/(?:permalink\/)?(\d{6,})/i) || raw.match(/\/(\d{6,})\//);
  return fromPath ? fromPath[1] : '';
}

export function interestUrlFromDocs(url) {
  const id = mercellTenderId(url);
  if (!id || !/mercell/i.test(String(url || ''))) return '';
  const returnUrl = `/m/mts/Tender.aspx?id=${id}`;
  return `https://my.mercell.com/nb-no/m/logon/?ReturnUrl=${encodeURIComponent(returnUrl)}`;
}

export function allowedCatalogUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ['permalink.mercell.com', 'www.mercell.com', 'my.mercell.com'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function parseMercellCatalog(html, pageUrl = '') {
  const source = String(html || '');
  const files = [];
  const seen = new Set();
  const row = /<(?:td|div)[^>]*(?:WantToDownload|rDynamicDocuments)[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>(?:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>)?/gi;
  let match = row.exec(source);
  while (match) {
    const name = decode(match[1].replace(/<[^>]+>/g, ''));
    const size = decode((match[2] || '').replace(/<[^>]+>/g, ''));
    const key = name.toLocaleLowerCase('nb-NO');
    if (name && !seen.has(key)) {
      seen.add(key);
      files.push({ name, size, access: 'portal' });
    }
    match = row.exec(source);
  }
  const id = mercellTenderId(pageUrl) || mercellTenderId(source);
  return {
    portal: 'Mercell',
    tenderId: id,
    files,
    interestUrl: id ? interestUrlFromDocs(`https://permalink.mercell.com/${id}.aspx`) : '',
    gated: true,
  };
}

export async function readPortalCatalog(url) {
  const start = String(url || '').trim();
  if (!allowedCatalogUrl(start)) {
    const error = new Error('Dokumentadressen må peke til Mercell.');
    error.code = 'invalid-argument';
    throw error;
  }
  const res = await fetch(start, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
    headers: {
      Accept: 'text/html',
      'Accept-Language': 'nb',
      'User-Agent': 'ProTop',
    },
  });
  if (!res.ok) throw new Error(`Portalen svarte ${res.status}`);
  const html = await res.text();
  const catalog = parseMercellCatalog(html, res.url || start);
  return { ok: true, ...catalog };
}
