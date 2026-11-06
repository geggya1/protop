/**
 * Pure module-activation catalog helpers.
 * Sales copy lives in moduler.json — keep it out of UI components.
 */

export const CATEGORY_ORDER = [
  { id: 'main', title: 'Personlig' },
  { id: 'house', title: 'Hus & papir' },
];

export const ILLUSTRATION_DIR = '/assets/module-activation';

/** Bump when illustration bytes change. Filenames stay stable, so web URLs
 *  must change or browsers keep the old PNG (Firebase caches /assets/* as
 *  immutable for a year). */
export const ILLUSTRATION_CACHE = '20261106w';

export function withIllustrationCache(path) {
  if (!path) return path;
  const s = String(path);
  if (s.includes('?')) return s;
  return `${s}?v=${ILLUSTRATION_CACHE}`;
}

/** Catalog + page-hero illustration filenames (WebP). */
export const ILLUSTRATION_FILES = {
  plan: 'kalender--module-activation-illustration.webp',
  mail: 'e-post--module-activation-illustration.webp',
  stars: 'oppgaver--module-activation-illustration.webp',
  notes: 'notat--module-activation-illustration.webp',
  friends: 'venner--module-activation-illustration.webp',
  chat: 'chat--module-activation-illustration.webp',
  documents: 'dokumenter--module-activation-illustration.webp',
  projects: 'prosjekt--module-activation-illustration.webp',
  ansatte: 'ansatte--module-activation-illustration.webp',
  'hr-ansatte': 'ansatte--module-activation-illustration.webp',
  ansatt: 'ansatte--module-activation-illustration.webp',
  kunder: 'kunder--module-activation-illustration.webp',
  'anbud-varsling': 'anbud-varsling--module-activation-illustration.webp',
  'anbud-vurdering': 'anbud-vurdering--module-activation-illustration.webp',
  'anbud-foresporsel': 'anbud-foresporsel--module-activation-illustration.webp',
  'anbud-tilbud': 'anbud-tilbud--module-activation-illustration.webp',
  kontrakt: 'kontrakt--module-activation-illustration.webp',
  skjema: 'skjema--module-activation-illustration.webp',
  timeliste: 'timeliste--module-activation-illustration.webp',
  'arbeid-timeliste': 'timeliste--module-activation-illustration.webp',
  'arbeid-timerapport': 'arbeid-timerapport--module-activation-illustration.webp',
  'arbeid-timesaldo': 'arbeid-timesaldo--module-activation-illustration.webp',
  'arbeid-fravaer': 'arbeid-fravaer--module-activation-illustration.webp',
  'arbeid-fravaer-innstillinger': 'arbeid-fravaer--module-activation-illustration.webp',
  'moter-oversikt': 'moter--module-activation-illustration.webp',
  'moter-oppfolging': 'moter--module-activation-illustration.webp',
  'moter-maler': 'moter--module-activation-illustration.webp',
  'arbeid-fravaersrapport': 'arbeid-fravaersrapport--module-activation-illustration.webp',
  'arbeid-utlegg': 'arbeid-utlegg--module-activation-illustration.webp',
  'arbeid-salg': 'arbeid-salg--module-activation-illustration.webp',
  'okonomi-produkter': 'okonomi-produkter--module-activation-illustration.webp',
  'arbeid-godkjenning': 'arbeid-godkjenning--module-activation-illustration.webp',
  iso: 'iso--module-activation-illustration.webp',
  'hr-oversikt': 'hr-oversikt--module-activation-illustration.webp',
  'hr-personell': 'hr-personell--module-activation-illustration.webp',
  'innleie-oversikt': 'hr-personell--module-activation-illustration.webp',
  'innleie-personell': 'hr-personell--module-activation-illustration.webp',
  'hr-avtaler': 'hr-avtaler--module-activation-illustration.webp',
  'hr-produktivitet': 'hr-produktivitet--module-activation-illustration.webp',
  'arbeid-produktivitet': 'hr-produktivitet--module-activation-illustration.webp',
  'arbeid-fremdrift': 'hr-produktivitet--module-activation-illustration.webp',
  'hr-lonn': 'hr-lonn--module-activation-illustration.webp',
  'hr-oppfolging': 'hr-oppfolging--module-activation-illustration.webp',
  'hr-compliance': 'hr-compliance--module-activation-illustration.webp',
  'hr-rekruttering': 'hr-rekruttering--module-activation-illustration.webp',
  'hr-arshjul': 'hr-oppfolging--module-activation-illustration.webp',
  'hr-sykefravaer': 'hr-oppfolging--module-activation-illustration.webp',
  'hr-undersokelse': 'hr-oppfolging--module-activation-illustration.webp',
  'hr-handbok': 'hr-compliance--module-activation-illustration.webp',
  'hr-skjema': 'skjema--module-activation-illustration.webp',
  'okonomi-faktura': 'okonomi-faktura--module-activation-illustration.webp',
  'okonomi-kjorebok': 'okonomi-kjorebok--module-activation-illustration.webp',
  utstyr: 'kjoretoy--module-activation-illustration.webp',
  'okonomi-indeks': 'okonomi-indeks--module-activation-illustration.webp',
  'okonomi-fakturagrunnlag': 'okonomi-fakturagrunnlag--module-activation-illustration.webp',
  'okonomi-oversikt': 'okonomi-oversikt--module-activation-illustration.webp',
  'okonomi-utlegg': 'okonomi-utlegg--module-activation-illustration.webp',
  'okonomi-innstillinger': 'selskap--module-activation-illustration.webp',
  selskap: 'selskap--module-activation-illustration.webp',
  underenheter: 'underenheter--module-activation-illustration.webp',
  'selskap-tilgang': 'selskap-tilgang--module-activation-illustration.webp',
};

