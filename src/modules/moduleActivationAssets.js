/**
 * Dedicated transparent illustrations. Filenames come from moduler.json.
 * Same files are used on module pages, help welcome, and activation.
 * Web uses /assets/module-activation/* from public/; native uses bundled requires.
 */
import { Platform } from 'react-native';
import {
  getModuleConfig,
  ILLUSTRATION_DIR,
  PHONE_ILLUSTRATION_FILES,
  publicIllustrationPathForId,
  withIllustrationCache,
} from './moduleActivationRegistry';

const BUNDLED = {
  plan: require('../../assets/module-activation/kalender--module-activation-illustration.png'),
  mail: require('../../assets/module-activation/e-post--module-activation-illustration.png'),
  stars: require('../../assets/module-activation/oppgaver--module-activation-illustration.png'),
  notes: require('../../assets/module-activation/notat--module-activation-illustration.png'),
  friends: require('../../assets/module-activation/venner--module-activation-illustration.png'),
  chat: require('../../assets/module-activation/chat--module-activation-illustration.png'),
  chores: require('../../assets/module-activation/gjoremal--module-activation-illustration.png'),
  shop: require('../../assets/module-activation/handleliste--module-activation-illustration.png'),
  meals: require('../../assets/module-activation/maltidsplanlegger--module-activation-illustration.png'),
  recipes: require('../../assets/module-activation/oppskrift--module-activation-illustration.png'),
  pantry: require('../../assets/module-activation/lager--module-activation-illustration.png'),
  matcoach: require('../../assets/module-activation/ai-matcoach--module-activation-illustration.png'),
  albums: require('../../assets/module-activation/familiealbum--module-activation-illustration.png'),
  wall: require('../../assets/module-activation/familievegg--module-activation-illustration.png'),
  childDrawings: require('../../assets/module-activation/barnetegninger--module-activation-illustration.png'),
  familyTree: require('../../assets/module-activation/familietreet--module-activation-illustration.png'),
  scratchMap: require('../../assets/module-activation/vare-reiser--module-activation-illustration.png'),
  reiseplanlegger: require('../../assets/module-activation/reiseplanlegger--module-activation-illustration.png'),
  wishes: require('../../assets/module-activation/gaveonsker--module-activation-illustration.png'),
  location: require('../../assets/module-activation/familieposisjon--module-activation-illustration.png'),
  rememberDates: require('../../assets/module-activation/husk-dato--module-activation-illustration.png'),
  activities: require('../../assets/module-activation/aktiviteter--module-activation-illustration.png'),
  books: require('../../assets/module-activation/bokhylla--module-activation-illustration.png'),
  games: require('../../assets/module-activation/familiespill--module-activation-illustration.png'),
  progress: require('../../assets/module-activation/barnas-progresjon--module-activation-illustration.png'),
  skole: require('../../assets/module-activation/skole--module-activation-illustration.png'),
  lekser: require('../../assets/module-activation/lekser--module-activation-illustration.png'),
  leksehjelp: require('../../assets/module-activation/leksehjelp--module-activation-illustration.png'),
  mattehjelp: require('../../assets/module-activation/mattehjelp--module-activation-illustration.png'),
  'week-plan': require('../../assets/module-activation/ukeplan--module-activation-illustration.png'),
  holdings: require('../../assets/module-activation/kjoretoy--module-activation-illustration.png'),
  documents: require('../../assets/module-activation/dokumenter--module-activation-illustration.png'),
  boligmappa: require('../../assets/module-activation/boligen--module-activation-illustration.png'),
  hospitality: require('../../assets/module-activation/utleie--module-activation-illustration.png'),
  projects: require('../../assets/module-activation/prosjekt--module-activation-illustration.png'),
  ansatte: require('../../assets/module-activation/ansatte--module-activation-illustration.png'),
  kunder: require('../../assets/module-activation/kunder--module-activation-illustration.png'),
  'anbud-varsling': require('../../assets/module-activation/anbud-varsling--module-activation-illustration.png'),
  'anbud-vurdering': require('../../assets/module-activation/anbud-vurdering--module-activation-illustration.png'),
  'anbud-foresporsel': require('../../assets/module-activation/anbud-foresporsel--module-activation-illustration.png'),
  'anbud-tilbud': require('../../assets/module-activation/anbud-tilbud--module-activation-illustration.png'),
  kontrakt: require('../../assets/module-activation/kontrakt--module-activation-illustration.png'),
  skjema: require('../../assets/module-activation/skjema--module-activation-illustration.png'),
  timeliste: require('../../assets/module-activation/timeliste--module-activation-illustration.png'),
  'arbeid-timeliste': require('../../assets/module-activation/timeliste--module-activation-illustration.png'),
  'arbeid-timerapport': require('../../assets/module-activation/arbeid-timerapport--module-activation-illustration.png'),
  'arbeid-timesaldo': require('../../assets/module-activation/arbeid-timesaldo--module-activation-illustration.png'),
  'arbeid-fravaer': require('../../assets/module-activation/arbeid-fravaer--module-activation-illustration.png'),
  'arbeid-fravaer-innstillinger': require('../../assets/module-activation/arbeid-fravaer--module-activation-illustration.png'),
  'arbeid-fravaersrapport': require('../../assets/module-activation/arbeid-fravaersrapport--module-activation-illustration.png'),
  'arbeid-utlegg': require('../../assets/module-activation/arbeid-utlegg--module-activation-illustration.png'),
  'arbeid-salg': require('../../assets/module-activation/arbeid-salg--module-activation-illustration.png'),
  'okonomi-produkter': require('../../assets/module-activation/okonomi-produkter--module-activation-illustration.png'),
  'arbeid-godkjenning': require('../../assets/module-activation/arbeid-godkjenning--module-activation-illustration.png'),
  iso: require('../../assets/module-activation/iso--module-activation-illustration.png'),
  'hr-oversikt': require('../../assets/module-activation/hr-oversikt--module-activation-illustration.png'),
  'hr-personell': require('../../assets/module-activation/hr-personell--module-activation-illustration.png'),
  'hr-avtaler': require('../../assets/module-activation/hr-avtaler--module-activation-illustration.png'),
  'hr-produktivitet': require('../../assets/module-activation/hr-produktivitet--module-activation-illustration.png'),
  'arbeid-produktivitet': require('../../assets/module-activation/hr-produktivitet--module-activation-illustration.png'),
  'arbeid-fremdrift': require('../../assets/module-activation/hr-produktivitet--module-activation-illustration.png'),
  'hr-lonn': require('../../assets/module-activation/hr-lonn--module-activation-illustration.png'),
  'hr-oppfolging': require('../../assets/module-activation/hr-oppfolging--module-activation-illustration.png'),
  'hr-compliance': require('../../assets/module-activation/hr-compliance--module-activation-illustration.png'),
  'hr-rekruttering': require('../../assets/module-activation/hr-rekruttering--module-activation-illustration.png'),
  'hr-handbok': require('../../assets/module-activation/hr-compliance--module-activation-illustration.png'),
  'hr-skjema': require('../../assets/module-activation/skjema--module-activation-illustration.png'),
  'okonomi-faktura': require('../../assets/module-activation/okonomi-faktura--module-activation-illustration.png'),
  'okonomi-kjorebok': require('../../assets/module-activation/okonomi-kjorebok--module-activation-illustration.png'),
  utstyr: require('../../assets/module-activation/kjoretoy--module-activation-illustration.png'),
  'okonomi-indeks': require('../../assets/module-activation/okonomi-indeks--module-activation-illustration.png'),
  'okonomi-fakturagrunnlag': require('../../assets/module-activation/okonomi-fakturagrunnlag--module-activation-illustration.png'),
  'okonomi-oversikt': require('../../assets/module-activation/okonomi-oversikt--module-activation-illustration.png'),
  'okonomi-utlegg': require('../../assets/module-activation/okonomi-utlegg--module-activation-illustration.png'),
  selskap: require('../../assets/module-activation/selskap--module-activation-illustration.png'),
  underenheter: require('../../assets/module-activation/underenheter--module-activation-illustration.png'),
  'selskap-tilgang': require('../../assets/module-activation/selskap-tilgang--module-activation-illustration.png'),
};

