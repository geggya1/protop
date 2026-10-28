/**
 * Én farge per menygruppe. Modulbåndet (ModuleHero) og hjelpen leser herfra, så samme
 * side har samme farge begge steder, og båndet skifter ikke farge mellom fanene i en modul.
 * Nøkkel = gruppe-id i COMPANY_DRAWER_GROUPS og HELP_SECTIONS (pluss Personlig og Konto).
 *
 *   bg / bg2  pastellbåndet (som før)
 *   accent    tekst og ikon på båndet og i hjelpen (minst 4,5:1 mot bg og soft)
 *   soft      lys bakgrunn i hjelpen
 * Ren data, så node-testene kan lese den.
 */

export const GROUP_PALETTE = {
  personal: { bg: '#E5F6FE', bg2: '#f7fbff', accent: '#075985', soft: '#dbeafe' },
  'company-org': { bg: '#e8eef6', bg2: '#f7f9fc', accent: '#07274C', soft: '#e2e8f0' },
  'company-people': { bg: '#eef0fd', bg2: '#f8f9ff', accent: '#4338ca', soft: '#e0e7ff' },
  'company-quality': { bg: '#e6f6f3', bg2: '#f5fcfa', accent: '#0f766e', soft: '#ccfbf1' },
  'company-productivity': { bg: '#f1e9ff', bg2: '#faf7ff', accent: '#6d28d9', soft: '#ede9fe' },
  'company-finance': { bg: '#e7f7ee', bg2: '#f5fcf8', accent: '#15803d', soft: '#dcfce7' },
  'company-resources': { bg: '#fff1e6', bg2: '#fff8f2', accent: '#c2410c', soft: '#ffedd5' },
  'company-tenders': { bg: '#fde8ef', bg2: '#fff7fa', accent: '#be123c', soft: '#ffe4e6' },
  'company-customers': { bg: '#E5F6FE', bg2: '#f7fbff', accent: '#075985', soft: '#dbeafe' },
  account: { bg: '#eef2f7', bg2: '#f8fafc', accent: '#334155', soft: '#e2e8f0' },
};

export function groupPalette(groupId) {
  return GROUP_PALETTE[groupId] || null;
}
