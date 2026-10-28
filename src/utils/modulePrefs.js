/**
 * Aktiverte moduler i en bedrift (MENY-01): hele bedriften eller bare meg.
 *
 * Kalender, E-post, Oppgaver, Notat og Chat slås av og på for hele bedriften på
 * families/{id}.moduleAccess. Det krever samme tilgang som Modulinnstillinger: eier,
 * administrator eller Admin på Modulinnstillinger, i appen og i firestore.rules.
 * Før kunne enhver ansatt slå av Kalender for alle fra Konto → Aktiverte moduler.
 *
 * En vanlig ansatt endrer bare sin egen visning: users/{uid}/modulePrefs/{bedrift}
 * med { modules: { plan: 'off' | 'on' } }. 'off' skjuler modulen for meg (velkomsten vises,
 * og jeg kan slå den på igjen). 'on' slår på en modul bedriften ikke har tatt stilling til.
 * En modul bedriften har slått av, kan ikke slås på for seg selv.
 * Familier og lag har ingen egen visning: der gjelder valget gruppen, som før.
 */
import { getModuleAccess, isModuleActivated } from './moduleAccess.js';

export const MODULE_PREFS_COLLECTION = 'modulePrefs';

const CHOICES = new Set(['on', 'off']);

/** Mine valg fra dokumentet: { modulId: 'on' | 'off' }. */
export function readModulePrefs(doc) {
  const raw = doc?.modules;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    if (CHOICES.has(value)) out[id] = value;
  }
  return out;
}

/** Dokumentet som lagres når jeg slår en modul av eller på for meg selv. */
export function modulePrefsWrite(prefs, moduleId, on) {
  return {
    modules: { ...readModulePrefs({ modules: prefs }), [moduleId]: on ? 'on' : 'off' },
  };
}

/**
 * Bedriften har slått modulen av (den har vært på, og er det ikke lenger). En modul ingen
 * har slått på ennå, er ikke slått av: da kan hver ansatt slå den på for seg selv.
 */
export function companyTurnedOff(access) {
  if (!access || typeof access !== 'object') return false;
  return !isModuleActivated(access) && Array.isArray(access.history) && access.history.length > 0;
}

/** Modulen er slått av for bedriften, så en ansatt kan ikke slå den på for seg selv. */
export function personalModuleBlocked(companyMap, moduleId) {
  return companyTurnedOff(getModuleAccess(companyMap, moduleId));
}

/** Er modulen på for meg? Bedriftens valg, med mitt eget valg oppå. */
export function effectiveModuleOn(companyMap, prefs, moduleId) {
  const access = getModuleAccess(companyMap, moduleId);
  const mine = prefs?.[moduleId];
  if (mine === 'off') return false;
  if (isModuleActivated(access)) return true;
  return mine === 'on' && !companyTurnedOff(access);
}

/**
 * Hvor et valg lagres. 'company': families/{id}.moduleAccess (hele gruppen). 'personal':
 * mitt eget valg. I en bedrift endrer bare eier, administrator og Admin på Modulinnstillinger
 * hele bedriften; i familier og lag gjelder valget gruppen, som før.
 */
export function moduleWriteScope({ company = false, isAdmin = false, canAdminModules = false } = {}) {
  if (!company) return 'company';
  return isAdmin || canAdminModules ? 'company' : 'personal';
}
