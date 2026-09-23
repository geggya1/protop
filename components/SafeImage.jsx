// src/components/SafeImage.jsx
import React, { useEffect, useState } from 'react';
import { Image, View, ActivityIndicator } from 'react-native';
import { storage } from '../firebase';
import { ref as sRef, getDownloadURL } from 'firebase/storage';

function looksLikeRawStorageUrl(url) {
  return typeof url === 'string'
    && url.includes('firebasestorage.googleapis.com')
    && !url.includes('token=');
}
function extractPathFromRawUrl(url) {
  try {
    const after = url.split('/o/')[1] || '';
    const encodedPath = after.split('?')[0] || '';
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

export default function SafeImage({ pathOrUrl, style, resizeMode = 'contain' }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!pathOrUrl) { setSrc(null); return; }

      try {
        if (typeof pathOrUrl === 'string' && pathOrUrl.startsWith('data:image/')) {
          if (!cancelled) setSrc({ uri: pathOrUrl });
          return;
        }

        // Rå REST-URL uten token -> trekk ut path -> getDownloadURL
        if (looksLikeRawStorageUrl(pathOrUrl)) {
          const path = extractPathFromRawUrl(pathOrUrl);
          if (!path) { setSrc(null); return; }
          const url = await getDownloadURL(sRef(storage, path));
          if (!cancelled) setSrc({ uri: url });
          return;
        }

        // Ren Storage-path
        if (typeof pathOrUrl === 'string' && !pathOrUrl.startsWith('http')) {
          const url = await getDownloadURL(sRef(storage, pathOrUrl));
          if (!cancelled) setSrc({ uri: url });
          return;
        }

        // Allerede gyldig URL
        setSrc({ uri: pathOrUrl });
      } catch (e) {
        console.warn('[SafeImage] getDownloadURL feilet', e);
        setSrc(null);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [pathOrUrl]);

  if (!src) {
    return (
      <View style={[{ justifyContent: 'center', alignItems: 'center' }, style]}>
        <ActivityIndicator />
      </View>
    );
  }
  return <Image source={src} style={style} resizeMode={resizeMode} />;
}
