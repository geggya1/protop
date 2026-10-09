/** Stier/URL-er for CV-bilder i Storage — uten Firebase-import (kan testes i Node). */

export function isFirebaseStorageUrl(url = '') {
  return /firebasestorage\.googleapis\.com\/v0\/b\//i.test(String(url))
    || /\.firebasestorage\.app\//i.test(String(url))
    || /\.appspot\.com\//i.test(String(url));
}

export function storagePathFromUrl(pathOrUrl) {
  const value = String(pathOrUrl || '').trim();
  if (!value || value.startsWith('data:')) return '';
  if (/^gs:\/\//i.test(value)) return value.replace(/^gs:\/\/[^/]+\//i, '');
  if (/firebasestorage\.googleapis\.com\/v0\/b\//i.test(value)) {
    try {
      const after = value.split('/o/')[1] || '';
      return decodeURIComponent((after.split('?')[0] || ''));
    } catch {
      return '';
    }
  }
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\//, '');
  return '';
}
