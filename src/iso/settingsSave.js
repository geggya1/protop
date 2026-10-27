/**
 * Autolagring av ISO-oppsettet (Innstillinger): når er skjemaet endret, og hvordan legges
 * brukerens egne endringer oppå et oppsett som er lagret et annet sted i mellomtiden.
 */
import { stableJson } from './core.js';
import { normalizeDocStructure } from './documents.js';

/** Feltene skjemaet lagrer. */
export const SETTINGS_FIELDS = [
  'name', 'standards', 'scopeText', 'units', 'locations', 'activities', 'exclusions', 'ownerName', 'ownerUid',
  'roleMap', 'riskMethod', 'autoQualityPlan', 'docStructure', 'profile',
];

/** Systemansvarlig i rollelisten settes alltid fra ownerName/ownerUid ved lagring, så den teller ikke selv. */
function comparableRoles(roleMap) {
  const out = {};
  for (const [role, person] of Object.entries(roleMap || {})) if (role !== 'system_owner' && person) out[role] = person;
  return out;
}

/**
 * Brukes til å se om noe er endret. Feltrekkefølgen spiller ingen rolle: Firestore gir ikke
 * feltene tilbake i samme rekkefølge som de ble lagret.
 */
export function settingsKey(x) {
  return stableJson({
    name: x?.name || '',
    standards: x?.standards || [],
    scopeText: x?.scopeText || '',
    units: x?.units || '',
    locations: x?.locations || '',
    activities: x?.activities || '',
    exclusions: x?.exclusions || '',
    ownerName: x?.ownerName || '',
    ownerUid: x?.ownerUid || '',
    roleMap: comparableRoles(x?.roleMap),
    riskMethod: x?.riskMethod?.thresholds || null,
    autoQualityPlan: x?.autoQualityPlan !== false,
    docStructure: normalizeDocStructure(x?.docStructure || []),
    profile: x?.profile || null,
  });
}

const same = (a, b) => stableJson(a ?? null) === stableJson(b ?? null);

/**
 * Lagringen ble avvist fordi oppsettet er lagret et annet sted i mellomtiden (import, en annen fane).
 * Det brukeren selv har endret i skjemaet (cur mot base), legges oppå det som er lagret nå (latest).
 * Rollene flettes per rolle, så roller som er satt et annet sted, ikke skrives over.
 */
export function mergeOwnChanges(cur, base, latest) {
  const out = { ...(latest || {}) };
  for (const k of SETTINGS_FIELDS) {
    if (k !== 'roleMap' && !same(cur?.[k], base?.[k])) out[k] = cur?.[k];
  }
  const roles = { ...(latest?.roleMap || {}) };
  for (const role of new Set([...Object.keys(cur?.roleMap || {}), ...Object.keys(base?.roleMap || {})])) {
    if (!same(cur?.roleMap?.[role], base?.roleMap?.[role])) roles[role] = cur?.roleMap?.[role] ?? null;
  }
  out.roleMap = roles;
  return out;
}