const BUNDLED_PHONE = {
  'okonomi-faktura': require('../../assets/module-activation/okonomi-faktura-phone--module-activation-illustration.png'),
  'arbeid-godkjenning': require('../../assets/module-activation/arbeid-godkjenning-phone--module-activation-illustration.png'),
  'okonomi-produkter': require('../../assets/module-activation/okonomi-produkter-phone--module-activation-illustration.png'),
  'okonomi-utlegg': require('../../assets/module-activation/okonomi-utlegg-phone--module-activation-illustration.png'),
  'arbeid-fravaer': require('../../assets/module-activation/arbeid-fravaer-phone--module-activation-illustration.png'),
  'arbeid-fravaer-innstillinger': require('../../assets/module-activation/arbeid-fravaer-phone--module-activation-illustration.png'),
  'arbeid-fravaersrapport': require('../../assets/module-activation/arbeid-fravaer-phone--module-activation-illustration.png'),
  timeliste: require('../../assets/module-activation/timeliste-phone--module-activation-illustration.png'),
  'arbeid-timeliste': require('../../assets/module-activation/timeliste-phone--module-activation-illustration.png'),
};

/** ModulePageBg / screen `name` → catalog module id. */
export const PAGE_NAME_TO_MODULE_ID = {
  documents: 'documents',
  pantry: 'pantry',
  matcoach: 'matcoach',
  location: 'location',
  scratchMap: 'scratchMap',
  games: 'games',
  progress: 'progress',
  boligmappa: 'boligmappa',
  hospitality: 'hospitality',
  holdings: 'holdings',
  books: 'books',
  activities: 'activities',
  'remember-dates': 'rememberDates',
  albums: 'albums',
  'family-tree': 'familyTree',
  reiseplanlegger: 'reiseplanlegger',
  wall: 'wall',
  childDrawings: 'childDrawings',
  meals: 'meals',
  recipes: 'recipes',
  notes: 'notes',
  chat: 'chat',
  shop: 'shop',
  wishes: 'wishes',
  stars: 'stars',
  chores: 'chores',
  skole: 'skole',
  lekser: 'lekser',
  leksehjelp: 'leksehjelp',
  mattehjelp: 'mattehjelp',
  'week-plan': 'week-plan',
};

