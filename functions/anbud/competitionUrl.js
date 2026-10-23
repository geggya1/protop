/** Rydder adressen til konkurransegrunnlaget fra Doffin/TED. Samme fil ligger i functions/anbud. */

function plain(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plain).find(Boolean) || '';
  if (typeof value === 'object') return plain(value.nor || value.nob || value.eng || Object.values(value)[0]);
  return '';
}

/**
 * Gir en https-adresse, eller '' når verdien ikke inneholder en lenke.
 * Doffin har både http://-lenker og felt med bare et firmanavn («Innherred Anskaffelser -»).
 */
export function normalizeCompetitionUrl(value) {
  const raw = plain(value).trim();
  const match = raw.match(/(?:https?:\/\/|www\.)[^\s<>"'|]+/i);
  if (!match) return '';
  let candidate = match[0].replace(/[.,;:!?)\]}]+$/, '');
  if (/^www\./i.test(candidate)) candidate = `https://${candidate}`;
  candidate = candidate.replace(/^http:\/\//i, 'https://');
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || !parsed.hostname.includes('.')) return '';
    return parsed.href;
  } catch {
    return '';
  }
}
