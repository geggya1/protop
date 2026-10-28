/**
 * Flatene på Hjem (UX-05). Widgetkortene er vanlige ProTop-kort, de samme som i
 * modulene: colors.card, strek i colors.line, radius.card og skygge nivå 1. De følger
 * lyst og mørkt utseende. Med bakgrunnsbilde ligger de samme kortene oppå bildet,
 * så teksten har samme kontrast som ellers i appen. Bare det som står rett på bildet
 * (hilsenen og redigeringsknappen) er hvitt eller frostet.
 */

import { Platform, StyleSheet } from 'react-native';
import { colors } from '../../src/theme';
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
