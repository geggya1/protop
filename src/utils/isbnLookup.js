import { normalizeIsbn, isbnVariants } from './isbn';

function formatCreator(name) {
  const parts = String(name || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return String(name || '').trim();
}

function pickCover(...candidates) {
  return candidates.find((u) => typeof u === 'string' && u.trim().length > 8) || null;
}

async function fetchJson(url, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Open Library — direkte ISBN-endepunkt. */
async function lookupOpenLibrary(clean) {
  const data = await fetchJson(`https://openlibrary.org/isbn/${clean}.json`);
  const authors = data.authors || [];
  let authorName = '';
  if (authors.length) {
    try {
      const aData = await fetchJson(`https://openlibrary.org${authors[0].key}.json`);
      authorName = aData.name || '';
    } catch {
      authorName = '';
    }
  }
  const title = data.title || '';
  if (!title.trim()) throw new Error('Ikke funnet i Open Library.');
  return {
    title,
    author: authorName,
    isbn: clean,
    coverUrl: pickCover(
      data.covers?.[0] && `https://covers.openlibrary.org/b/id/${data.covers[0]}-M.jpg`,
      `https://covers.openlibrary.org/b/isbn/${clean}-M.jpg`,
    ),
    totalPages: data.number_of_pages || null,
    source: 'openlibrary',
  };
}

/**
 * Open Library Books API (jscmd=data) — treffer ofte der /isbn/{n}.json mangler.
 * https://openlibrary.org/dev/docs/api/books
 */
async function lookupOpenLibraryBooksApi(clean) {
  const key = `ISBN:${clean}`;
  const data = await fetchJson(
    `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`,
  );
  const book = data?.[key];
  if (!book?.title) throw new Error('Ikke funnet i Open Library Books API.');
  const authors = (book.authors || []).map((a) => a.name).filter(Boolean);
  return {
    title: book.title,
    author: authors.join(', '),
    isbn: clean,
    coverUrl: pickCover(book.cover?.medium, book.cover?.large, book.cover?.small),
    totalPages: book.number_of_pages || null,
    source: 'openlibrary-books',
  };
}

/** Open Library Search — bredere treff på ISBN-felt. */
async function lookupOpenLibrarySearch(clean) {
  const data = await fetchJson(
    `https://openlibrary.org/search.json?isbn=${encodeURIComponent(clean)}&limit=5`,
  );
  const doc = (data?.docs || []).find((d) => d.title) || data?.docs?.[0];
  if (!doc?.title) throw new Error('Ikke funnet i Open Library Search.');
  const authors = doc.author_name || [];
  return {
    title: doc.title,
    author: authors.join(', '),
    isbn: clean,
    coverUrl: pickCover(
      doc.cover_i && `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`,
      `https://covers.openlibrary.org/b/isbn/${clean}-M.jpg`,
    ),
    totalPages: doc.number_of_pages_median || null,
    source: 'openlibrary-search',
  };
}

/** Nasjonalbiblioteket — norske utgivelser. */
async function lookupNbNo(clean) {
  const data = await fetchJson(
    `https://api.nb.no/catalog/v1/items?q=isbn:${encodeURIComponent(clean)}&size=5`,
  );
  const items = data?._embedded?.items || [];
  const item = items.find((i) => {
    const isbns = i?.metadata?.identifiers?.isbn13 || [];
    return isbns.includes(clean);
  }) || items[0];

  const title = item?.metadata?.title;
  if (!title) throw new Error('Ikke funnet i Nasjonalbiblioteket.');

  const meta = item.metadata;
  const authors = (meta.creators || []).map(formatCreator).filter(Boolean);
  const coverUrl = pickCover(
    item._links?.thumbnail_large?.href,
    item._links?.thumbnail_medium?.href,
  );

  return {
    title,
    author: authors.join(', '),
    isbn: clean,
    coverUrl,
    totalPages: meta.pageCount || null,
    source: 'nb.no',
  };
}

/**
 * Google Books — bred internasjonal dekning, ingen API-nøkkel nødvendig for offentlig søk.
 * https://developers.google.com/books/docs/v1/using
 */
async function lookupGoogleBooks(clean) {
  const data = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(clean)}&maxResults=5`,
  );
  const items = data?.items || [];
  if (!items.length) throw new Error('Ikke funnet i Google Books.');

  const volume = items.find((it) => {
    const ids = it?.volumeInfo?.industryIdentifiers || [];
    return ids.some((id) => id.identifier === clean);
  }) || items[0];

  const info = volume?.volumeInfo || {};
  if (!info.title) throw new Error('Ikke funnet i Google Books.');

  const cover = info.imageLinks?.thumbnail
    || info.imageLinks?.smallThumbnail
    || null;
  // Google ofte leverer http:// — oppgrader til https
  const coverUrl = cover ? cover.replace(/^http:/, 'https:') : null;

  return {
    title: info.title,
    author: (info.authors || []).join(', '),
    isbn: clean,
    coverUrl,
    totalPages: info.pageCount || null,
    source: 'google-books',
  };
}

/**
 * Google Books — alternativ spørring med «isbn»-token (noen kataloger responderer kun her).
 */
async function lookupGoogleBooksAlt(clean) {
  const data = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(`isbn ${clean}`)}&maxResults=5`,
  );
  const items = data?.items || [];
  const volume = items.find((it) => {
    const ids = it?.volumeInfo?.industryIdentifiers || [];
    return ids.some((id) => String(id.identifier).replace(/\D/g, '') === clean);
  }) || items.find((it) => it?.volumeInfo?.title);
  const info = volume?.volumeInfo;
  if (!info?.title) throw new Error('Ikke funnet i Google Books (alt).');

  const cover = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
  return {
    title: info.title,
    author: (info.authors || []).join(', '),
    isbn: clean,
    coverUrl: cover ? cover.replace(/^http:/, 'https:') : null,
    totalPages: info.pageCount || null,
    source: 'google-books-alt',
  };
}

