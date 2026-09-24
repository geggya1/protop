/** Pure helper — no React Native dependency (safe for Node tests). */
export function detectAppleMobileWeb({
  ua = '',
  platform = '',
  maxTouchPoints = 0,
} = {}) {
  if (/iPad|iPhone|iPod/.test(ua || '')) return true;
  // iPadOS 13+ kan rapportere som MacIntel med touch
  return platform === 'MacIntel' && (maxTouchPoints || 0) > 1;
}

export function isAppleMobileWeb() {
  if (typeof navigator === 'undefined') return false;
  return detectAppleMobileWeb({
    ua: navigator.userAgent || '',
    platform: navigator.platform || '',
    maxTouchPoints: navigator.maxTouchPoints || 0,
  });
}
