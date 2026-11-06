/**
 * Sidenøklene i hjelpekatalogen, uten selve hjelpeteksten.
 *
 * Skallet og hjelpekonteksten trenger bare å vite hvilken hjelpeside en fane hører til.
 * Hele katalogen (src/help/protopPages.js, over 200 KB tekst) lastes først når hjelpen
 * åpnes. protopPageKeys.test.mjs sjekker at listen her er lik nøklene i katalogen.
 */

export const PAGE_KEYS = new Set([
  'home',
  'chat',
  'friends',
  'plan',
  'mail',
  'stars',
  'notes',
  'timeliste',
  'settings',
  'help',
  'moduleAccess',
  'legal',
  'subscription',
  'selskap',
  'selskap.innstillinger',
  'selskap.moduler',
  'selskap.tilgang',
  'selskap.underenheter',
  'selskap.fravaerstyper',
  'selskap.kontoplan',
  'ansatte',
  'hr.oversikt',
  'hr.personell',
  'innleie.oversikt',
  'innleie.personell',
  'innleie.leverandorer',
  'innleie.timer',
  'innleie.oppfolging',
  'hr.avtaler',
  'hr.lonn',
  'hr.oppfolging',
  'hr.compliance',
  'hr.sykefravaer',
  'hr.undersokelse',
  'hr.arshjul',
  'hr.rekruttering',
  'hr.handbok',
  'hr.skjema',
  'arbeid.timeliste',
  'arbeid.timerapport',
  'arbeid.timesaldo',
  'arbeid.godkjenning',
  'arbeid.produktivitet',
  'arbeid.fremdrift',
  'arbeid.fravaer',
  'arbeid.fravaersrapport',
  'arbeid.planlagt',
  'arbeid.salg',
  'okonomi.oversikt',
  'okonomi.faktura',
  'okonomi.fakturagrunnlag',
  'okonomi.utlegg',
  'okonomi.indeks',
  'okonomi.indekser',
  'okonomi.innstillinger',
  'okonomi.inntjening',
  'okonomi.produkter',
  'okonomi.kjorebok',
  'kunder',
  'kunder.undersokelse',
  'kontrakt',
  'projects',
  'anbud.varsling',
  'anbud.foresporsel',
  'anbud.vurdering',
  'anbud.tilbud',
  'anbud.innstillinger',
  'moter',
  'utstyr',
  'skjema',
  'iso.oversikt',
  'iso.prosesser',
  'iso.dokumenter',
  'iso.skjema',
  'iso.krav',
  'iso.lovkrav',
  'iso.kontekst',
  'iso.organisasjon',
  'iso.kommunikasjon',
  'iso.mal',
  'iso.arshjul',
  'iso.avvik',
  'iso.risiko',
  'iso.miljo',
  'iso.hms',
  'iso.prosjekt',
  'iso.kompetanse',
  'iso.leverandorer',
  'iso.beredskap',
  'iso.revisjon',
  'iso.ledelse',
  'iso.sertifisering',
  'iso.innstillinger'
]);

/** Sider som deler innhold med en annen side-id. */
export const PAGE_ALIASES = {
  'hr.ansatte': 'ansatte',
  'ansatte.min-side': 'ansatte',
  'ansatte.mine-gjoremal': 'ansatte',
  'ansatte.mitt-fravaer': 'ansatte',
  'ansatte.mine-utlegg': 'ansatte',
  'selskap.fridager': 'selskap.fravaerstyper',
  'arbeid.fravaer-innstillinger': 'selskap.fravaerstyper',
  'selskap.regnskapskontoer': 'selskap.kontoplan',
  'underenheter': 'selskap.underenheter',
  'okonomi.kunder': 'okonomi.inntjening',
  'okonomi.avtaler': 'okonomi.inntjening',
  'okonomi.prosjektutlegg': 'okonomi.utlegg',
  'arbeid.utlegg': 'okonomi.utlegg',
  'anbud.pipeline': 'anbud.tilbud',
  'more.friends': 'friends',
  'more.settings': 'settings',
  'more.help': 'help',
  'more.moduleAccess': 'moduleAccess',
  'more.legal': 'legal',
  'more.subscription': 'subscription',
  'iso': 'iso.oversikt',
  'anbud': 'anbud.varsling',
  'arbeid': 'arbeid.timeliste',
  'okonomi': 'okonomi.oversikt',
  'hr': 'hr.oversikt',
  'innleie': 'innleie.oversikt',
  'hr.innleid': 'innleie.personell'
};

const DEFAULT_SUBVIEW = {
  anbud: 'varsling',
  arbeid: 'timeliste',
  okonomi: 'oversikt',
  hr: 'oversikt',
  iso: 'oversikt',
  innleie: 'oversikt',
};

const SUBVIEW_TABS = new Set(['anbud', 'arbeid', 'okonomi', 'hr', 'iso', 'selskap', 'kunder', 'innleie']);

/**
 * Side-id for hjelp ut fra fane og underside i skallet.
 * «more» bruker undersiden (friends, settings, help …) som før.
 */
export function helpPageId(tab, subView = null) {
  if (!tab) return null;
  if (tab === 'more') return subView || 'more';
  if (SUBVIEW_TABS.has(tab)) {
    const sub = subView || DEFAULT_SUBVIEW[tab] || null;
    if (!sub) return tab;
    const id = `${tab}.${sub}`;
    return resolvePageKey(id) ? id : tab;
  }
  return tab;
}

/** Nøkkelen i hjelpekatalogen som har innholdet for en side-id, eller null. */
export function resolvePageKey(id) {
  if (!id) return null;
  if (PAGE_KEYS.has(id)) return id;
  const alias = PAGE_ALIASES[id];
  if (alias && PAGE_KEYS.has(alias)) return alias;
  const dot = String(id).indexOf('.');
  if (dot > 0) {
    const parent = String(id).slice(0, dot);
    const parentAlias = PAGE_ALIASES[parent] || parent;
    if (PAGE_KEYS.has(parentAlias)) return parentAlias;
  }
  return null;
}