/** Tighter phone compositions. Tablet and desktop keep ILLUSTRATION_FILES. */
export const PHONE_ILLUSTRATION_FILES = {
  'okonomi-faktura': 'okonomi-faktura-phone--module-activation-illustration.webp',
  'arbeid-godkjenning': 'arbeid-godkjenning-phone--module-activation-illustration.webp',
  'okonomi-produkter': 'okonomi-produkter-phone--module-activation-illustration.webp',
  'okonomi-utlegg': 'okonomi-utlegg-phone--module-activation-illustration.webp',
  'arbeid-fravaer': 'arbeid-fravaer-phone--module-activation-illustration.webp',
  'arbeid-fravaer-innstillinger': 'arbeid-fravaer-phone--module-activation-illustration.webp',
  'arbeid-fravaersrapport': 'arbeid-fravaer-phone--module-activation-illustration.webp',
  timeliste: 'timeliste-phone--module-activation-illustration.webp',
  'arbeid-timeliste': 'timeliste-phone--module-activation-illustration.webp',
  'moter-oversikt': 'moter-phone--module-activation-illustration.webp',
  'moter-oppfolging': 'moter-phone--module-activation-illustration.webp',
  'moter-maler': 'moter-phone--module-activation-illustration.webp',
};

export function publicIllustrationPathForId(moduleId, catalogPath = null) {
  if (catalogPath) return catalogPath;
  const file = ILLUSTRATION_FILES[moduleId];
  if (!file) return null;
  return withIllustrationCache(`${ILLUSTRATION_DIR}/${file}`);
}

export const SHELL_SKIP_MODULE_IDS = new Set([
  'home',
  'more',
  'settings',
  'legal',
  'subscription',
  'members',
  'addMember',
  'groupSettings',
  'childApps',
  'quiz',
  'ai',
  'voiceNotes',
  'restrictions',
  'moduleAccess',
  'help',
]);

export const STACK_MODULE_IDS = {
  AddNote: 'notes',
  ParentTask: 'stars',
};

