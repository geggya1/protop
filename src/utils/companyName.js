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
