/**
 * Dedicated transparent illustrations. Filenames come from moduler.json.
 * Same files are used on module pages, help welcome, and activation.
 * Web uses /assets/module-activation/* from public/; native uses bundled requires.
 */
import { Platform } from 'react-native';
import {
  getModuleConfig,
  publicIllustrationPathForId,
  withIllustrationCache,
} from './moduleActivationRegistry';

const BUNDLED = {
  plan: require('../../assets/module-activation/kalender--module-activation-illustration.png'),
  mail: require('../../assets/module-activation/e-post--module-activation-illustration.png'),
  stars: require('../../assets/module-activation/oppgaver--module-activation-illustration.png'),
  notes: require('../../assets/module-activation/notat--module-activation-illustration.png'),
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

export function illustrationSourceById(moduleId, { preferBundled = false } = {}) {
  if (!moduleId) return null;
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
