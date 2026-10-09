/** Søkejobber for anbudsvarsling: CPV-treff pluss treff på firmaprofilens søkeord. */

function searchCodes(cpvCodes) {
  return [...new Set((Array.isArray(cpvCodes) ? cpvCodes : [])
    .map((code) => String(code || '').trim())
    .filter(Boolean))];
}

function searchWords(keywords) {
  const seen = new Set();
  const out = [];
  for (const row of (Array.isArray(keywords) ? keywords : [])) {
    const value = String(row || '').trim();
    const key = value.toLocaleLowerCase('nb-NO');
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 8) break;
  }
  return out;
}

function searchChannels(channels) {
  const list = (Array.isArray(channels) ? channels : [])
    .map((row) => String(row || '').trim())
    .filter(Boolean);
  return list.length ? list : ['doffin', 'ted'];
}

function rememberHit(map, hit, words) {
  const id = String(hit?.id || '').trim();
  if (!id) return;
  const prev = map.get(id);
  const matchedKeywords = [...new Set([
    ...(prev?.matchedKeywords || []),
    ...(hit?.matchedKeywords || []),
    ...words,
  ].map((word) => String(word || '').trim()).filter(Boolean))];
  map.set(id, { ...(prev || {}), ...hit, ...(matchedKeywords.length ? { matchedKeywords } : {}) });
}

/** Rekkefølgen søket faktisk kjører. Uten CPV hoppes det tomme CPV-kallet over. */
export function watchHitRequests({
  cpvCodes, locationIds, channels, keywords, publishedFrom,
} = {}) {
  const codes = searchCodes(cpvCodes);
  const words = searchWords(keywords);
  const channelList = searchChannels(channels);
  const requests = [];
  if (codes.length) {
    requests.push({
      via: 'proxy',
      matched: [],
      query: { cpvCodes: codes, locationIds, channels: channelList, publishedFrom },
    });
  }
  for (const word of words) {
    requests.push({
      via: 'proxy',
      matched: [word],
      query: {
        cpvCodes: [],
        locationIds,
        channels: channelList,
        publishedFrom,
        searchString: word,
        keywords: [word],
      },
    });
    if (channelList.includes('ted')) {
      requests.push({
        via: 'ted',
        matched: [word],
        query: { keywords: [word], locationIds, publishedFrom, numHitsPerPage: 15 },
      });
    }
  }
  return requests;
}

export async function collectWatchHits(input, runners) {
  const requests = watchHitRequests(input);
  if (!requests.length) {
    const error = new Error('Minst én CPV-kode eller et søkeord må følge med.');
    error.code = 'invalid-argument';
    throw error;
  }
  const byId = new Map();
  const errors = [];
  let succeeded = 0;
  let fetchedAt = '';
  await Promise.all(requests.map(async (request) => {
    try {
      const run = request.via === 'ted' ? runners?.ted : runners?.proxy;
      const data = await run(request.query);
      succeeded += 1;
      for (const hit of data?.hits || []) rememberHit(byId, hit, request.matched);
      if (data?.fetchedAt) fetchedAt = data.fetchedAt;
    } catch (err) {
      errors.push(err?.message || 'Kunne ikke hente treff.');
    }
  }));
  if (succeeded === 0) {
    throw new Error(errors[0] || 'Kunne ikke hente treff.');
  }
  return {
    ok: true,
    hits: [...byId.values()],
    errors: [],
    fetchedAt: fetchedAt || new Date().toISOString(),
  };
}
