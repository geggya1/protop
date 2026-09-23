import { Platform } from 'react-native';

/**
 * Farge som følger lyst/mørkt uten at hver StyleSheet må bygges på nytt.
 * Web: CSS-variabel. iOS: DynamicColorIOS (styres av Appearance.setColorScheme).
 * Android: lys hex i statiske stiler; aktive flater leses fra AppearanceProvider.
 */
export function adaptiveColor(varName, light, dark) {
  if (Platform.OS === 'web') return `var(${varName})`;
  if (Platform.OS === 'ios') {
    const { DynamicColorIOS } = require('react-native');
    return DynamicColorIOS({ light, dark });
  }
  return light;
}
