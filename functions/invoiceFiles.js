/**
 * Filer som legges ved fakturaer: bare fra bedriftens egen mappe i Storage.
 */

/** Sti i Storage fra en Firebase-nedlastingslenke. */
export function storagePathFromUrl(url) {
  const raw = String(url || '');
  const match = raw.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?#]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
}

export function allowedPath(path, familyId) {
  const value = String(path || '');
  const family = String(familyId || '').trim();
  return !!value && !!family && !family.includes('/') && value.startsWith(`families/${family}/`) && !value.includes('..');
}
