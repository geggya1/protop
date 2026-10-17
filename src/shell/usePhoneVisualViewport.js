import { useEffect } from 'react';
import { Platform } from 'react-native';
import { applyVisualViewportFrame, visualViewportFrame } from './visualViewportFrame';

/**
 * Keep --protop-vv-* in sync with the visible area on web.
 * Phone CSS pins html/body/#root to those variables so the shell,
 * top menu and bottom nav stay flush with the browser chrome.
 */
export function usePhoneVisualViewport() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    let last = '';
    const update = () => {
      const next = visualViewportFrame(window.visualViewport, window.innerHeight);
      const key = `${next.top}:${next.height}`;
      if (key === last) return;
      last = key;
      applyVisualViewportFrame(document, next);
    };

    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
}
