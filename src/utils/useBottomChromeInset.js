import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useParentBottomNavChrome } from '../hooks/useParentBottomNavChrome';

/**
 * Extra bottom inset for FABs / scroll padding.
 * Parent theme bottom-nav height is added when that bar is visible in AppShell.
 */
export const SHELL_TAB_BAR_HEIGHT = 0;

export function useBottomChromeInset() {
  const insets = useSafeAreaInsets();
  const [browserChrome, setBrowserChrome] = useState(0);
  const parentNavHeight = useParentBottomNavChrome();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const update = () => {
      const vv = window.visualViewport;
      if (!vv) {
        setBrowserChrome(0);
        return;
      }
      const gap = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setBrowserChrome(gap);
    };

    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // When the parent bottom nav is visible its measured height already includes
  // safe-area padding (padding lives inside the bar so it sits flush to the bottom).
  const shellBottom = browserChrome
    + (parentNavHeight > 0 ? parentNavHeight : insets.bottom);
  const dockHeight = shellBottom;
  const fabBottom = dockHeight + 18;
  const contentPaddingBottom = fabBottom + 58;

  return {
    insets,
    browserChrome,
    shellBottom,
    dockHeight,
    fabBottom,
    contentPaddingBottom,
    tabBarHeight: parentNavHeight || SHELL_TAB_BAR_HEIGHT,
  };
}
