import { Platform } from 'react-native';

/**
 * Ruller et element med nativeID (id i DOM på web) inn i synsfeltet.
 * Gir false når elementet ikke finnes (ennå), så kalleren kan prøve igjen.
 */
export function scrollToAnchor(id, { block = 'start' } = {}) {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !id) return false;
  const el = document.getElementById(id);
  if (!el) return false;
  try {
    el.scrollIntoView({ behavior: 'smooth', block });
  } catch {
    el.scrollIntoView();
  }
  return true;
}

/** Prøver noen ganger mens innholdet lastes (lazy-kort, dokumenter som hentes). */
export function scrollToAnchorSoon(id, { tries = 12, delay = 120, block } = {}) {
  let left = tries;
  let timer = null;
  const attempt = () => {
    if (scrollToAnchor(id, { block }) || --left <= 0) return;
    timer = setTimeout(attempt, delay);
  };
  timer = setTimeout(attempt, 30);
  return () => clearTimeout(timer);
}
