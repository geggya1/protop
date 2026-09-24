import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Image, ScrollView,
  Animated, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../../src/i18n';
import { colors, radius, space } from '../../src/theme';
import LanguageMenu from '../../components/LanguageMenu';
import WelcomeTeasers from '../../components/WelcomeTeasers';
import BrandLogo from '../../components/BrandLogo';

const HERO = require('../../assets/hero-family.png');

const BENEFITS = [
  { icon: 'calendar-outline', title: 'welcome.f1t', body: 'welcome.f1d' },
  { icon: 'star-outline', title: 'welcome.f2t', body: 'welcome.f2d' },
  { icon: 'chatbubbles-outline', title: 'welcome.f3t', body: 'welcome.f3d' },
  { icon: 'shield-checkmark-outline', title: 'welcome.f4t', body: 'welcome.f4d' },
];

const STEPS = [
  { n: '1', title: 'welcome.how1t', body: 'welcome.how1d' },
  { n: '2', title: 'welcome.how2t', body: 'welcome.how2d' },
  { n: '3', title: 'welcome.how3t', body: 'welcome.how3d' },
];

const displayFont = Platform.OS === 'web' ? 'Fraunces, Georgia, serif' : undefined;
const bodyFont = Platform.OS === 'web' ? 'Nunito, sans-serif' : undefined;

