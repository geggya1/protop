import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  applyVisualViewportFrame,
  publishVisualViewportFrame,
  visualViewportFrame,
} from './visualViewportFrame';

let installed = false;

/**
 * Keep --protop-vv-* in sync with the visible area on web.
 * Phone CSS sizes the shell to top + visible + bottom, so the header
 * is the top layer and the bottom menu is the bottom layer.
 */
export function installPhoneVisualViewport() {
  if (installed) return;
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;

  let last = '';
  const update = () => {
    const next = visualViewportFrame(window.visualViewport, window.innerHeight);
    const key = `${next.top}:${next.height}:${next.bottom}`;
    if (key === last) return;
    last = key;
    publishVisualViewportFrame(next);
    applyVisualViewportFrame(document, next);
  };

  update();
  const vv = window.visualViewport;
  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
}

export function usePhoneVisualViewport() {
  useEffect(() => {
    installPhoneVisualViewport();
  }, []);
}
