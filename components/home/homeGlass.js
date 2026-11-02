/**
 * Flatene på Hjem (UX-05). Widgetkortene er vanlige ProTop-kort, de samme som i
 * modulene: colors.card, strek i colors.line, radius.card og skygge nivå 1. De følger
 * lyst og mørkt utseende. Med bakgrunnsbilde blir kortene mørkt glass i bildets egen
 * farge med hvit tekst (useGlassCard / useHomePalette).
 */

import { Platform, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { colors } from '../../src/theme';
import { useHomeGlassTint } from '../../src/context/HomeImmersiveContext';
import { glassStyles } from '../../src/utils/glassInk';
import { elevationStyle, radius } from '../../src/ui/tokens';

const webFrost = Platform.OS === 'web' ? {
  backdropFilter: 'blur(22px) saturate(1.18)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.18)',
} : null;

/** Widgetkortet på Hjem: samme kort som i modulene. */
export const homeCardSurface = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radius.card,
  ...elevationStyle(1, Platform.OS === 'web' ? 'web' : 'native'),
};

/** Kortet oppå bakgrunnsbildet er det samme ProTop-kortet. */
export const immersiveCardSurface = homeCardSurface;

/** Rader og fliser inne i et kort: sidens bakgrunn, så dempet tekst holder 4,5:1 også i mørkt. */
export const immersiveChipSurface = {
  backgroundColor: colors.bg,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: colors.line,
};

/** Ikonplate bak modulikoner (snarveier). */
export const immersiveIconDisc = {
  backgroundColor: colors.brandSoft,
};

/**
 * Små knapper rett på bildet (blyanten). Frostet, med hvitt ikon.
 */
export const immersiveGlass = {
  backgroundColor: 'rgba(255,255,255,0.45)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.75)',
  ...webFrost,
  ...(Platform.OS === 'web' ? {
    boxShadow: '0 4px 14px rgba(20, 28, 45, 0.1)',
  } : null),
};

/**
 * Cellen i rutenettet er gjennomsiktig; kortet fyller cellen (height 100%),
 * så innholdet aldri tegnes utenfor.
 */
export const immersiveWidgetCell = {
  backgroundColor: 'transparent',
  borderWidth: 0,
};

/** Tekst rett på bildet (hilsenen): hvit med skygge. */
export const immersiveHeroText = '#FFFFFF';
export const immersiveHeroMuted = 'rgba(255,255,255,0.9)';

/**
 * Med bakgrunnsbilde: mørkt glass i bildets egen farge, hvit tekst.
 * Mørkt slør beholder fargen i bildet der hvitt frost gjør det grått, og hvit tekst
 * leses også på iPhone, der det ikke er uskarphet bak kortene.
 */
export function tintedCardSurface(tint) {
  const isWeb = Platform.OS === 'web';
  return {
    backgroundColor: `rgba(${tint}, ${isWeb ? 0.56 : 0.66})`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 18,
    ...(isWeb ? {
      backdropFilter: 'blur(10px) saturate(1.5)',
      WebkitBackdropFilter: 'blur(10px) saturate(1.5)',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
    } : null),
  };
}

/** Kortflaten på Hjem: mørkt glass på bilde, ellers ProTop-kortet. */
export function useGlassCard() {
  const tint = useHomeGlassTint();
  return useMemo(() => (tint ? tintedCardSurface(tint) : homeCardSurface), [tint]);
}

/** Stilark laget for lyse kort, skrevet om til hvit tekst når Hjem har mørkt glass. */
export function useGlassStyles(sheet) {
  const tint = useHomeGlassTint();
  return tint ? glassStyles(sheet) : sheet;
}

/**
 * Fargene til Hjem-widgetene. Uten bilde: ProTop-fargene (følger lyst og mørkt).
 * På bilde: hvit tekst, svake hvite slør og tynne hvite linjer på mørkt glass.
 */
export function useHomePalette() {
  const tint = useHomeGlassTint();
  return useMemo(() => (tint ? {
    glass: true,
    card: tintedCardSurface(tint),
    ink: '#FFFFFF',
    muted: 'rgba(255,255,255,0.74)',
    faint: 'rgba(255,255,255,0.55)',
    line: 'rgba(255,255,255,0.18)',
    chip: 'rgba(255,255,255,0.12)',
    chipStrong: 'rgba(255,255,255,0.2)',
    accent: '#8CCBFF',
    accentSoft: 'rgba(140,203,255,0.2)',
    accentInk: '#FFFFFF',
    onAccent: '#0B2236',
    success: '#7EE2A8',
    successSoft: 'rgba(126,226,168,0.18)',
    warn: '#FFD27A',
    warnSoft: 'rgba(255,210,122,0.18)',
    warnInk: '#FFD27A',
    danger: '#FF9C8F',
    dangerSoft: 'rgba(255,156,143,0.18)',
    track: 'rgba(255,255,255,0.16)',
  } : {
    glass: false,
    card: homeCardSurface,
    ink: colors.ink,
    muted: colors.muted,
    faint: colors.muted,
    line: colors.line,
    chip: colors.bg,
    chipStrong: colors.brandSoft,
    accent: colors.brand,
    accentSoft: colors.brandSoft,
    accentInk: colors.brandInk,
    // Teksten på en fylt brandInk-knapp (mørk på lys blå i mørkt utseende).
    onAccent: colors.onBrand,
    success: colors.success,
    successSoft: colors.successSoft,
    warn: colors.warn,
    warnSoft: colors.starSoft,
    warnInk: colors.warnInk,
    danger: colors.danger,
    dangerSoft: colors.dangerSoft,
    track: colors.line,
  }), [tint]);
}
