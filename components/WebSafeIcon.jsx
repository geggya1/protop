import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { storage } from '../firebase';
import { ref as storageRef, getBytes, getDownloadURL } from 'firebase/storage';

// --- helpers -----------------------------------------------------------
function isFirebaseStorageUrl(u = '') {
  return /firebasestorage\.googleapis\.com\/v0\/b\//i.test(u);
}
function extractPathFromFirebaseUrl(url) {
  try {
    const after = url.split('/o/')[1] || '';
    const encodedPath = after.split('?')[0] || '';
    return decodeURIComponent(encodedPath);
  } catch { return null; }
}
function toStoragePath(pathOrUrl) {
  if (!pathOrUrl) return null;
  // gs://bucket/icons/file.png  -> icons/file.png
  if (/^gs:\/\//i.test(pathOrUrl)) {
    return pathOrUrl.replace(/^gs:\/\/[^/]+\//i, '');
  }
  // https://firebasestorage.googleapis.com/v0/b/.../o/icons%2Ffile.png?...
  if (isFirebaseStorageUrl(pathOrUrl)) {
    return extractPathFromFirebaseUrl(pathOrUrl);
  }
  // already a relative storage path or external url
  return pathOrUrl;
}

function isWebPublicPath(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');
}
// ----------------------------------------------------------------------

export default function WebSafeIcon({
  pathOrUrl, style, resizeMode = 'contain', fallback = null,
}) {
  const [uri, setUri] = useState(null);
  const [err, setErr] = useState(false);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setErr(false);
      setUri(null);

      if (!pathOrUrl) {
        if (alive) setErr(true);
        return;
      }

      // Normalize
      const normalized = toStoragePath(pathOrUrl);

      try {
        if (Platform.OS === 'web') {
          // Statiske filer under /public (f.eks. /icons/catalog/…)
          if (isWebPublicPath(normalized)) {
            if (alive) setUri(normalized);
            return;
          }
          // If it's a storage path (no protocol), go via getBytes -> Blob, else use as is
          if (!/^https?:\/\//i.test(normalized) || isFirebaseStorageUrl(pathOrUrl)) {
            const ref = storageRef(storage, normalized);
            const bytes = await getBytes(ref, 1024 * 1024 * 8); // up to 8MB
            const blobUrl = URL.createObjectURL(new Blob([bytes]));

            // Revoke previous blob url to avoid leaks
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = blobUrl;

            if (alive) setUri(blobUrl);
            return;
          }
          if (alive) setUri(normalized);
          return;
        }

        // Native (iOS/Android)
        if (isWebPublicPath(normalized)) {
          // Native har ikke /public — fall til Storage-sti uten ledende slash
          const storagePath = normalized.replace(/^\//, '');
          const url = await getDownloadURL(storageRef(storage, storagePath));
          if (alive) setUri(url);
          return;
        }
        if (!/^https?:\/\//i.test(normalized)) {
          const url = await getDownloadURL(storageRef(storage, normalized));
          if (alive) setUri(url);
        } else {
          if (alive) setUri(normalized);
        }
      } catch (e) {
        console.warn('[WebSafeIcon] load failed:', e);
        if (alive) setErr(true);
      }
    }

    load();

    return () => {
      alive = false;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [pathOrUrl]);

  if (fallback && (err || !uri)) return fallback;
  if (err) return <View style={[style, { backgroundColor: '#eee', borderRadius: 10 }]} />;
  if (!uri) return <View style={[style, { backgroundColor: '#f3f4f6', borderRadius: 10 }]} />;
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setErr(true)}
    />
  );
}
