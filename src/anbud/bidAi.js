/** AI-tolkning av konkurransegrunnlag og Q&A for ett tilbud. */

import { buildLocalBidInterpretation, collectBidAiSource } from './bidLibrary.js';

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

/**
 * Tolker konkurransen. Bruker Gemini via tender-proxy når tilgjengelig,
 * ellers lokal oppsummering fra dossier og filtekst.
 */
export async function interpretBidCompetition(bid, options = {}) {
  const source = collectBidAiSource(bid);
  if (!source || source.length < 40) {
    throw new Error('Last inn konkurransegrunnlag eller skriv mer tekst før AI-tolkning.');
  }
  try {
    const data = await post('interpret-bid', {
      title: String(bid?.title || ''),
      buyer: String(bid?.buyer || ''),
      source: source.slice(0, 100000),
      companyName: String(options.companyName || ''),
    });
    if (data?.interpretation) {
      return {
        ok: true,
        interpretation: data.interpretation,
        engine: data.engine || 'gemini',
      };
    }
  } catch (err) {
    if (options.allowLocal === false) throw err;
  }
  return {
    ok: true,
    interpretation: buildLocalBidInterpretation(bid),
    engine: 'lokal',
  };
}
