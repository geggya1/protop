import React, { useEffect, useMemo, useState } from 'react';
import { Image, PixelRatio, StyleSheet } from 'react-native';
import { imageVariantUrl, variantForSize } from '../src/utils/imageVariants';

function sizeFromStyle(style) {
  const flat = StyleSheet.flatten(style) || {};
  const w = typeof flat.width === 'number' ? flat.width : 0;
  const h = typeof flat.height === 'number' ? flat.height : 0;
  return Math.max(w, h);
}

/**
 * Bilde fra Firebase Storage som henter utgaven som passer visningen: liten (profilbilder),
 * mobil eller original (se src/utils/imageVariants.js). Mangler utgaven, vises originalen.
 * Brukes som Image: <StorageImage uri={url} style={...} />. `size` overstyrer størrelsen
 * (punkter) når stilen ikke har fast bredde/høyde.
 */
export default function StorageImage({ uri, size, style, ...rest }) {
  const display = size || sizeFromStyle(style);
  const preferred = useMemo(() => {
    const variant = variantForSize(display, PixelRatio.get());
    return variant ? imageVariantUrl(uri, variant) : uri;
  }, [uri, display]);
  const [src, setSrc] = useState(preferred);
  useEffect(() => { setSrc(preferred); }, [preferred]);
  if (!uri) return null;
  return (
    <Image
      {...rest}
      source={{ uri: src }}
      style={style}
      onError={(e) => {
        if (src !== uri) setSrc(uri);
        else rest.onError?.(e);
      }}
    />
  );
}