function asString(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function asBenefits(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

export function createModuleRegistry(catalog) {
  const defaults = catalog?.defaults && typeof catalog.defaults === 'object'
    ? catalog.defaults
    : {};
  const rows = Array.isArray(catalog?.modules) ? catalog.modules : [];
  const byId = new Map();

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const id = asString(raw.id);
    if (!id) continue;
    const name = asString(raw.name, id);
    const illustration = asString(raw.illustration);
    const mobileReassuranceText = asString(
      raw.mobileReassuranceText,
      asString(
        raw.reassuranceTextCompact,
        asString(
          defaults.mobileReassuranceText,
          asString(defaults.reassuranceTextCompact, asString(defaults.reassuranceText)),
        ),
      ),
    );
    const config = {
      id,
      name,
      category: asString(raw.category, 'main'),
      eyebrow: asString(raw.eyebrow),
      headline: asString(raw.headline, name),
      pitch: asString(raw.pitch),
      benefits: asBenefits(raw.benefits).slice(0, 3),
      illustration,
      illustrationPath: illustration
        ? withIllustrationCache(`${ILLUSTRATION_DIR}/${illustration}`)
        : '',
      activationLabel: asString(raw.activationLabel, `Aktiver ${name}`),
      backLabel: asString(raw.backLabel, asString(defaults.backLabel, 'Tilbake')),
      reassuranceText: asString(
        raw.reassuranceText,
        asString(defaults.reassuranceText),
      ),
      mobileReassuranceText,
      reassuranceTextCompact: mobileReassuranceText,
      childReassuranceText: asString(
        raw.childReassuranceText,
        asString(defaults.childReassuranceText, asString(defaults.reassuranceText)),
      ),
    };
    byId.set(id, config);
  }

  const ACTIVATABLE_MODULE_IDS = [...byId.keys()];

  function getModuleConfig(moduleId) {
    if (!moduleId) return null;
    return byId.get(String(moduleId)) || null;
  }

  function isActivatableModule(moduleId) {
    return !!getModuleConfig(moduleId);
  }

  function listModulesByCategory() {
    const used = new Set();
    const sections = [];
    for (const cat of CATEGORY_ORDER) {
      const items = ACTIVATABLE_MODULE_IDS
        .map((id) => byId.get(id))
        .filter((mod) => mod.category === cat.id);
      items.forEach((mod) => used.add(mod.id));
      if (items.length) sections.push({ id: cat.id, title: cat.title, items });
    }
    const leftover = ACTIVATABLE_MODULE_IDS
      .map((id) => byId.get(id))
      .filter((mod) => !used.has(mod.id));
    if (leftover.length) {
      sections.push({ id: 'other', title: 'Øvrige', items: leftover });
    }
    return sections;
  }

  function activationModuleIdForShell(tab, moreSubView = null) {
    if (!tab) return null;
    if (tab === 'more') {
      if (!moreSubView || SHELL_SKIP_MODULE_IDS.has(moreSubView)) return null;
      return isActivatableModule(moreSubView) ? moreSubView : null;
    }
    if (SHELL_SKIP_MODULE_IDS.has(tab)) return null;
    return isActivatableModule(tab) ? tab : null;
  }

  function activationModuleIdForStack(routeName) {
    if (!routeName) return null;
    const id = STACK_MODULE_IDS[routeName];
    return id && isActivatableModule(id) ? id : null;
  }

  return {
    catalog,
    defaults,
    byId,
    ACTIVATABLE_MODULE_IDS,
    getModuleConfig,
    isActivatableModule,
    listModulesByCategory,
    activationModuleIdForShell,
    activationModuleIdForStack,
  };
}

export function reassuranceForRole(moduleConfig, { isChild = false, compact = false, stacked = false } = {}) {
  if (!moduleConfig) return '';
  if (isChild) return moduleConfig.childReassuranceText || '';
  if (compact || stacked) {
    return moduleConfig.mobileReassuranceText
      || moduleConfig.reassuranceTextCompact
      || moduleConfig.reassuranceText
      || '';
  }
  return moduleConfig.reassuranceText || '';
}