export default function WelcomeScreen({ onTryFree, onLogin }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const heroH = Math.min(420, Math.max(280, winH * 0.42));

  const fadeHero = useRef(new Animated.Value(0)).current;
  const fadeCopy = useRef(new Animated.Value(0)).current;
  const riseCopy = useRef(new Animated.Value(16)).current;
  const fadeRest = useRef(new Animated.Value(0)).current;

  // Web must never show this legacy marketing clone — homepage lives at /.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      window.location.replace('/');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    Animated.sequence([
      Animated.timing(fadeHero, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeCopy, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(riseCopy, { toValue: 0, duration: 520, useNativeDriver: true }),
      ]),
      Animated.timing(fadeRest, { toValue: 1, duration: 480, useNativeDriver: true }),
    ]).start();
  }, [fadeHero, fadeCopy, riseCopy, fadeRest]);

  if (Platform.OS === 'web') {
    return <View style={styles.page} />;
  }

  return (
    <View style={styles.page}>
      <View style={[styles.langBar, { paddingTop: Math.max(8, insets.top) }]} pointerEvents="box-none">
        <LanguageMenu compact={Platform.OS !== 'web'} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        {/* First viewport: one composition — brand, headline, lead, CTA, full-bleed hero */}
        <View style={styles.heroComposition}>
          <Animated.View style={[styles.heroBleed, { height: heroH, opacity: fadeHero }]}>
            <View style={styles.heroAtmosphere} />
            <Image
              source={HERO}
              style={styles.heroImg}
              resizeMode="cover"
              accessibilityLabel="ProTop"
            />
            <View style={styles.heroFade} />
          </Animated.View>

          <Animated.View
            style={[
              styles.heroCopy,
              { opacity: fadeCopy, transform: [{ translateY: riseCopy }] },
            ]}
          >
            <BrandLogo variant="full" height={64} maxWidth={360} style={styles.brandLogo} />
            <Text style={styles.headline}>{t('welcome.title')}</Text>
            <Text style={styles.lead}>{t('welcome.heroLead')}</Text>

            <TouchableOpacity
              style={styles.cta}
              onPress={onTryFree}
              accessibilityRole="button"
              accessibilityLabel={t('welcome.cta')}
              activeOpacity={0.88}
            >
              <Text style={styles.ctaTxt}>{t('welcome.cta')}</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onLogin}
              style={styles.loginLink}
              accessibilityRole="button"
            >
              <Text style={styles.loginTxt}>{t('welcome.login')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: fadeRest }}>
          {/* One job: why ProTop */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('welcome.whyTitle')}</Text>
            <Text style={styles.sectionLead}>{t('welcome.whyLead')}</Text>
            <View style={styles.benefitList}>
              {BENEFITS.map((b) => (
                <View key={b.title} style={styles.benefitRow}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name={b.icon} size={22} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.benefitTitle}>{t(b.title)}</Text>
                    <Text style={styles.benefitBody}>{t(b.body)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* One job: product teasers / app look */}
          <View style={styles.showSection}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('welcome.showTitle')}</Text>
              <Text style={styles.sectionLead}>{t('welcome.showLead')}</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.teaserScroll}
              decelerationRate="fast"
              snapToInterval={216}
            >
              <WelcomeTeasers t={t} />
            </ScrollView>
          </View>

          {/* One job: how it works */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('welcome.howTitle')}</Text>
            <View style={styles.steps}>
              {STEPS.map((s) => (
                <View key={s.n} style={styles.step}>
                  <Text style={styles.stepNum}>{s.n}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{t(s.title)}</Text>
                    <Text style={styles.stepBody}>{t(s.body)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* One job: trial / trust */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('welcome.trialTitle')}</Text>
            <Text style={styles.trialPrice}>{t('welcome.price')}</Text>
            <Text style={styles.sectionLead}>{t('welcome.trialBody')}</Text>
            <Text style={styles.stores}>{t('welcome.stores')}</Text>
          </View>

          <View style={styles.finalCtaBlock}>
            <TouchableOpacity
              style={styles.cta}
              onPress={onTryFree}
              accessibilityRole="button"
              activeOpacity={0.88}
            >
              <Text style={styles.ctaTxt}>{t('welcome.cta')}</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.trustLine}>{t('welcome.trust')}</Text>
          </View>
        </Animated.View>

        <SafeAreaView edges={['bottom']}>
          <View style={{ height: 28 }} />
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#e8eef6' },
  langBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
    paddingRight: space.md,
    paddingLeft: space.md,
  },
  scroll: { flex: 1 },
  scrollBody: { paddingBottom: 24 },

  heroComposition: {
    backgroundColor: '#e8eef6',
  },
  heroBleed: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#d7e6f8',
  },
  heroAtmosphere: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#c5daf3',
  },
  heroImg: {
    width: '100%',
    height: '100%',
  },
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    backgroundColor: 'transparent',
    // soft blend into page without text overlay
    borderBottomWidth: 0,
    ...(Platform.OS === 'web'
      ? { backgroundImage: 'linear-gradient(to bottom, rgba(232,238,246,0), #e8eef6)' }
      : { backgroundColor: 'rgba(232,238,246,0.35)' }),
  },
  heroCopy: {
    paddingHorizontal: space.lg,
    paddingTop: 8,
    paddingBottom: space.lg,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  brandLogo: {
    marginBottom: 12,
  },
  headline: {
    fontFamily: displayFont,
    fontSize: 30,
    fontWeight: '700',
    color: colors.ink,
    lineHeight: 36,
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  lead: {
    fontFamily: bodyFont,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 22,
    maxWidth: 420,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 16,
    paddingHorizontal: 20,
    minHeight: 54,
  },
  ctaTxt: {
    fontFamily: bodyFont,
    color: '#fff',
    fontWeight: '800',
    fontSize: 17,
  },
  loginLink: {
    alignItems: 'center',
    paddingVertical: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  loginTxt: {
    fontFamily: bodyFont,
    fontWeight: '700',
    color: colors.brand,
    fontSize: 15,
  },

  section: {
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.md,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  sectionTitle: {
    fontFamily: displayFont,
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  sectionLead: {
    fontFamily: bodyFont,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 18,
  },

  benefitList: { gap: 16 },
  benefitRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: {
    fontFamily: bodyFont,
    fontWeight: '800',
    fontSize: 16,
    color: colors.ink,
    marginBottom: 2,
  },
  benefitBody: {
    fontFamily: bodyFont,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
  },

  showSection: {
    paddingTop: space.md,
    paddingBottom: space.md,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  teaserScroll: {
    paddingHorizontal: space.lg,
    paddingBottom: 8,
  },

  steps: { gap: 18, marginTop: 4 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  stepNum: {
    fontFamily: displayFont,
    fontSize: 28,
    fontWeight: '700',
    color: colors.brand,
    width: 36,
    lineHeight: 34,
  },
  stepTitle: {
    fontFamily: bodyFont,
    fontWeight: '800',
    fontSize: 16,
    color: colors.ink,
    marginBottom: 2,
  },
  stepBody: {
    fontFamily: bodyFont,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
  },

  trialPrice: {
    fontFamily: bodyFont,
    fontWeight: '800',
    fontSize: 22,
    color: colors.ink,
    marginBottom: 8,
  },
  stores: {
    fontFamily: bodyFont,
    fontWeight: '700',
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },

  finalCtaBlock: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    gap: 10,
  },
  trustLine: {
    fontFamily: bodyFont,
    textAlign: 'center',
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
});
