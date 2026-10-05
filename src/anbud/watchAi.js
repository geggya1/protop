/** AI-tolkning av bedriftsprofil og rangering av anbudstreff. */

async function post(action, payload) {
  const res = await fetch('/api/tender-proxy', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || 'AI-svaret kom ikke gjennom.');
  }
  return data;
}

export async function interpretCompanyProfile({ companyName, orgnr, description, website }) {
  return post('interpret-profile', {
    companyName: String(companyName || ''),
    orgnr: String(orgnr || ''),
    description: String(description || ''),
    website: String(website || ''),
  });
}

export async function rankTenderHits({ companyName, description, summary, keywords, notices }) {
  return post('rank-hits', {
    companyName: String(companyName || ''),
    description: String(description || ''),
    summary: String(summary || ''),
    keywords: Array.isArray(keywords) ? keywords : [],
    notices: (Array.isArray(notices) ? notices : []).slice(0, 20).map((row) => ({
      id: row.id,
      title: row.title,
      buyer: row.buyer,
      description: String(row.description || '').slice(0, 400),
      cpvCodes: row.cpvCodes || [],
    })),
  });
}
