/** Oppslag i modulkatalogen. Brukes både med hele katalogen (moduleCatalog.js) og med den
 * genererte utgaven for de aktive språkene (moduleCatalogActive.js). */

export function pick(entry, lang) {
  if (!entry || typeof entry !== 'object') return entry;
  return entry[lang] || entry.en || entry.nb || '';
}

export function makeLocalizers(catalog) {
  function localizeModuleFields(module, lang) {
    if (!module || !module.id) return module;
    const entry = catalog.modules[module.id];
    if (!entry) return module;
    return {
      ...module,
      name: pick(entry.name, lang),
      eyebrow: pick(entry.eyebrow, lang),
      headline: pick(entry.headline, lang),
      pitch: pick(entry.pitch, lang),
      activationLabel: pick(entry.activationLabel, lang),
      benefits: Array.isArray(entry.benefits)
        ? entry.benefits.map((b) => pick(b, lang))
        : module.benefits,
    };
  }

  function localizeCatalogDefaults(defaults, lang) {
    const i18nDefaults = catalog.defaults;
    if (!defaults && !i18nDefaults) return defaults;
    const source = defaults || {};
    return {
      ...source,
      backLabel: pick(i18nDefaults.backLabel, lang) || source.backLabel,
      reassuranceText: pick(i18nDefaults.reassuranceText, lang) || source.reassuranceText,
      mobileReassuranceText: pick(i18nDefaults.mobileReassuranceText, lang) || source.mobileReassuranceText,
      reassuranceTextCompact: pick(i18nDefaults.reassuranceTextCompact, lang) || source.reassuranceTextCompact,
      childReassuranceText: pick(i18nDefaults.childReassuranceText, lang) || source.childReassuranceText,
    };
  }

  return { localizeModuleFields, localizeCatalogDefaults };
}

/** Kutter hvert språkblad ({ nb, en, da, … }) ned til de gitte språkene. */
export function trimCatalogLangs(node, langs) {
  if (Array.isArray(node)) return node.map((n) => trimCatalogLangs(n, langs));
  if (!node || typeof node !== 'object') return node;
  if ('nb' in node && 'en' in node) {
    return Object.fromEntries(langs.filter((l) => l in node).map((l) => [l, node[l]]));
  }
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, trimCatalogLangs(v, langs)]));
}
