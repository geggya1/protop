import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, Mask, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../src/i18n';
import { useHelp } from '../src/context/HelpContext';
import { useApp } from '../src/context/AppContext';
import { useLayout } from '../src/theme';
import { useParentDashboardTheme } from '../src/hooks/useParentDashboardTheme';
import {
  attachPoint, arrowHead, arrowPath, buildTourSteps, placeCard,
  resolveHole, shortPitch, visibleTourPages,
} from '../src/utils/helpLayout';
import { getWelcomeTourModules, localizeIntro, pickIntroText } from '../src/utils/moduleIntros';
import { soft } from './parentHome/softTheme';
import { subscribeAppRoute } from '../src/navigation/navRef';

const MASK_ID = 'wp-help-spot';
const NATIVE_DRIVER = Platform.OS !== 'web';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}

function buildModulePages(tour, scene) {
  return visibleTourPages(tour || [], scene);
}

function buildWelcomePages(scope, asChild) {
  const tour = getWelcomeTourModules(scope, { asChild });
  const pages = [{ kind: 'intro' }];
  if (tour.highlights.length) pages.push({ kind: 'highlights', modules: tour.highlights });
  if (tour.apps.length) pages.push({ kind: 'apps', modules: tour.apps });
  pages.push({ kind: 'helpBtn', anchor: 'helpBtn' });
  return pages;
}

