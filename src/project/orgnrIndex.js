/**
 * Hvilken bedrift i ProTop eier et organisasjonsnummer (orgnrIndex/{orgnr}).
 *
 * Oppslaget («Opprett bedrift» → «Be om å bli med») skal alltid gi samme bedrift, og en ny
 * bedrift med et orgnr som allerede er i bruk, skal ikke kunne ta over oppslaget og fange
 * forespørslene. Indeksen skrives bare av serveren, i transaksjon:
 *   - peker den på en levende bedrift som fortsatt har orgnummeret, vinner den;
 *   - ellers vinner den eldste levende bedriften med orgnummeret. Alderen er dokumentets
 *     createTime fra Firestore, som klienten ikke kan sette (createdAt kan forfalskes).
 *
 * Ren logikk uten Firebase. Brukes av Cloud Functions og av tester.
 */
import { digitsOrgnr } from './companyRegistry.js';

/** Orgnummeret bedriften står med (toppfeltet eller selskapsprofilen), eller ''. */
export function companyOrgnr(data) {
  const id = digitsOrgnr(data?.orgnr || data?.company?.organisasjonsnummer || data?.company?.orgnr);
  return id.length === 9 ? id : '';
}

export function liveCompany(data) {
  return !!data && data.deleted !== true && data.hiddenFromApp !== true;
}

/** Millisekunder fra Timestamp, Date, tall eller ISO-tekst. Ukjent = Infinity (sist). */
export function timeMillis(value) {
  if (value == null || value === '') return Infinity;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : Infinity;
  if (typeof value === 'object' && Number.isFinite(value._seconds)) {
    return value._seconds * 1000 + Math.floor(Number(value._nanoseconds || 0) / 1e6);
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : Infinity;
}

/** Bedriften kan eie orgnummeret: levende og står med det. */
export function holdsOrgnr(candidate, orgnr) {
  return !!candidate?.id && liveCompany(candidate.data) && companyOrgnr(candidate.data) === orgnr;
}

/**
 * Eldste levende bedrift med orgnummeret. candidates: [{ id, data, createTime }].
 * createTime er Firestores egen opprettelsestid; mangler den, brukes data.createdAt.
 * Lik tid: lavest id, så svaret alltid er det samme.
 */
export function pickOrgnrOwner(candidates, orgnr) {
  const id = digitsOrgnr(orgnr);
  if (id.length !== 9) return null;
  const seen = new Set();
  const rows = [];
  for (const row of Array.isArray(candidates) ? candidates : []) {
    if (!holdsOrgnr(row, id) || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  rows.sort((a, b) => {
    const at = timeMillis(a.createTime ?? a.data?.createdAt);
    const bt = timeMillis(b.createTime ?? b.data?.createdAt);
    if (at !== bt) return at < bt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return rows[0] || null;
}

/**
 * Hva indeksen skal være. index = orgnrIndex/{orgnr} (eller null), indexed = bedriften den
 * peker på ({ id, data } eller null), candidates = bedriftene med orgnummeret.
 * Svar: { owner: { id, data } | null, write: 'set' | 'delete' | null }.
 */
export function orgnrIndexDecision({ orgnr, index = null, indexed = null, candidates = [] } = {}) {
  const id = digitsOrgnr(orgnr);
  if (id.length !== 9) return { owner: null, write: null };
  const pinned = index?.familyId && indexed?.id === index.familyId && holdsOrgnr(indexed, id) ? indexed : null;
  if (pinned) return { owner: pinned, write: null };
  const owner = pickOrgnrOwner(candidates, id);
  if (owner) return { owner, write: 'set' };
  return { owner: null, write: index ? 'delete' : null };
}

/** Dokumentet i orgnrIndex. Tidspunktet legges på av den som skriver. */
export function orgnrIndexRecord({ orgnr, familyId, source = 'lookup', claimedBy = '' } = {}) {
  return {
    orgnr: digitsOrgnr(orgnr),
    familyId: String(familyId || ''),
    source: String(source || 'lookup'),
    claimedBy: String(claimedBy || ''),
  };
}
