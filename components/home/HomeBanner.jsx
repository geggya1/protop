import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getHomeBanner, CUSTOM_BANNER_ID } from '../../src/homeBanners';
import { soft } from '../parentHome/softTheme';
import HelpTarget from '../HelpTarget';

export default function HomeBanner({
  bannerId,
  customUri,
  greeting,
  title,
  subtitle,
  weather,
  onPressBanner,
  onEdit,
}) {
  const pack = bannerId === CUSTOM_BANNER_ID ? null : getHomeBanner(bannerId);
  const source = customUri
    ? { uri: customUri }
    : pack?.source;
  const contain = pack?.fit === 'contain' || pack?.cutout;

  return (
    <View style={styles.wrap} testID="home-banner">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPressBanner}
        accessibilityRole="button"
        accessibilityLabel="Toppbilde. Trykk for å bytte bilde."
      >
        {source ? (
          <Image
            source={source}
            style={[styles.img, contain && styles.imgContain]}
            resizeMode={contain ? 'contain' : 'cover'}
          />
        ) : (
          <View style={styles.fallback} />
        )}
        <View style={styles.fade} pointerEvents="none">
          {Platform.OS !== 'web' ? (
            <>
              <View style={[styles.fadeStrip, { left: 0, opacity: 0.92 }]} />
              <View style={[styles.fadeStrip, { left: '18%', opacity: 0.62 }]} />
              <View style={[styles.fadeStrip, { left: '36%', opacity: 0.28 }]} />
            </>
          ) : null}
        </View>
        <View style={styles.copy} pointerEvents="none">
          {greeting ? <Text style={styles.hi}>{greeting}</Text> : null}
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
        </View>
      </Pressable>
      {weather?.temp != null ? (
        <View style={styles.weatherChip} pointerEvents="none" testID="home-banner-weather">
          <Ionicons name={weather.icon || 'partly-sunny'} size={16} color="#E0A106" />
          <Text style={styles.weatherTxt}>{weather.temp}°</Text>
        </View>
      ) : null}
      <HelpTarget id="edit" style={styles.pencil}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onEdit || onPressBanner}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Bytt toppbilde"
          testID="home-banner-edit"
        >
          <View style={styles.pencilInner}>
            <Ionicons name="image-outline" size={16} color={soft.ink} />
          </View>
        </Pressable>
      </HelpTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: -14,
    marginTop: -4,
    height: 132,
    overflow: 'hidden',
    backgroundColor: soft.bg,
    position: 'relative',
    marginBottom: 4,
  },
  img: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' ? { objectPosition: 'right center' } : null),
  },
  imgContain: {
    width: '118%',
    left: '-4%',
  },
  fallback: { ...StyleSheet.absoluteFillObject, backgroundColor: soft.mint },
  fadeStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '28%',
    backgroundColor: soft.bg,
  },
  fade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {
      backgroundImage: 'linear-gradient(90deg, #F5F2EC 0%, rgba(245,242,236,0.9) 18%, rgba(245,242,236,0.28) 38%, transparent 58%)',
    } : null),
  },
  copy: {
    position: 'absolute',
    left: 18,
    right: 88,
    top: 28,
    zIndex: 2,
  },
  hi: {
    fontSize: 13, color: soft.muted, fontFamily: soft.body, marginBottom: 2,
  },
  title: {
    fontSize: 22, color: soft.ink, fontFamily: soft.display, lineHeight: 26,
    ...(Platform.OS === 'web' ? { textShadow: '0 1px 8px rgba(245,242,236,0.9)' } : null),
  },
  sub: {
    fontSize: 13, color: soft.muted, fontFamily: soft.body, marginTop: 3,
  },
  pencil: {
    position: 'absolute',
    right: 16,
    top: 56,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
    zIndex: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: soft.line,
    overflow: 'hidden',
  },
  pencilInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherChip: {
    position: 'absolute',
    right: 16,
    top: 12,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  weatherTxt: {
    fontSize: 15, color: soft.ink, fontFamily: soft.display,
  },
});