/**
 * Open Library + Google via ISBN-søk i parallelle «bibkeys»-stil —
 * bruker Google Books volumes med intitle/inauthor fallback ikke —
 * i stedet: Internet Archive / Open Library subjects via worldcat-ish
 * Wikimedia Commons / Wikidata SPARQL for ISBN.
 */
async function lookupWikidata(clean) {
  const query = `
    SELECT ?itemLabel ?authorLabel ?pages ?cover WHERE {
      ?item wdt:P212 "${clean}" .
      OPTIONAL { ?item wdt:P50 ?author . }
      OPTIONAL { ?item wdt:P1104 ?pages . }
      OPTIONAL { ?item wdt:P18 ?cover . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,en,sv,da". }
    } LIMIT 5
  `.trim();
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, { timeoutMs: 10000 });
  const bindings = data?.results?.bindings || [];
  const row = bindings.find((b) => b.itemLabel?.value) || bindings[0];
  if (!row?.itemLabel?.value) throw new Error('Ikke funnet i Wikidata.');

  // Hopp over rene Q-id-labels
  const title = row.itemLabel.value;
  if (/^Q\d+$/.test(title)) throw new Error('Ikke funnet i Wikidata.');

  const authors = bindings
    .map((b) => b.authorLabel?.value)
    .filter((n) => n && !/^Q\d+$/.test(n));
  const uniqueAuthors = [...new Set(authors)];

  return {
    title,
    author: uniqueAuthors.join(', '),
    isbn: clean,
    coverUrl: row.cover?.value || null,
    totalPages: row.pages?.value ? Number(row.pages.value) : null,
    source: 'wikidata',
  };
}

/**
 * Open Library Cover + metadata via works search med ISBN i q=
 * (siste fallback før vi gir opp).
 */
async function lookupOpenLibraryQuery(clean) {
  const data = await fetchJson(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(clean)}&limit=5`,
  );
  const docs = data?.docs || [];
  const doc = docs.find((d) => {
    const isbns = (d.isbn || []).map((x) => String(x).replace(/\D/g, ''));
    return isbns.includes(clean) && d.title;
  }) || docs.find((d) => d.title);
  if (!doc?.title) throw new Error('Ikke funnet i Open Library Query.');
  return {
    title: doc.title,
    author: (doc.author_name || []).join(', '),
    isbn: clean,
    coverUrl: pickCover(
      doc.cover_i && `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`,
      `https://covers.openlibrary.org/b/isbn/${clean}-M.jpg`,
    ),
    totalPages: doc.number_of_pages_median || null,
    source: 'openlibrary-query',
  };
}

function isNorwegianIsbn(clean) {
  return clean.startsWith('97882')
    || clean.startsWith('97982')
    || (clean.length === 10 && clean.startsWith('82'));
}

/**
 * Provider-kjede. Eksisterende nb.no + Open Library beholdes;
 * flere åpne API-er legges til for bedre treffrate.
 */
function buildProviderChain(clean) {
  const common = [
    lookupGoogleBooks,
    lookupOpenLibraryBooksApi,
    lookupOpenLibrarySearch,
    lookupGoogleBooksAlt,
    lookupWikidata,
    lookupOpenLibraryQuery,
  ];
  if (isNorwegianIsbn(clean)) {
    return [lookupNbNo, lookupOpenLibrary, ...common];
  }
  return [lookupOpenLibrary, lookupGoogleBooks, lookupNbNo, ...common.filter((p) => p !== lookupGoogleBooks)];
}

/**
 * Oppslag via Nasjonalbiblioteket, Open Library (flere endepunkt),
 * Google Books og Wikidata. Prøver ISBN-10 og ISBN-13-varianter.
 */
export async function lookupIsbn(isbn) {
  const clean = normalizeIsbn(isbn);
  if (clean.length < 10) throw new Error('ISBN må ha minst 10 siffer.');

  const variants = isbnVariants(clean);
  let lastError = null;

  for (const variant of variants) {
    const providers = buildProviderChain(variant);
    for (const provider of providers) {
      try {
        const result = await provider(variant);
        if (result?.title?.trim()) {
          return { ...result, isbn: clean };
        }
      } catch (e) {
        lastError = e;
      }
    }
  }

  throw new Error(
    lastError?.message
      || 'Fant ingen bok med dette ISBN-nummeret. Du kan fylle inn tittel og forfatter manuelt.',
  );
}
