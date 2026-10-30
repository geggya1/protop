import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { useI18n } from '../src/i18n';
import { colors, useLayout } from '../src/theme';
import { LIGHT } from '../src/appearance/palette';
import { illustrationSourceById } from '../src/modules/moduleActivationAssets';
import { heroTitleWithCompany, resolveModuleHero } from '../src/modules/moduleHero';
import { useOptionalApp } from '../src/context/AppContext';
import { companyDisplayName } from '../src/utils/companyName';
import Breadcrumb from './Breadcrumb';
import { normalizeTitle } from '../src/ui/pageTitle';

/** 2mm at the CSS reference pixel (96px = 1in). The picture scales to this inset. */
const ART_INSET = 8;

/**
 * Compact module heading: pastel band, overlay copy, transparent art.
 * Same visual thread on phone, tablet and desktop — phone is a few cm shorter.
 * `force` keeps SchoolPageLayout (and similar stack screens) able to draw the
 * heading even when the shared shell host is not wrapping the page.
 * `chrome` flattens the phone band into ShellHeader (no top radius) so it
 * joins the logo bar. The add button overlays the lower-right edge.
 * Help sits under the profile, above this band. Family name and the large
 * page title are hidden on phone. The phone band stays short so the page
 * body starts almost in the header.
 * Overskriften i båndet er sidens overskrift for skjermlesere (nivå 1); toppfeltet
 * på PC gjentar den ikke.
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
  const [artRatio, setArtRatio] = useState(2.4);
  useEffect(() => { setArtRatio(2.4); }, [moduleId, isPhone, useBundled]);
  const hero = useMemo(() => resolveModuleHero(moduleId, lang), [moduleId, lang]);
  const app = useOptionalApp();
  const imgSource = useMemo(
    () => (moduleId ? illustrationSourceById(moduleId, { preferBundled: useBundled, phone: isPhone }) : null),
    [moduleId, useBundled, isPhone],
  );

  if (!moduleId && !title) return null;
  void force;

  const heading = title || (hero.withCompanyName
    ? heroTitleWithCompany(hero.title, companyDisplayName(app?.family))
    : hero.title);
  const lead = subtitle || hero.pitch;
  // Overlinjen er modulnavnet; den står ikke over en overskrift med samme tekst (én tittel per side).
  const overline = normalizeTitle(kicker || hero.kicker) === normalizeTitle(heading) ? '' : (kicker || hero.kicker);
  const chromePhone = chrome && isPhone;
  const heroH = isDesktop ? 148 : isPhone ? 112 : 136;
  const artH = heroH - ART_INSET * 2;
  // Pastellbåndet er lyst også i mørkt utseende, så teksten på det er alltid den mørke
  // (LIGHT.ink/muted, minst 4,5:1 mot alle gruppefargene). colors.ink ble lys på lyst i mørkt.
  const titleColor = hero.ink || LIGHT.ink;
  const pitchColor = hero.muted || LIGHT.muted;
  const webBand = Platform.OS === 'web'
    ? { backgroundImage: `linear-gradient(105deg, ${hero.bg} 0%, ${hero.bg2} 55%, ${hero.bg} 100%)` }
    : null;
  const bandStyle = flush
    ? styles.heroFlush
    : (isDesktop ? styles.heroDesk : isPhone ? styles.heroPhone : styles.heroTablet);

  return (
    <View
      nativeID="module-hero"
      style={[
        styles.hero,
        { height: heroH, backgroundColor: hero.bg, borderColor: hero.ink ? 'rgba(255,255,255,0.14)' : `${hero.accent}22` },
        bandStyle,
        chromePhone && styles.heroChromePhone,
        webBand,
        Platform.OS === 'web' ? { overflow: 'clip' } : null,
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
        <Text nativeID="module-hero-title" accessibilityRole="header" aria-level={1} style={[styles.title, isDesktop && styles.titleDesk, isPhone && styles.titlePhone, { color: titleColor }]} numberOfLines={2}>
          {heading}
        </Text>
        {lead ? (
          <Text
            style={[styles.pitch, isDesktop && styles.pitchDesk, isPhone && styles.pitchPhone, { color: pitchColor }]}
            numberOfLines={isPhone ? 3 : (isDesktop ? 3 : 2)}
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
            { height: artH, maxHeight: artH, aspectRatio: artRatio },
            isPhone ? styles.artWrapPhone : isDesktop ? styles.artWrapDesk : styles.artWrapTablet,
            chromePhone && styles.artWrapPhoneChrome,
          ]}
        >
          <Image
            source={imgSource}
            style={[styles.artFit, isPhone && styles.artFitPhone]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            onLoad={(event) => {
              const src = event?.nativeEvent?.source;
              let w = src?.width;
              let h = src?.height;
              if (!w || !h) {
                const el = event?.nativeEvent?.target || event?.target;
                w = el?.naturalWidth;
                h = el?.naturalHeight;
              }
              if (w > 0 && h > 0) setArtRatio(w / h);
            }}
            onError={() => {
              if (Platform.OS === 'web' && !useBundled) setUseBundled(true);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Kompakt tittelrad på modulens undersider (i stedet for båndet): stripe i modulens
 * farge og brødsmulen fra menyen, der siste ledd er sidetittelen.
 * Sider utenfor bedriftsmenyen får modulnavnet som tittel.
 */
