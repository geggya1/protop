import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../src/i18n';
import { pickIntroText } from '../src/utils/moduleIntros';
import { processesForPage } from '../src/help/protopProcesses';

const NATIVE_DRIVER = Platform.OS !== 'web';
const WEB_MARK = Platform.OS === 'web' ? { dataSet: { helpCard: '1' } } : {};

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}

/**
 * Hjelpekortet bak lyspæren for en ProTop-side: hva siden er til, hvor den
 * ligger, stegene, arbeidsflyten den hører til og vanlige spørsmål.
 * Primærknappen starter den markerte rundturen.
 */
export default function HelpPageCard({
  copy,
  stepLocks = [],
  lockWho = '',
  onStartTour,
  onStartProcess,
  onAsk,
  onClose,
}) {
  const { t, lang } = useI18n();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(-18)).current;
  const [openFaq, setOpenFaq] = useState(-1);
  const wide = width >= 760;
  const accent = copy?.accent || '#1099F4';
  const flows = processesForPage(copy?.pageKey);

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(drop, {
        toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [fade, drop]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Enter') onStartTour?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onStartTour]);

  if (!copy) return null;

  const tour = copy.tour || [];
  const cardW = Math.min(wide ? 560 : 460, width - 24);
  const maxH = Math.max(320, height - (insets.top || 0) - (insets.bottom || 0) - 40);

  const body = (
    <Animated.View style={[styles.scrim, { opacity: fade }]} testID="help-page-card-scrim">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('moduleIntro.close')} />
      <Animated.View
        style={[styles.card, { width: cardW, maxHeight: maxH, transform: [{ translateY: drop }] }]}
        accessibilityRole="dialog"
        accessibilityViewIsModal
        testID="help-page-card"
        {...WEB_MARK}
      >
        <View style={[styles.hero, { backgroundColor: copy.soft || '#e0f2fe' }]}>
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: '#fff' }]}>
              <Ionicons name={copy.icon || 'help-circle'} size={24} color={accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kicker, { color: accent }]} numberOfLines={1}>{copy.kicker || copy.label}</Text>
              <Text style={styles.title}>{copy.title}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel={t('moduleIntro.close')}
              testID="help-page-card-close"
            >
              <Ionicons name="close" size={20} color="#334155" />
            </TouchableOpacity>
          </View>
          {copy.path ? (
            <View style={styles.pathRow}>
              <Ionicons name="navigate-outline" size={13} color="#475569" />
              <Text style={styles.pathTxt} numberOfLines={2}>
                <Text style={styles.pathLabel}>{t('helpCard.where')}: </Text>{copy.path}
              </Text>
            </View>
          ) : null}
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
          <Text style={styles.pitch}>{copy.pitch}</Text>

          {tour.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('helpCard.howTo')}</Text>
              {tour.map((s, i) => (
                <View key={`${i}-${s.title}`} style={styles.stepRow}>
                  <View style={[styles.stepNum, { backgroundColor: stepLocks[i] ? '#d97706' : accent }]}>
                    {stepLocks[i]
                      ? <Ionicons name="lock-closed" size={12} color="#fff" />
                      : <Text style={styles.stepNumTxt}>{i + 1}</Text>}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {s.title ? <Text style={styles.stepTitle}>{s.title}</Text> : null}
                    <Text style={styles.stepTxt}>{s.text}</Text>
                    {stepLocks[i] ? (
                      <Text style={styles.stepLock} testID="help-page-card-lock">{stepLocks[i]}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
              {lockWho ? (
                <View style={styles.lockWhoRow} testID="help-page-card-lock-who">
                  <Ionicons name="lock-closed" size={13} color="#b45309" />
                  <Text style={styles.lockWhoTxt}>{lockWho}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {flows.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('helpCard.partOfFlow')}</Text>
              {flows.map((f) => {
                const idx = f.steps.findIndex((s) => s.page === copy.pageKey);
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.flowCard, { borderColor: `${f.accent}55` }]}
                    onPress={() => onStartProcess?.(f.id, Math.max(0, idx))}
                    accessibilityRole="button"
                    testID="help-page-card-flow"
                  >
                    <View style={[styles.flowIcon, { backgroundColor: `${f.accent}1A` }]}>
                      <Ionicons name={f.icon || 'git-merge'} size={18} color={f.accent} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.flowTitle}>{pickIntroText(f.title, lang)}</Text>
                      <View style={styles.trail}>
                        {f.steps.map((s, i) => (
                          <View
                            key={`${f.id}-${i}`}
                            style={[
                              styles.trailDot,
                              { backgroundColor: i === idx ? f.accent : '#cbd5e1' },
                              i === idx && styles.trailDotNow,
                            ]}
                          />
                        ))}
                      </View>
                      <Text style={styles.flowSub}>
                        {t('moduleIntro.stepN')} {idx + 1} {t('moduleIntro.of')} {f.steps.length} · {t('helpCard.showFlow')}
                      </Text>
                    </View>
                    <Ionicons name="play-circle" size={24} color={f.accent} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {(copy.faq || []).length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('helpCard.faq')}</Text>
              {copy.faq.map((f, i) => (
                <TouchableOpacity
                  key={f.q}
                  style={styles.faqRow}
                  onPress={() => setOpenFaq((cur) => (cur === i ? -1 : i))}
                  accessibilityRole="button"
                >
                  <View style={styles.faqHead}>
                    <Text style={styles.faqQ}>{f.q}</Text>
                    <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={16} color="#64748b" />
                  </View>
                  {openFaq === i ? <Text style={styles.faqA}>{f.a}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, wide && styles.footerWide]}>
          <TouchableOpacity
            style={[styles.primary, { backgroundColor: accent }, wide && styles.btnWide]}
            onPress={onStartTour}
            accessibilityRole="button"
            testID="help-page-card-tour"
          >
            <Ionicons name="footsteps" size={17} color="#fff" />
            <Text style={styles.primaryTxt}>{t('helpCard.showMe')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondary, wide && styles.btnWide]}
            onPress={onAsk}
            accessibilityRole="button"
            testID="help-page-card-ask"
          >
            <Ionicons name="sparkles" size={16} color="#07274C" />
            <Text style={styles.secondaryTxt}>{t('helpCard.askAssistant')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );

  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && document.body) {
    return createPortal(
      <div style={portalStyle} data-help-card="1">{body}</div>,
      document.body,
    );
  }
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const portalStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2147482000,
};

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 16, 35, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.3,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  hero: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { marginTop: 3, fontSize: 20, lineHeight: 26, fontWeight: '600', color: '#0f172a' },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  pathRow: { marginTop: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  pathTxt: { flex: 1, fontSize: 12.5, lineHeight: 17, color: '#334155' },
  pathLabel: { fontWeight: '600' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollInner: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 },
  pitch: { fontSize: 15, lineHeight: 22, color: '#334155' },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: 10,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 11 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumTxt: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
  stepTitle: { fontSize: 14.5, fontWeight: '600', color: '#0f172a', lineHeight: 20 },
  stepTxt: { fontSize: 14, color: '#475569', lineHeight: 20, marginTop: 1 },
  lockWhoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
  },
  lockWhoTxt: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#92400e',
  },
  stepLock: {
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    overflow: 'hidden',
  },
  flowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  flowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowTitle: { fontSize: 14.5, fontWeight: '600', color: '#0f172a' },
  trail: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  trailDot: { width: 14, height: 4, borderRadius: 2 },
  trailDotNow: { width: 22, height: 6 },
  flowSub: { marginTop: 5, fontSize: 12, color: '#64748b' },
  faqRow: {
    borderTopWidth: 1,
    borderTopColor: '#eef2f6',
    paddingVertical: 10,
  },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '500', color: '#0f172a' },
  faqA: { marginTop: 6, fontSize: 13.5, lineHeight: 19, color: '#475569' },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#eef2f6',
  },
  footerWide: { flexDirection: 'row' },
  btnWide: { flex: 1 },
  primary: {
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondary: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
  },
  secondaryTxt: { color: '#07274C', fontSize: 14.5, fontWeight: '600' },
});