export default function HelpOverlay() {
  const { t, lang } = useI18n();
  const help = useHelp();
  const { isChild, isActingAsChild } = useApp();
  const asChild = !!(isChild || isActingAsChild);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const layout = useLayout();
  const { theme: parentTheme } = useParentDashboardTheme();
  const {
    mode, copy, scope, dismiss, openWelcome, requestRemeasure, targets,
    scene, setTourIndex, tourIndex, runTargetAdvance, runRetreat,
  } = help;

  const layoutHints = useMemo(() => ({
    width,
    height,
    isPhone: layout.isPhone,
    isTablet: layout.isTablet,
    isDesktop: layout.isDesktop,
    hasRail: layout.hasRail,
    railWidth: layout.railWidth,
    pad: layout.pad,
    insets,
    hasBottomNav: !!(scope === 'family' && parentTheme?.bottomNav !== false),
    asChild,
  }), [
    width, height, layout.isPhone, layout.isTablet, layout.isDesktop,
    layout.hasRail, layout.railWidth, layout.pad, insets, scope, asChild, parentTheme?.bottomNav,
  ]);

  const adaptedTour = useMemo(() => {
    if (mode !== 'module' || !copy?.rawSteps) return copy?.tour || [];
    return buildTourSteps(copy.rawSteps, lang, pickIntroText, layoutHints);
  }, [mode, copy?.rawSteps, copy?.tour, lang, layoutHints]);

  const pages = useMemo(() => {
    if (mode === 'welcome') return buildWelcomePages(scope, asChild);
    if (mode === 'module') return buildModulePages(adaptedTour, scene);
    return [];
  }, [mode, scope, adaptedTour, asChild, scene]);

  const tourTotal = adaptedTour.length || copy?.steps?.length || pages.length;
  const softFamilyChrome = scope === 'family' && !asChild && !layout.isDesktop;

  const [page, setPage] = useState(0);
  const [routeName, setRouteName] = useState('');
  useEffect(() => subscribeAppRoute(setRouteName), []);
  const helpHeld = routeName === 'ProfileSetup';
  const [cardSize, setCardSize] = useState({ w: 380, h: 340 });
  const opacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(28)).current;
  const pagerRef = useRef(null);
  const visible = !helpHeld && (mode === 'welcome' || mode === 'module') && pages.length > 0;

  useEffect(() => {
    if (!helpHeld || !mode) return;
    dismiss({ skipPersist: true });
  }, [helpHeld, mode, dismiss]);

  useEffect(() => {
    if (mode !== 'module') {
      setPage(0);
      pagerRef.current?.scrollTo?.({ x: 0, animated: false });
      return;
    }
    const idx = pages.findIndex((p) => p.index === tourIndex);
    const next = idx >= 0 ? idx : 0;
    setPage(next);
    const step = pages[next];
    if (step?.index != null && step.index !== tourIndex) setTourIndex(step.index);
    pagerRef.current?.scrollTo?.({ x: next * pageW, animated: false });
  }, [mode, scope, copy?.title, scene]);

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      slide.setValue(28);
      return undefined;
    }
    requestRemeasure();
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(slide, { toValue: 0, duration: 320, useNativeDriver: NATIVE_DRIVER }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [visible, opacity, slide, requestRemeasure]);

  useEffect(() => {
    if (!visible) return undefined;
    requestRemeasure();
    const tick = setInterval(() => requestRemeasure(), 450);
    return () => clearInterval(tick);
  }, [visible, width, height, scene, page, requestRemeasure]);

  const current = pages[page] || pages[0];
  const isLastGlobal = (current?.index ?? 0) >= Math.max(0, tourTotal - 1);

  const hole = useMemo(() => {
    if (!visible) return null;
    const anchor = current?.anchor;
    if (!anchor) return null;
    const alt = anchor === 'shortcuts' || anchor === 'timeline'
      ? (targets.content || targets.rail || null)
      : anchor === 'edit'
        ? (targets.header || null)
        : null;
    return resolveHole(anchor, targets[anchor], layoutHints, alt);
  }, [visible, current?.anchor, targets, layoutHints]);

  const cardRect = useMemo(() => placeCard({
    winW: width,
    winH: height,
    hole,
    cardW: Math.min(400, width - 24),
    cardH: cardSize.h,
    isPhone: layout.isPhone,
    inset: insets,
  }), [width, height, hole, cardSize.h, layout.isPhone, insets]);

  const pageW = Math.max(280, cardRect.w - 40);

  const goTo = useCallback((next) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, next));
    setPage(clamped);
    const step = pages[clamped];
    if (mode === 'module' && step?.index != null) setTourIndex(step.index);
    pagerRef.current?.scrollTo?.({ x: clamped * pageW, animated: true });
  }, [pages, pageW, mode, setTourIndex]);

  const remeasureSoon = useCallback(() => {
    requestRemeasure();
    setTimeout(requestRemeasure, 80);
    setTimeout(requestRemeasure, 280);
  }, [requestRemeasure]);

  const tryAdvance = useCallback((anchor) => {
    const did = runTargetAdvance(anchor)
      || runTargetAdvance('content')
      || runTargetAdvance('add')
      || runTargetAdvance('input');
    if (did) remeasureSoon();
    return did;
  }, [runTargetAdvance, remeasureSoon]);

  const close = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: NATIVE_DRIVER }).start(() => {
      dismiss();
    });
  }, [dismiss, opacity]);

  const finish = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: NATIVE_DRIVER }).start(() => {
      dismiss();
    });
  }, [dismiss, opacity]);

  const goNext = useCallback(() => {
    if (mode === 'module' && current?.advance) {
      tryAdvance(current.anchor);
      const nextIdx = (current?.index ?? 0) + 1;
      const next = adaptedTour[nextIdx];
      // Same-scene advance (e.g. Matcoach «+ Ny ukeplan» then explain the plan)
      if (next && (next.scene || 'hub') === scene) {
        setTourIndex(nextIdx);
        remeasureSoon();
      }
      return;
    }
    if (page < pages.length - 1) {
      goTo(page + 1);
      return;
    }
    if (mode === 'module' && !isLastGlobal && scene === 'inner') {
      setTourIndex((current?.index ?? 0) + 1);
      runRetreat();
      remeasureSoon();
      return;
    }
    finish();
  }, [
    mode, current, page, pages.length, tryAdvance, goTo, adaptedTour, scene,
    isLastGlobal, setTourIndex, runRetreat, remeasureSoon, finish,
  ]);

  const goBack = useCallback(() => {
    if (page > 0) {
      goTo(page - 1);
      return;
    }
    if (mode === 'module' && scene === 'inner') {
      setTourIndex(Math.max(0, (current?.index || 1) - 1));
      runRetreat();
      remeasureSoon();
    }
  }, [page, goTo, mode, scene, current, setTourIndex, runRetreat, remeasureSoon]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' || e.key === 'Enter') goNext();
      if (e.key === 'ArrowLeft') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, close, goNext, goBack]);

  const onScrollEnd = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / Math.max(1, pageW));
    const clamped = Math.max(0, Math.min(pages.length - 1, next));
    if (clamped !== page) {
      setPage(clamped);
      const step = pages[clamped];
      if (mode === 'module' && step?.index != null) setTourIndex(step.index);
    }
  };

  const last = page >= pages.length - 1
    && !(mode === 'module' && current?.advance)
    && (mode !== 'module' || isLastGlobal);
  const ctaLabel = last
    ? (mode === 'welcome' ? t('moduleIntro.explore') : t('moduleIntro.done'))
    : t('moduleIntro.next');
  const accent = copy?.accent || '#2563eb';
  const arrowStart = hole ? attachPoint(cardRect, hole) : null;
  const arrowEnd = hole ? attachPoint(hole, cardRect) : null;

  useEffect(() => {
    if (!visible) return undefined;
    requestRemeasure?.();
    return undefined;
  }, [requestRemeasure, visible, page, width, height]);

  // Unmount when idle — a hidden RN Modal on Safari/Chrome can eat all taps
  // (Dokumenter / album). Same pattern as ConfirmDialog / AlbumSheet.
  if (!visible) return null;

  const overlayBody = (
      <Animated.View style={[styles.root, { opacity }]} pointerEvents="box-none">
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id={MASK_ID} x="0" y="0" width={width} height={height}>
              <Rect x="0" y="0" width={width} height={height} fill="#fff" />
              {hole ? (
                <Rect
                  x={hole.x}
                  y={hole.y}
                  width={hole.w}
                  height={hole.h}
                  rx={14}
                  ry={14}
                  fill="#000"
                />
              ) : null}
            </Mask>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={width}
            height={height}
            fill="rgba(12, 16, 28, 0.62)"
            mask={`url(#${MASK_ID})`}
          />
          {hole ? (
            <Rect
              x={hole.x}
              y={hole.y}
              width={hole.w}
              height={hole.h}
              rx={14}
              ry={14}
              fill="none"
              stroke={accent}
              strokeWidth={2}
              opacity={0.9}
            />
          ) : null}
          {hole && arrowStart && arrowEnd ? (
            <>
              <Path
                d={arrowPath(arrowStart, arrowEnd)}
                stroke="#fff"
                strokeWidth={2.25}
                fill="none"
                strokeLinecap="round"
              />
              <Path d={arrowHead(arrowStart, arrowEnd)} fill="#fff" />
            </>
          ) : null}
        </Svg>

        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t('moduleIntro.close')} />
        {hole ? (
          <Pressable
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel={t('moduleIntro.next')}
            style={{
              position: 'absolute',
              left: hole.x,
              top: hole.y,
              width: hole.w,
              height: hole.h,
            }}
          />
        ) : null}

        <Animated.View
          style={[
            styles.card,
            softFamilyChrome && styles.cardSoft,
            {
              width: cardRect.w,
              left: cardRect.x,
              top: cardRect.y,
              maxHeight: cardRect.h,
              transform: [{ translateX: slide }],
              borderColor: softFamilyChrome ? soft.line : 'transparent',
              borderWidth: softFamilyChrome ? 1 : 0,
            },
          ]}
          onStartShouldSetResponder={() => true}
          onLayout={(e) => {
            const { width: w, height: h } = e.nativeEvent.layout;
            if (Math.abs(h - cardSize.h) > 2 || Math.abs(w - cardSize.w) > 2) {
              setCardSize({ w, h });
            }
          }}
          accessibilityViewIsModal
          accessibilityRole="summary"
        >
          <View style={styles.cardInner}>
            <TouchableOpacity
              onPress={close}
              style={styles.close}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('moduleIntro.close')}
            >
              <Ionicons name="close" size={18} color="#64748b" />
            </TouchableOpacity>

            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onScrollEnd}
              onScrollEndDrag={onScrollEnd}
              style={{ width: pageW }}
              contentContainerStyle={Platform.OS === 'web' ? styles.snapRow : null}
              keyboardShouldPersistTaps="handled"
            >
              {pages.map((item, i) => (
                <View
                  key={`${item.kind}-${i}`}
                  style={[
                    styles.page,
                    { width: pageW, maxHeight: Math.max(140, cardRect.h - 148) },
                    Platform.OS === 'web' && styles.snapPage,
                  ]}
                >
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {mode === 'welcome' ? (
                      <WelcomePage page={item} lang={lang} t={t} />
                    ) : (
                      <ModulePage
                        page={item}
                        copy={copy}
                        t={t}
                        stepTotal={tourTotal}
                        highlighted={!!hole && i === page}
                      />
                    )}
                  </ScrollView>
                </View>
              ))}
            </ScrollView>

            <View style={styles.dots}>
              {pages.map((_, i) => (
                <Pressable key={i} onPress={() => goTo(i)} hitSlop={6}>
                  <View style={[
                    styles.dot,
                    i === page && { backgroundColor: accent, width: 18 },
                  ]}
                  />
                </Pressable>
              ))}
            </View>

            <View style={styles.actions}>
              {(page > 0 || (mode === 'module' && scene === 'inner')) ? (
                <TouchableOpacity
                  onPress={goBack}
                  style={styles.backBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('moduleIntro.back')}
                >
                  <Ionicons name="chevron-back" size={18} color="#334155" />
                </TouchableOpacity>
              ) : (
                <View style={styles.backBtn} />
              )}
              <TouchableOpacity
                onPress={goNext}
                style={[styles.cta, { backgroundColor: accent }]}
                accessibilityRole="button"
                accessibilityLabel={ctaLabel}
              >
                <Text style={styles.ctaTxt}>{ctaLabel}</Text>
                <Ionicons name={last ? 'checkmark' : 'arrow-forward'} size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            {mode === 'welcome' ? (
              <TouchableOpacity onPress={close} accessibilityRole="button">
                <Text style={styles.skip}>{t('moduleIntro.skipTour')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.moduleExtras}>
                {mode === 'module' ? (
                  <TouchableOpacity onPress={openWelcome} accessibilityRole="button">
                    <Text style={styles.skipQuiet}>{t('moduleIntro.reopenTour')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        </Animated.View>
      </Animated.View>
  );

  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && document.body) {
    return createPortal(
      <div style={webHelpPortalStyle} data-wp-help-overlay="1">
        {overlayBody}
      </div>,
      document.body,
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={close}
      onShow={requestRemeasure}
    >
      {overlayBody}
    </Modal>
  );
}

const webHelpPortalStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2147483000,
};

function WelcomePage({ page, lang, t }) {
  if (page.kind === 'intro') {
    return (
      <View>
        <View style={[styles.iconBadge, { backgroundColor: '#eff6ff' }]}>
          <Ionicons name="sparkles" size={22} color="#2563eb" />
        </View>
        <Text style={styles.kicker}>{t('moduleIntro.help')}</Text>
        <Text style={styles.title}>{t('moduleIntro.welcomeTitle')}</Text>
        <Text style={styles.body}>{t('moduleIntro.welcomeLead')}</Text>
      </View>
    );
  }
  if (page.kind === 'highlights') {
    return (
      <View>
        <Text style={styles.kicker}>{t('moduleIntro.startTitle')}</Text>
        <Text style={styles.title}>{t('moduleIntro.welcomeHighlights')}</Text>
        <View style={styles.list}>
          {page.modules.map((mod) => {
            const loc = localizeIntro(mod, lang);
            return (
              <View key={mod.id} style={styles.row}>
                <View style={[styles.miniIcon, { backgroundColor: loc.soft }]}>
                  <Ionicons name={loc.icon} size={16} color={loc.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{loc.kicker}</Text>
                  <Text style={styles.rowBody} numberOfLines={2}>{shortPitch(loc.pitch, 88)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }
  if (page.kind === 'apps') {
    return (
      <View>
        <Text style={styles.kicker}>{t('moduleIntro.help')}</Text>
        <Text style={styles.title}>{t('moduleIntro.welcomeApps')}</Text>
        <View style={styles.chipGrid}>
          {page.modules.map((mod) => {
            const loc = localizeIntro(mod, lang);
            return (
              <View key={mod.id} style={[styles.chip, { backgroundColor: loc.soft }]}>
                <Ionicons name={loc.icon} size={14} color={loc.accent} />
                <Text style={[styles.chipTxt, { color: loc.accent }]} numberOfLines={1}>
                  {loc.kicker}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }
  return (
    <View>
      <View style={[styles.iconBadge, { backgroundColor: '#fffbeb' }]}>
        <Ionicons name="bulb" size={22} color="#d97706" />
      </View>
      <Text style={[styles.kicker, { color: '#d97706' }]}>{t('moduleIntro.help')}</Text>
      <Text style={styles.title}>{t('moduleIntro.welcomeHelpTitle')}</Text>
      <Text style={styles.body}>{t('moduleIntro.welcomeHelpBody')}</Text>
    </View>
  );
}

function ModulePage({ page, copy, t, stepTotal, highlighted }) {
  if (page.kind === 'pitch') {
    return (
      <View>
        <View style={[styles.iconBadge, { backgroundColor: copy.soft }]}>
          <Ionicons name={copy.icon} size={22} color={copy.accent} />
        </View>
        <Text style={[styles.kicker, { color: copy.accent }]}>{copy.kicker}</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.pitch}</Text>
      </View>
    );
  }
  return (
    <View>
      <Text style={[styles.kicker, { color: copy.accent }]}>
        {t('moduleIntro.stepN')} {page.index + 1} / {stepTotal}
      </Text>
      <Text style={styles.title}>{t('moduleIntro.startTitle')}</Text>
      <View style={styles.stepBlock}>
        <View style={[styles.stepNum, { backgroundColor: copy.accent }]}>
          <Text style={styles.stepNumTxt}>{page.index + 1}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.stepTxt}>{page.text}</Text>
          {highlighted ? (
            <Text style={[styles.whereHint, { color: copy.accent }]}>
              {page.where || t('moduleIntro.tapHighlight')}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  card: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#0f1419',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
    overflow: 'hidden',
  },
  cardSoft: {
    backgroundColor: soft.cream,
    borderRadius: soft.radius,
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  cardInner: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  close: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  snapRow: {
    scrollSnapType: 'x mandatory',
  },
  snapPage: {
    scrollSnapAlign: 'start',
    scrollSnapStop: 'always',
  },
  page: {
    paddingRight: 4,
    paddingTop: 4,
    minHeight: 168,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#2563eb',
  },
  title: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '400',
    color: '#0f1419',
    lineHeight: 26,
  },
  body: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    fontWeight: '400',
  },
  list: { marginTop: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  miniIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 13, fontWeight: '400', color: '#0f1419' },
  rowBody: { fontSize: 12, lineHeight: 17, color: '#64748b', marginTop: 1 },
  chipGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    maxWidth: '100%',
  },
  chipTxt: { fontSize: 12, fontWeight: '400', maxWidth: 140 },
  stepBlock: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumTxt: { color: '#fff', fontSize: 13, fontWeight: '400' },
  stepTxt: {
    fontSize: 16,
    lineHeight: 23,
    color: '#334155',
    fontWeight: '500',
  },
  whereHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    marginBottom: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
  },
  ctaTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
  skip: {
    marginTop: 10,
    textAlign: 'center',
    color: '#64748b',
    fontWeight: '400',
    fontSize: 13,
  },
  skipQuiet: {
    marginTop: 4,
    textAlign: 'center',
    color: '#94a3b8',
    fontWeight: '400',
    fontSize: 12,
  },
  moduleExtras: { marginTop: 2 },
});
