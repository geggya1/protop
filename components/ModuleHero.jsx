import React, { useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { useI18n } from '../src/i18n';
import { colors, useLayout } from '../src/theme';
import { illustrationSourceById } from '../src/modules/moduleActivationAssets';
import { resolveModuleHero } from '../src/modules/moduleHero';

/**
 * Compact module heading: pastel band, overlay copy, transparent art.
 * Same visual thread on phone, tablet and desktop — phone is a few cm shorter.
 * `force` keeps SchoolPageLayout (and similar stack screens) able to draw the
 * heading even when the shared shell host is not wrapping the page.
 * `chrome` flattens the phone band into ShellHeader (no top radius) so it
 * joins the logo bar. Add/help overlay the lower-right edge; family name
 * and the large page title are hidden on phone.
 */
export default function ModuleHero({
  moduleId,
  title,
  subtitle,
  kicker,
  extra = null,
  force = false,
  flush = false,
  chrome = false,
}) {
  const { lang } = useI18n();
  const { isPhone, isDesktop } = useLayout();
  const [useBundled, setUseBundled] = useState(Platform.OS !== 'web');
  const hero = useMemo(() => resolveModuleHero(moduleId, lang), [moduleId, lang]);
  const imgSource = useMemo(
    () => (moduleId ? illustrationSourceById(moduleId, { preferBundled: useBundled }) : null),
    [moduleId, useBundled],
  );

  if (!moduleId && !title) return null;
  void force;

  const heading = title || hero.title;
  const lead = subtitle || hero.pitch;
  const overline = kicker || hero.kicker;
  const chromePhone = chrome && isPhone;
  const heroH = isDesktop ? 176 : isPhone ? 144 : 156;
  const squareArt = moduleId === 'familyTree';
  const webBand = Platform.OS === 'web'
    ? { backgroundImage: `linear-gradient(105deg, ${hero.bg} 0%, ${hero.bg2} 55%, ${hero.bg} 100%)` }
    : null;
  const bandStyle = flush
    ? styles.heroFlush
    : (isDesktop ? styles.heroDesk : isPhone ? styles.heroPhone : styles.heroTablet);

  return (
    <View
      nativeID="module-hero"
      accessibilityRole="header"
      style={[
        styles.hero,
        { height: heroH, backgroundColor: hero.bg, borderColor: `${hero.accent}22` },
        bandStyle,
        chromePhone && styles.heroChromePhone,
        webBand,
      ]}
    >
      <View pointerEvents="none" style={[styles.glow, { backgroundColor: hero.bg2 }]} />
      <View style={[
        styles.copy,
        isDesktop && styles.copyDesk,
        isPhone && styles.copyPhone,
        chromePhone && styles.copyPhoneChrome,
      ]}>
        {overline ? (
          <Text style={[styles.kicker, { color: hero.accent }]} numberOfLines={1}>
            {overline}
          </Text>
        ) : null}
        <Text style={[styles.title, isDesktop && styles.titleDesk, isPhone && styles.titlePhone]} numberOfLines={2}>
          {heading}
        </Text>
        {lead ? (
          <Text
            style={[styles.pitch, isDesktop && styles.pitchDesk, isPhone && styles.pitchPhone]}
            numberOfLines={isDesktop ? 3 : 2}
          >
            {lead}
          </Text>
        ) : null}
        {extra}
      </View>
      {imgSource ? (
        <View
          pointerEvents="none"
          style={[
            styles.artWrap,
            isDesktop ? styles.artWrapDesk : isPhone ? styles.artWrapPhone : styles.artWrapTablet,
            squareArt && styles.artWrapSquare,
            chromePhone && styles.artWrapPhoneChrome,
          ]}
        >
          <Image
            source={imgSource}
            style={styles.art}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            onError={() => {
              if (Platform.OS === 'web' && !useBundled) setUseBundled(true);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)' }
  : {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  };

const webContain = Platform.OS === 'web'
  ? { objectFit: 'contain', objectPosition: 'right center', maxWidth: '100%', maxHeight: '100%' }
  : null;

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
    ...webShadow,
  },
  heroFlush: {
    marginBottom: 0,
  },
  heroChromePhone: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopWidth: 0,
    ...(Platform.OS === 'web' ? { boxShadow: 'none' } : { shadowOpacity: 0 }),
  },
  copyPhoneChrome: {
    paddingTop: 12,
    paddingBottom: 10,
  },
  artWrapPhoneChrome: {
    paddingTop: 6,
    paddingBottom: 10,
    paddingRight: 12,
  },
  heroDesk: {
    marginBottom: 12,
  },
  heroTablet: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  heroPhone: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  glow: {
    position: 'absolute',
    right: -40,
    top: -48,
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.55,
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
    zIndex: 1,
    minWidth: 0,
  },
  copyDesk: {
    paddingVertical: 14,
    paddingLeft: 22,
    paddingRight: 12,
  },
  copyPhone: {
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 4,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontWeight: '600',
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.35,
    lineHeight: 26,
  },
  titleDesk: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '600',
  },
  titlePhone: {
    fontSize: 18,
    lineHeight: 22,
  },
  pitch: {
    marginTop: 6,
    fontWeight: '400',
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    maxWidth: 440,
  },
  pitchDesk: {
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 520,
  },
  pitchPhone: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    maxWidth: 220,
  },
  artWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 10,
    paddingRight: 18,
    paddingLeft: 8,
  },
  artWrapDesk: {
    width: 360,
    flexShrink: 0,
  },
  artWrapTablet: {
    width: 290,
    flexShrink: 0,
  },
  artWrapPhone: {
    width: 156,
    flexShrink: 0,
    paddingTop: 8,
    paddingBottom: 10,
    paddingRight: 12,
    paddingLeft: 4,
  },
  /* Square tree art is height-limited in the 176px band. Keep enough inset
     so the 20px heading radius does not clip foliage, portraits or the scroll.
     minWidth:0 so intrinsic PNG-bredde (855px) ikke utvider hele appen. */
  artWrapSquare: {
    paddingTop: 6,
    paddingBottom: 10,
    paddingRight: 16,
    paddingLeft: 6,
    minWidth: 0,
    overflow: 'hidden',
    flexShrink: 1,
  },
  art: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    ...webContain,
  },
});
