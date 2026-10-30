/**
 * Selskapsnavnet (DS-17). company.navn er fasit for selskaper; families.name er reserve for
 * grupper uten selskapsprofil (familier, lag, klasser) og for eldre selskaper. Visning leser
 * navnet herfra, så «Gi nytt navn» og Brreg-oppdateringen slår gjennom samme sted.
 */

function text(value) {
  return String(value ?? '').trim();
}

export function companyDisplayName(group, fallback = '') {
  return text(group?.company?.navn) || text(group?.name) || fallback;
}

const COMPANY_FORMS = new Set(['AS', 'ASA', 'DA', 'ANS', 'BA', 'SA', 'NUF', 'ENK', 'KS', 'SE']);
const SMALL_WORDS = new Set(['OG', 'I', 'PÅ', 'AV', 'FOR', 'TIL', 'MED', 'VED', 'UNDER']);

/**
 * Navn fra Enhetsregisteret står med store bokstaver («CONSULT1 AS»). Til overskrifter
 * vises de som «Consult1 AS»: stor forbokstav, selskapsformen beholdes. Navn med små
 * bokstaver er skrevet av bedriften selv og står som de er.
 */
export function readableCompanyName(name) {
  const value = text(name);
  if (!value || /\p{Ll}/u.test(value)) return value;
  return value.split(/(\s+)/).map((word, index) => {
    if (!word.trim() || COMPANY_FORMS.has(word)) return word;
    if (index > 0 && SMALL_WORDS.has(word)) return word.toLowerCase();
    return word.toLowerCase().replace(/(^|[-/&])(\p{Ll})/gu, (_, pre, ch) => pre + ch.toUpperCase());
  }).join('');
}

/**
 * Morselskapets navn for en underenhet: slått opp via parentCompanyId blant selskapene
 * brukeren har. Kopien (parentCompanyName) er reserve når morselskapet ikke er i listen.
 */
export function parentCompanyDisplayName(group, families = []) {
  const id = text(group?.parentCompanyId);
  const parent = id ? (Array.isArray(families) ? families : []).find((row) => row?.id === id) : null;
  return companyDisplayName(parent) || text(group?.parentCompanyName);
}

/** «Gi nytt navn»: et selskap får nytt navn både i company.navn og name, så de ikke spriker. */
export function renameGroupPatch(group, name) {
  const next = text(name);
  const patch = { name: next };
  if (group?.company && typeof group.company === 'object') patch['company.navn'] = next;
  return patch;
}
