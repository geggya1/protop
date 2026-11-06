/**
 * Dedicated transparent illustrations. Filenames come from moduler.json.
 * Same files are used on module pages, help welcome, and activation.
 * Web uses /assets/module-activation/* from public/; native uses bundled requires.
 */
import { Dimensions, Platform } from 'react-native';
import {
  getModuleConfig,
  ILLUSTRATION_DIR,
  PHONE_ILLUSTRATION_FILES,
  publicIllustrationPathForId,
  withIllustrationCache,
} from './moduleActivationRegistry';

/**
 * Web: telefoner (smal skjerm) henter mobilutgaven (<navn>-m.webp, høyst 640 px bred, ca. halve
 * størrelsen). PC og nettbrett henter full størrelse. Mobilappen bruker de innebygde filene.
 */
function sizedForScreen(path) {
  const p = String(path || '');
  if (Platform.OS !== 'web' || !/--module-activation-illustration\.webp/.test(p)) return p;
  let width = 1024;
  try { width = Dimensions.get('window')?.width || width; } catch { /* ignore */ }
  return width < 768 ? p.replace(/\.webp(?=$|\?)/, '-m.webp') : p;
}

const BUNDLED = {
  plan: require('../../assets/module-activation/kalender--module-activation-illustration.webp'),
  mail: require('../../assets/module-activation/e-post--module-activation-illustration.webp'),
  stars: require('../../assets/module-activation/oppgaver--module-activation-illustration.webp'),
  notes: require('../../assets/module-activation/notat--module-activation-illustration.webp'),
  friends: require('../../assets/module-activation/venner--module-activation-illustration.webp'),
  chat: require('../../assets/module-activation/chat--module-activation-illustration.webp'),
  documents: require('../../assets/module-activation/dokumenter--module-activation-illustration.webp'),
  projects: require('../../assets/module-activation/prosjekt--module-activation-illustration.webp'),
  ansatte: require('../../assets/module-activation/ansatte--module-activation-illustration.webp'),
  'hr-ansatte': require('../../assets/module-activation/ansatte--module-activation-illustration.webp'),
  ansatt: require('../../assets/module-activation/ansatte--module-activation-illustration.webp'),
  kunder: require('../../assets/module-activation/kunder--module-activation-illustration.webp'),
  'anbud-varsling': require('../../assets/module-activation/anbud-varsling--module-activation-illustration.webp'),
  'anbud-vurdering': require('../../assets/module-activation/anbud-vurdering--module-activation-illustration.webp'),
  'anbud-foresporsel': require('../../assets/module-activation/anbud-foresporsel--module-activation-illustration.webp'),
  'anbud-tilbud': require('../../assets/module-activation/anbud-tilbud--module-activation-illustration.webp'),
  kontrakt: require('../../assets/module-activation/kontrakt--module-activation-illustration.webp'),
  skjema: require('../../assets/module-activation/skjema--module-activation-illustration.webp'),
  timeliste: require('../../assets/module-activation/timeliste--module-activation-illustration.webp'),
  'arbeid-timeliste': require('../../assets/module-activation/timeliste--module-activation-illustration.webp'),
  'arbeid-timerapport': require('../../assets/module-activation/arbeid-timerapport--module-activation-illustration.webp'),
  'arbeid-timesaldo': require('../../assets/module-activation/arbeid-timesaldo--module-activation-illustration.webp'),
  'arbeid-fravaer': require('../../assets/module-activation/arbeid-fravaer--module-activation-illustration.webp'),
  'arbeid-fravaer-innstillinger': require('../../assets/module-activation/arbeid-fravaer--module-activation-illustration.webp'),
  'moter-oversikt': require('../../assets/module-activation/moter--module-activation-illustration.webp'),
  'moter-oppfolging': require('../../assets/module-activation/moter--module-activation-illustration.webp'),
  'moter-maler': require('../../assets/module-activation/moter--module-activation-illustration.webp'),
  'arbeid-fravaersrapport': require('../../assets/module-activation/arbeid-fravaersrapport--module-activation-illustration.webp'),
  'arbeid-utlegg': require('../../assets/module-activation/arbeid-utlegg--module-activation-illustration.webp'),
  'arbeid-salg': require('../../assets/module-activation/arbeid-salg--module-activation-illustration.webp'),
  'okonomi-produkter': require('../../assets/module-activation/okonomi-produkter--module-activation-illustration.webp'),
  'arbeid-godkjenning': require('../../assets/module-activation/arbeid-godkjenning--module-activation-illustration.webp'),
  iso: require('../../assets/module-activation/iso--module-activation-illustration.webp'),
  'hr-oversikt': require('../../assets/module-activation/hr-oversikt--module-activation-illustration.webp'),
  'hr-personell': require('../../assets/module-activation/hr-personell--module-activation-illustration.webp'),
  'innleie-oversikt': require('../../assets/module-activation/hr-personell--module-activation-illustration.webp'),
  'innleie-personell': require('../../assets/module-activation/hr-personell--module-activation-illustration.webp'),
  'hr-avtaler': require('../../assets/module-activation/hr-avtaler--module-activation-illustration.webp'),
  'hr-produktivitet': require('../../assets/module-activation/hr-produktivitet--module-activation-illustration.webp'),
  'arbeid-produktivitet': require('../../assets/module-activation/hr-produktivitet--module-activation-illustration.webp'),
  'arbeid-fremdrift': require('../../assets/module-activation/hr-produktivitet--module-activation-illustration.webp'),
  'hr-lonn': require('../../assets/module-activation/hr-lonn--module-activation-illustration.webp'),
  'hr-oppfolging': require('../../assets/module-activation/hr-oppfolging--module-activation-illustration.webp'),
  'hr-compliance': require('../../assets/module-activation/hr-compliance--module-activation-illustration.webp'),
  'hr-rekruttering': require('../../assets/module-activation/hr-rekruttering--module-activation-illustration.webp'),
  'hr-arshjul': require('../../assets/module-activation/hr-oppfolging--module-activation-illustration.webp'),
  'hr-sykefravaer': require('../../assets/module-activation/hr-oppfolging--module-activation-illustration.webp'),
  'hr-undersokelse': require('../../assets/module-activation/hr-oppfolging--module-activation-illustration.webp'),
  'hr-handbok': require('../../assets/module-activation/hr-compliance--module-activation-illustration.webp'),
  'hr-skjema': require('../../assets/module-activation/skjema--module-activation-illustration.webp'),
  'okonomi-faktura': require('../../assets/module-activation/okonomi-faktura--module-activation-illustration.webp'),
  'okonomi-kjorebok': require('../../assets/module-activation/okonomi-kjorebok--module-activation-illustration.webp'),
  utstyr: require('../../assets/module-activation/kjoretoy--module-activation-illustration.webp'),
  'okonomi-indeks': require('../../assets/module-activation/okonomi-indeks--module-activation-illustration.webp'),
  'okonomi-fakturagrunnlag': require('../../assets/module-activation/okonomi-fakturagrunnlag--module-activation-illustration.webp'),
  'okonomi-oversikt': require('../../assets/module-activation/okonomi-oversikt--module-activation-illustration.webp'),
  'okonomi-utlegg': require('../../assets/module-activation/okonomi-utlegg--module-activation-illustration.webp'),
  'okonomi-innstillinger': require('../../assets/module-activation/selskap--module-activation-illustration.webp'),
  selskap: require('../../assets/module-activation/selskap--module-activation-illustration.webp'),
  underenheter: require('../../assets/module-activation/underenheter--module-activation-illustration.webp'),
  'selskap-tilgang': require('../../assets/module-activation/selskap-tilgang--module-activation-illustration.webp'),
};