export function moduleIdForPageName(name) {
  if (!name) return null;
  if (PAGE_NAME_TO_MODULE_ID[name]) return PAGE_NAME_TO_MODULE_ID[name];
  if (BUNDLED[name]) return name;
  return null;
}

export function illustrationSourceById(moduleId, { preferBundled = false, phone = false } = {}) {
  if (!moduleId) return null;
  const phoneFile = phone ? PHONE_ILLUSTRATION_FILES[moduleId] : null;
  if (phoneFile) {
    if (preferBundled) return BUNDLED_PHONE[moduleId] || BUNDLED[moduleId] || null;
    if (Platform.OS === 'web') {
      return { uri: withIllustrationCache(`${ILLUSTRATION_DIR}/${phoneFile}`) };
    }
    if (BUNDLED_PHONE[moduleId]) return BUNDLED_PHONE[moduleId];
  }
  if (preferBundled) return BUNDLED[moduleId] || illustrationSourceForModule(moduleId, null);
  const path = publicIllustrationPathForId(moduleId, getModuleConfig(moduleId)?.illustrationPath);
  return illustrationSourceForModule(moduleId, path);
}

export function illustrationSourceForModule(moduleId, illustrationPath) {
  if (Platform.OS === 'web' && illustrationPath) {
    const path = String(illustrationPath);
    if (path.startsWith('/') || path.startsWith('http')) {
      return { uri: withIllustrationCache(path) };
    }
  }
  if (BUNDLED[moduleId]) return BUNDLED[moduleId];
  if (illustrationPath) return { uri: withIllustrationCache(illustrationPath) };
  return BUNDLED.plan;
}
