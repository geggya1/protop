import { Platform } from 'react-native';

/**
 * Soft dashboard look — matches design mockups.
 * Hierarchy via size. Titles are 500, body stays 400. Never bold.
 * Inter reads lighter than Nunito at the same numeric weight.
 *
 * Always light: frosted home widgets sit on photo backgrounds and must keep
 * dark ink. Global appearance (menus/forms) uses theme `colors`, not `soft`.
 * Ink and muted stay dark enough that body text does not look gray on the
 * photo. Titles use 500; running text stays 400.
 */
export const soft = {
  bg: '#F5F2EC',
  card: '#FFFFFF',
  ink: '#12171E',
  muted: '#2C3644',
  quiet: '#455062',
  line: '#E8E4DC',
  mint: '#E8F3EC',
  peach: '#F8EDE6',
  lavender: '#EEF0F8',
  sky: '#E8F0F6',
  cream: '#FAF7F2',
  family: '#F7F3EA',
  sage: '#345743',
  brandSoft: '#DCE8E0',
  display: Platform.OS === 'web' ? 'Fraunces, Georgia, "Times New Roman", serif' : undefined,
  /** Thin sans — avoid Nunito which looks heavy even at 400/500 */
  body: Platform.OS === 'web' ? 'Inter, system-ui, -apple-system, sans-serif' : undefined,
  script: Platform.OS === 'web' ? '"Segoe Script", "Apple Chancery", cursive' : undefined,
  /** Body stays regular. Titles use 500 so the letters do not look thin and gray. */
  wReg: '400',
  wMed: '500',
  wSemi: '500',
  radius: 14,
  radiusSm: 10,
};
