import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PAGE_ART_SCALE } from '../../src/appearance/pageArtScale';
import { getHomeBanner, hasHomePhoto, CUSTOM_BANNER_ID } from '../../src/homeBanners';
import { colors } from '../../src/theme';
import { radius, type } from '../../src/ui/tokens';
import { formatGreetingDate } from '../../src/utils/timeGreeting';
import HelpTarget from '../HelpTarget';

/**
 * Hjem uten bakgrunnsbilde (UX-05): samme topp som Hjem på PC, med hilsen, dato og vær
 * på sidens bakgrunn. Knappen åpner Tilpass hjem, der bakgrunnsbilde kan velges.
 */
function PlainHomeHeader({ greeting, weather, onEdit }) {
  const dateLabel = formatGreetingDate(new Date());
  const weatherBit = weather?.temp != null
    ? `${weather.temp}°${weather.place ? ` ${weather.place}` : ''}`
    : '';
  return (
    <View style={styles.plain} testID="home-banner-plain">
      <View style={styles.plainCopy}>
        {greeting ? (
          <Text style={styles.plainHi} accessibilityRole="header" numberOfLines={2}>{greeting}</Text>
        ) : null}
        <View style={styles.plainSubRow}>
          <Text style={styles.plainDate} numberOfLines={1}>{dateLabel}</Text>
          {weatherBit ? (
            <View style={styles.plainWeather} testID="home-banner-weather">
              <Ionicons name={weather.icon || 'partly-sunny'} size={14} color={colors.brand} />
              <Text style={styles.plainWeatherTxt} numberOfLines={1}>{weatherBit}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <HelpTarget id="edit" style={styles.plainEdit}>
        <Pressable
          style={styles.plainEditBtn}
          onPress={onEdit}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Tilpass hjem og velg bakgrunnsbilde"
          testID="home-banner-edit"
        >
          <Ionicons name="image-outline" size={18} color={colors.brandInk} />
        </Pressable>
      </HelpTarget>
    </View>
  );
}

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
  if (!customUri && !hasHomePhoto(bannerId)) {
    return <PlainHomeHeader greeting={greeting} weather={weather} onEdit={onEdit || onPressBanner} />;
  }
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
          <Ionicons name={weather.icon || 'partly-sunny'} size={16} color={colors.star} />
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
            <Ionicons name="image-outline" size={16} color={colors.ink} />
          </View>
        </Pressable>
      </HelpTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  plain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  plainCopy: { flex: 1, minWidth: 0 },
  plainHi: { ...type.h1, color: colors.ink },
  plainSubRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  plainDate: { fontSize: 13, color: colors.muted },
  plainWeather: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3,
  },
  plainWeatherTxt: { fontSize: 12, color: colors.ink },
  plainEdit: { width: 40, height: 40 },
  plainEditBtn: {
    width: 40, height: 40, borderRadius: radius.control,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  wrap: {
    marginHorizontal: -14,
    marginTop: -4,
    height: 132,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    position: 'relative',
    marginBottom: 4,
  },
  img: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    transform: [{ scale: PAGE_ART_SCALE }],
    ...(Platform.OS === 'web' ? { objectPosition: 'right center' } : null),
  },
  imgContain: {
    width: '118%',
    left: '-4%',
  },
  fallback: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.brandSoft },
  fadeStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '28%',
    backgroundColor: colors.bg,
  },
  fade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {
      // Toner bildet ut mot sidens bakgrunn (colors.bg), i lyst og mørkt.
      backgroundImage: 'linear-gradient(90deg, var(--wp-c-bg) 0%, color-mix(in srgb, var(--wp-c-bg) 90%, transparent) 18%, color-mix(in srgb, var(--wp-c-bg) 28%, transparent) 38%, transparent 58%)',
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
    fontSize: 13, color: colors.muted, marginBottom: 2,
  },
  title: {
    fontSize: 22, color: colors.ink, fontWeight: '600', lineHeight: 26,
  },
  sub: {
    fontSize: 13, color: colors.muted, marginTop: 3,
  },
  pencil: {
    position: 'absolute',
    right: 16,
    top: 56,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    zIndex: 3,
    borderWidth: 1,
    borderColor: colors.line,
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
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  weatherTxt: {
    fontSize: 15, color: colors.ink, fontWeight: '600',
  },
});
