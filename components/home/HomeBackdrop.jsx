import React, { useEffect, useMemo, useState } from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';
import { CUSTOM_BANNER_ID, DEFAULT_HOME_BANNER_ID, getHomeBanner } from '../../src/homeBanners';
import { containBackdropBox, resolveSourceAspect } from '../../src/utils/homeBackdropFit';

/** Authored fullscreen banners are ~941×1672 (9:16). Used until getSize resolves. */
const FALLBACK_MOBILE_ASPECT = 941 / 1672;

const webBlurFill = Platform.OS === 'web'
  ? { objectFit: 'cover', filter: 'blur(28px)', transform: 'scale(1.12)' }
  : null;

/** Full-screen photo behind phone home chrome, widgets and dock. */
function HomeBackdrop({ bannerId, customUri } = {}) {
  const id = bannerId || DEFAULT_HOME_BANNER_ID;
  const pack = id === CUSTOM_BANNER_ID ? null : getHomeBanner(id);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const source = useMemo(
    () => (customUri ? { uri: customUri } : pack?.source || null),
    [customUri, pack?.source],
  );

  const assetAspect = useMemo(
    () => (source && !customUri ? resolveSourceAspect(source, Image) : null),
    [source, customUri],
  );
  const [uriAspect, setUriAspect] = useState(null);

  useEffect(() => {
    if (!customUri) {
      setUriAspect(null);
      return undefined;
    }
    let alive = true;
    Image.getSize(
      customUri,
      (w, h) => {
        if (alive && w > 0 && h > 0) setUriAspect(w / h);
      },
      () => {
        if (alive) setUriAspect(null);
      },
    );
    return () => { alive = false; };
  }, [customUri]);

  const imageAspect = uriAspect || assetAspect || FALLBACK_MOBILE_ASPECT;

  const box = useMemo(() => {
    if (!(layout.width > 0 && layout.height > 0)) return null;
    return containBackdropBox(layout.width, layout.height, imageAspect);
  }, [layout.width, layout.height, imageAspect]);

  const onRootLayout = (e) => {
    const { width, height } = e?.nativeEvent?.layout || {};
    if (!(width > 0 && height > 0)) return;
    setLayout((prev) => (
      prev.width === width && prev.height === height
        ? prev
        : { width, height }
    ));
  };

  const sharpStyle = box ? [
    styles.img,
    {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    },
    Platform.OS === 'web' ? { objectFit: 'fill' } : null,
  ] : [
    styles.imgFill,
    Platform.OS === 'web' ? { objectFit: 'contain' } : null,
  ];

  return (
    <View
      pointerEvents="none"
      style={styles.root}
      testID="home-backdrop"
      onLayout={onRootLayout}
    >
      {source ? (
        <>
          {/* Soft cover fill: screen stays covered without zooming the sharp photo. */}
          <Image
            source={source}
            style={[styles.imgFill, styles.blurFill, webBlurFill]}
            resizeMode="cover"
            blurRadius={Platform.OS === 'web' ? 0 : 28}
            fadeDuration={0}
            testID="home-backdrop-fill"
          />
          <Image
            source={source}
            style={sharpStyle}
            resizeMode={box ? 'stretch' : 'contain'}
            fadeDuration={0}
            testID="home-backdrop-image"
          />
        </>
      ) : (
        <View style={styles.fallback} />
      )}
      <View style={styles.scrimTop} testID="home-backdrop-scrim-top" />
      <View style={styles.scrimBottom} testID="home-backdrop-scrim-bottom" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
    backgroundColor: '#1a2430',
  },
  img: {
    position: 'absolute',
  },
  imgFill: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  blurFill: {
    opacity: 0.9,
  },
  fallback: { ...StyleSheet.absoluteFillObject, backgroundColor: '#2a3544' },
  /** Overlay only behind greeting (top) and dock (bottom) — not the widget band. */
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '22%',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {
      backgroundImage: 'linear-gradient(180deg, rgba(12,18,28,0.28) 0%, rgba(12,18,28,0.08) 58%, rgba(12,18,28,0) 100%)',
    } : {
      backgroundColor: 'rgba(12,18,28,0.16)',
    }),
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '16%',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {
      backgroundImage: 'linear-gradient(0deg, rgba(12,18,28,0.26) 0%, rgba(12,18,28,0.08) 55%, rgba(12,18,28,0) 100%)',
    } : {
      backgroundColor: 'rgba(12,18,28,0.12)',
    }),
  },
});

export default React.memo(HomeBackdrop);
