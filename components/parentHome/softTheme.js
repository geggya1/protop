import { Platform } from 'react-native';

/**
 * Soft dashboard look — matches design mockups.
 * NEVER use bold/heavy weights. Hierarchy via size + serif display only.
 * Inter reads lighter than Nunito at the same numeric weight.
 *
 * Always light: frosted home widgets sit on photo backgrounds and must keep
 * dark ink. Global appearance (menus/forms) uses theme `colors`, not `soft`.
 */
export const soft = {
  bg: '#F5F2EC',
  card: '#FFFFFF',
  ink: '#1F2630',
  muted: '#5C6573',
  quiet: '#7A8494',
  line: '#E8E4DC',
  mint: '#E8F3EC',
  peach: '#F8EDE6',
  lavender: '#EEF0F8',
  sky: '#E8F0F6',
  cream: '#FAF7F2',
  family: '#F7F3EA',
  sage: '#5A7A60',
  brandSoft: '#DCE8E0',
  display: Platform.OS === 'web' ? 'Fraunces, Georgia, "Times New Roman", serif' : undefined,
  /** Thin sans — avoid Nunito which looks heavy even at 400/500 */
  body: Platform.OS === 'web' ? 'Inter, system-ui, -apple-system, sans-serif' : undefined,
  script: Platform.OS === 'web' ? '"Segoe Script", "Apple Chancery", cursive' : undefined,
  /** Cap at regular — never medium/semi/bold for soft dashboards */
  wReg: '400',
  wMed: '400',
  wSemi: '400',
  radius: 14,
  radiusSm: 10,
};