const BUNDLED_PHONE = {
  'okonomi-faktura': require('../../assets/module-activation/okonomi-faktura-phone--module-activation-illustration.webp'),
  'arbeid-godkjenning': require('../../assets/module-activation/arbeid-godkjenning-phone--module-activation-illustration.webp'),
  'okonomi-produkter': require('../../assets/module-activation/okonomi-produkter-phone--module-activation-illustration.webp'),
  'okonomi-utlegg': require('../../assets/module-activation/okonomi-utlegg-phone--module-activation-illustration.webp'),
  'arbeid-fravaer': require('../../assets/module-activation/arbeid-fravaer-phone--module-activation-illustration.webp'),
  'arbeid-fravaer-innstillinger': require('../../assets/module-activation/arbeid-fravaer-phone--module-activation-illustration.webp'),
  'arbeid-fravaersrapport': require('../../assets/module-activation/arbeid-fravaer-phone--module-activation-illustration.webp'),
  timeliste: require('../../assets/module-activation/timeliste-phone--module-activation-illustration.webp'),
  'arbeid-timeliste': require('../../assets/module-activation/timeliste-phone--module-activation-illustration.webp'),
  'moter-oversikt': require('../../assets/module-activation/moter-phone--module-activation-illustration.webp'),
  'moter-oppfolging': require('../../assets/module-activation/moter-phone--module-activation-illustration.webp'),
  'moter-maler': require('../../assets/module-activation/moter-phone--module-activation-illustration.webp'),
};

/** ModulePageBg / screen `name` → catalog module id. */
export const PAGE_NAME_TO_MODULE_ID = {
  documents: 'documents',
  notes: 'notes',
  chat: 'chat',
  stars: 'stars',
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
      return { uri: withIllustrationCache(sizedForScreen(`${ILLUSTRATION_DIR}/${phoneFile}`)) };
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
      return { uri: withIllustrationCache(sizedForScreen(path)) };
    }
  }
  if (BUNDLED[moduleId]) return BUNDLED[moduleId];
  if (illustrationPath) return { uri: withIllustrationCache(illustrationPath) };
  return BUNDLED.plan;
}
