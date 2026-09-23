import { Platform } from 'react-native';

/**
 * Shared frosted chrome for immersive home bottom dock (photo backdrop).
 * Top shell logo bar stays white like other modules — see ShellHeader chromeOnly.
 */
export const IMMERSIVE_GLASS_BG = 'rgba(28, 34, 44, 0.72)';

export const immersiveGlassBlur = Platform.OS === 'web'
  ? {
      backdropFilter: 'blur(28px) saturate(1.1)',
      WebkitBackdropFilter: 'blur(28px) saturate(1.1)',
    }
  : null;

/**
 * Glass chrome for immersive home.
 * Bottom dock sits flush on the viewport edge (static tab bar).
 * Top edge keeps a slight float for the logo bar when used.
 */
export function immersiveGlassBarStyle({ edge = 'bottom' } = {}) {
  if (edge === 'top') {
    return {
      backgroundColor: IMMERSIVE_GLASS_BG,
      borderRadius: 24,
      overflow: 'hidden',
      marginHorizontal: 12,
      marginTop: 8,
      ...immersiveGlassBlur,
    };
  }

  // Bottom: edge-to-edge, pinned to the screen bottom — no floating gap.
  return {
    backgroundColor: IMMERSIVE_GLASS_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    marginHorizontal: 0,
    marginBottom: 0,
    ...immersiveGlassBlur,
  };
}