export function ModuleTitleRow({ moduleId, tab, subView = null }) {
  const { lang } = useI18n();
  const hero = useMemo(() => resolveModuleHero(moduleId, lang), [moduleId, lang]);
  return (
    <View
      nativeID="module-title-row"
      style={[styles.titleRow, { borderLeftColor: hero.accent }]}
    >
      <Breadcrumb
        tab={tab}
        subView={subView}
        compact={false}
        title
        nativeID="module-title-crumb"
      />
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

const styles = StyleSheet.create({
  titleRow: {
    borderLeftWidth: 4,
    borderRadius: 2,
    paddingLeft: 12,
    paddingVertical: 4,
    marginBottom: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
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
    paddingTop: 6,
    paddingBottom: 4,
  },
  /* Phone chrome shares the flush right edge. The add button overlays the picture. */
  artWrapPhoneChrome: {
    marginRight: 0,
  },
  heroDesk: {
    marginBottom: 12,
  },
  heroTablet: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 8,
  },
  heroPhone: {
    marginHorizontal: 12,
    marginTop: 0,
    marginBottom: 4,
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
    paddingVertical: 6,
    paddingLeft: 14,
    paddingRight: 8,
    flexShrink: 0,
    minWidth: 168,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontWeight: '400',
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.35,
    lineHeight: 26,
  },
  titleDesk: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '400',
  },
  titlePhone: {
    fontSize: 18,
    lineHeight: 22,
  },
  pitch: {
    marginTop: 4,
    fontWeight: '400',
    fontSize: 13,
    color: colors.muted,
    lineHeight: 17,
    maxWidth: 440,
  },
  pitchDesk: {
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 480,
  },
  pitchPhone: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
  },
  /* Height is the heading minus 2mm top and bottom. Width follows the picture. */
  artWrap: {
    alignSelf: 'center',
    marginRight: ART_INSET,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  artWrapDesk: {
    maxWidth: '50%',
  },
  artWrapTablet: {
    maxWidth: '50%',
  },
  /* Phone heading stays short. The picture sits on the right margin of every page. */
  artWrapPhone: {
    maxWidth: '54%',
    marginRight: 0,
    alignItems: 'flex-end',
  },
  artFit: {
    width: '100%',
    height: '100%',
    maxHeight: '100%',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {
      objectFit: 'contain',
      objectPosition: 'center center',
    } : null),
  },
  artFitPhone: {
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' ? { objectPosition: 'right center' } : null),
  },
});
