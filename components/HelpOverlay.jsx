import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
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
  phoneFitCap, resolveHole, shortPitch, tourCardCap, visibleTourPages,
} from '../src/utils/helpLayout';
import { getWelcomeTourModules, localizeIntro, pickIntroText } from '../src/utils/moduleIntros';
import { processTour, getProcess } from '../src/help/protopProcesses';
import { locateStepTarget } from '../src/help/findTarget';
import { isOrganizationType } from '../src/utils/groupTypes';
import { openAssistant } from '../src/help/assistantBridge';
import { soft } from './parentHome/softTheme';
import { subscribeAppRoute } from '../src/navigation/navRef';

const MASK_ID = 'wp-help-spot';
const NATIVE_DRIVER = Platform.OS !== 'web';
const DIM = 'rgba(7, 16, 35, 0.72)';
/** Ankre der reserveplasseringen faktisk peker på riktig sted uten måling. */
const RELIABLE_FALLBACK = new Set(['helpBtn', 'rail', 'tabs', 'header']);

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}

function buildWelcomePages(scope, asChild, company) {
  const tour = getWelcomeTourModules(scope, { asChild, company });
  const pages = [{ kind: 'intro' }];
  if (tour.highlights.length) pages.push({ kind: 'highlights', modules: tour.highlights });
  if (tour.apps.length) pages.push({ kind: 'apps', modules: tour.apps });
  pages.push({ kind: 'helpBtn', anchor: 'helpBtn' });
  return pages;
}

function buildProcessPages(processId, lang) {
  return processTour(processId).map((s) => ({
    kind: 'step',
    index: s.index,
    title: pickIntroText(s.title, lang),
    text: pickIntroText(s, lang),
    pageLabel: pickIntroText(s.pageLabel, lang),
    find: s.find || [],
    via: s.via || [],
    viaText: s.viaText ? pickIntroText(s.viaText, lang) : '',
    pending: s.pending ? pickIntroText(s.pending, lang) : '',
    anchor: s.anchor || 'content',
    go: s.go || null,
    where: '',
    scene: 'hub',
    advance: false,
  }));
}

export default function HelpOverlay() {
  const { t, lang } = useI18n();
  const help = useHelp();
  const { isChild, isActingAsChild, family, requestShellTab } = useApp();
  const asChild = !!(isChild || isActingAsChild);
  const company = isOrganizationType(family?.type);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const layout = useLayout();
  const { theme: parentTheme } = useParentDashboardTheme();
  const {
    mode, copy, scope, dismiss, openWelcome, requestRemeasure, targets,
    scene, setTourIndex, tourIndex, runTargetAdvance, runRetreat, processId,
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
    if (mode === 'welcome') return buildWelcomePages(scope, asChild, company);
    if (mode === 'module') return visibleTourPages(adaptedTour, scene);
    if (mode === 'process') return buildProcessPages(processId, lang);
    return [];
  }, [mode, scope, adaptedTour, asChild, company, scene, processId, lang]);

  const process = mode === 'process' ? getProcess(processId) : null;
  const tourTotal = mode === 'module'
    ? (adaptedTour.length || copy?.steps?.length || pages.length)
    : pages.length;
  const softFamilyChrome = scope === 'family' && !asChild && !layout.isDesktop && !company;

  const [page, setPage] = useState(0);
  const [routeName, setRouteName] = useState('');
  useEffect(() => subscribeAppRoute(setRouteName), []);
  const helpHeld = routeName === 'ProfileSetup';
  const [cardSize, setCardSize] = useState({ w: 380, h: 340 });
  const [foundRect, setFoundRect] = useState(null);
  // Markeringen står på knappen som åpner steget (via), ikke målknappen.
  const [foundVia, setFoundVia] = useState(null);
  const foundElRef = useRef(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(-14)).current;
  const stepFade = useRef(new Animated.Value(1)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const navigatedRef = useRef('');
  const visible = !helpHeld
    && (mode === 'welcome' || mode === 'module' || mode === 'process')
    && pages.length > 0;

  useEffect(() => {
    if (!helpHeld || !mode) return;
    dismiss({ skipPersist: true });
  }, [helpHeld, mode, dismiss]);

  // Modul-rundturen følger tourIndex (kan flyttes av hub/inner-scener).
  useEffect(() => {
    if (mode === 'module') {
      const idx = pages.findIndex((p) => p.index === tourIndex);
      const next = idx >= 0 ? idx : 0;
      setPage(next);
      const step = pages[next];
      if (step?.index != null && step.index !== tourIndex) setTourIndex(step.index);
      return;
    }
    if (mode === 'process') {
      setPage(Math.max(0, Math.min(pages.length - 1, tourIndex || 0)));
      return;
    }
    setPage(0);
  }, [mode, scope, copy?.title, scene, processId]);

  // Fade ned: laget tones inn og kortet glir ned på plass.
  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      drop.setValue(-14);
      navigatedRef.current = '';
      return undefined;
    }
    requestRemeasure();
    // Bare opasitet her: kortets «gli ned» styres av steg-effekten under,
    // og to animasjoner på samme verdi i en parallel stopper hverandre.
    const anim = Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: NATIVE_DRIVER });
    anim.start();
    return () => anim.stop();
  }, [visible, opacity, drop, requestRemeasure]);

  // Hvert nytt steg toner inn og glir litt ned.
  useEffect(() => {
    if (!visible) return undefined;
    stepFade.setValue(0);
    drop.setValue(-14);
    const anim = Animated.parallel([
      Animated.timing(stepFade, { toValue: 1, duration: 260, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(drop, {
        toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
      }),
    ], { stopTogether: false });
    anim.start();
    return () => anim.stop();
  }, [visible, page, stepFade, drop]);

  // Pulserende ring rundt knappen som skal trykkes.
  useEffect(() => {
    if (!visible) return undefined;
    ring.setValue(0);
    const loop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, ring]);

  useEffect(() => {
    if (!visible) return undefined;
    requestRemeasure();
    const tick = setInterval(() => requestRemeasure(), 450);
    return () => clearInterval(tick);
  }, [visible, width, height, scene, page, requestRemeasure]);

  const current = pages[page] || pages[0];
  const isLastGlobal = mode === 'process'
    ? page >= pages.length - 1
    : (current?.index ?? 0) >= Math.max(0, tourTotal - 1);

  // Prosess: åpne siden steget gjelder før vi markerer knappen.
  useEffect(() => {
    if (!visible || mode !== 'process' || !current?.go?.tab) return;
    const key = `${processId}:${page}`;
    if (navigatedRef.current === key) return;
    navigatedRef.current = key;
    setFoundRect(null);
    try { requestShellTab?.(current.go.tab, current.go.subView || null); } catch { /* ignore */ }
    requestRemeasure();
  }, [visible, mode, processId, page, current?.go, requestShellTab, requestRemeasure]);

  // Uten venstremeny (mobil) peker menysteg på ☰-knappen i stedet.
  const noRail = !layout.hasRail && !layout.isDesktop;
  const stepFind = useMemo(() => {
    const base = current?.find || [];
    if (current?.anchor === 'rail' && noRail) return [...base, 'Åpne meny'];
    return base;
  }, [current?.find, current?.anchor, noRail]);
  const stepVia = current?.via || [];

  // Web: finn den ekte knappen fra steget (find) og hold markeringen fast på den.
  // Finnes den ikke ennå, markeres knappen som åpner den (via).
  const findKey = stepFind.join('|');
  const viaKey = stepVia.join('|');
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || (!findKey && !viaKey)) {
      setFoundRect(null);
      setFoundVia(null);
      foundElRef.current = null;
      return undefined;
    }
    let alive = true;
    let scrolled = false;
    const find = findKey ? findKey.split('|') : [];
    const via = viaKey ? viaKey.split('|') : [];
    const look = () => {
      if (!alive) return;
      const hit = locateStepTarget({ find, via }, { scroll: !scrolled });
      const rect = hit?.rect || null;
      if (rect) scrolled = true;
      foundElRef.current = hit?.el || null;
      setFoundVia(hit?.via ? hit.label : null);
      setFoundRect((prev) => {
        if (!rect) return null;
        if (prev
          && Math.abs(prev.x - rect.x) < 1 && Math.abs(prev.y - rect.y) < 1
          && Math.abs(prev.w - rect.w) < 1 && Math.abs(prev.h - rect.h) < 1) return prev;
        return rect;
      });
    };
    setFoundRect(null);
    setFoundVia(null);
    look();
    const tick = setInterval(look, 400);
    return () => { alive = false; clearInterval(tick); };
  }, [visible, findKey, viaKey, page, width, height]);

  const hole = useMemo(() => {
    if (!visible) return null;
    if (foundRect) return resolveHole('found', foundRect, layoutHints);
    const anchor = current?.anchor;
    if (!anchor) return null;
    const measured = targets[anchor];
    const hasMeasured = measured && measured.w > 8 && measured.h > 8;
    const reliable = RELIABLE_FALLBACK.has(anchor)
      && !(anchor === 'rail' && noRail)
      && !(anchor === 'tabs' && !layout.isPhone);
    // ProTop-steg med knappetekst: ingen gjettet markering når knappen mangler.
    if ((stepFind.length || stepVia.length) && !hasMeasured && !reliable) return null;
    if (mode === 'process' && !hasMeasured && !reliable) return null;
    if (!hasMeasured && !reliable && (anchor === 'rail' || anchor === 'tabs')) return null;
    const alt = anchor === 'shortcuts' || anchor === 'timeline'
      ? (targets.content || targets.rail || null)
      : anchor === 'edit'
        ? (targets.header || null)
        : null;
    return resolveHole(anchor, measured, layoutHints, alt);
  }, [visible, foundRect, current?.anchor, stepFind, stepVia, mode, targets, layoutHints, noRail, layout.isPhone]);

  // Kortet vokser med teksten opp til taket; bare innholdet over taket ruller.
  const baseCap = tourCardCap({ winH: height, winW: width, isPhone: layout.isPhone, inset: insets });
  const cardCap = layout.isPhone || width < 768
    ? phoneFitCap({ winH: height, hole, cap: baseCap, inset: insets })
    : baseCap;
  const cardRect = useMemo(() => placeCard({
    winW: width,
    winH: height,
    hole,
    cardW: Math.min(420, width - 24),
    cardH: Math.min(cardSize.h, cardCap),
    isPhone: layout.isPhone,
    inset: insets,
  }), [width, height, hole, cardSize.h, cardCap, layout.isPhone, insets]);

  const goTo = useCallback((next) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, next));
    setPage(clamped);
    const step = pages[clamped];
    if (mode === 'module' && step?.index != null) setTourIndex(step.index);
    if (mode === 'process') setTourIndex(clamped);
  }, [pages, mode, setTourIndex]);

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

  const goNext = useCallback(() => {
    if (mode === 'module' && current?.advance) {
      tryAdvance(current.anchor);
      const nextIdx = (current?.index ?? 0) + 1;
      const next = adaptedTour[nextIdx];
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
    close();
  }, [
    mode, current, page, pages.length, tryAdvance, goTo, adaptedTour, scene,
    isLastGlobal, setTourIndex, runRetreat, remeasureSoon, close,
  ]);

  // Trykk på markeringen: via-knappen åpnes for brukeren (så finner vi
  // målknappen inni), ellers går turen videre.
  const onSpotlight = useCallback(() => {
    const el = foundElRef.current;
    if (foundVia && el && typeof el.click === 'function') {
      try { el.click(); } catch { /* ignore */ }
      setFoundVia(null);
      remeasureSoon();
      return;
    }
    goNext();
  }, [foundVia, goNext, remeasureSoon]);

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

  const last = page >= pages.length - 1
    && !(mode === 'module' && current?.advance)
    && (mode !== 'module' || isLastGlobal);
  const ctaLabel = last
    ? (mode === 'welcome' ? t('moduleIntro.explore') : t('moduleIntro.finish'))
    : t('moduleIntro.next');
  const accent = (mode === 'process' ? process?.accent : copy?.accent) || '#1099F4';
  const arrowStart = hole ? attachPoint(cardRect, hole) : null;
  const arrowEnd = hole ? attachPoint(hole, cardRect) : null;
  const stepNo = mode === 'welcome' ? page + 1 : (mode === 'process' ? page + 1 : (current?.index ?? 0) + 1);
  const stepCount = mode === 'welcome' ? pages.length : tourTotal;

  const topHost = useTopHost(visible);

  // Unmount when idle — a hidden RN Modal on Safari/Chrome can eat all taps
  // (Dokumenter / album). Same pattern as ConfirmDialog / AlbumSheet.
  if (!visible) return null;

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.85, 0.15, 0] });

  const overlayBody = (
    <Animated.View style={[styles.root, { opacity }]} pointerEvents="box-none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Mask id={MASK_ID} x="0" y="0" width={width} height={height}>
            <Rect x="0" y="0" width={width} height={height} fill="#fff" />
            {hole ? (
              <Rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={14} ry={14} fill="#000" />
            ) : null}
          </Mask>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={DIM} mask={`url(#${MASK_ID})`} />
        {hole ? (
          <Rect
            x={hole.x}
            y={hole.y}
            width={hole.w}
            height={hole.h}
            rx={14}
            ry={14}
            fill="none"
            stroke="#fff"
            strokeWidth={3}
          />
        ) : null}
        {hole && arrowStart && arrowEnd ? (
          <>
            <Path
              d={arrowPath(arrowStart, arrowEnd)}
              stroke="#fff"
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray="6 5"
            />
            <Path d={arrowHead(arrowStart, arrowEnd, 11)} fill="#fff" />
          </>
        ) : null}
      </Svg>

      {hole ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              left: hole.x - 4,
              top: hole.y - 4,
              width: hole.w + 8,
              height: hole.h + 8,
              borderColor: accent,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      ) : null}

      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t('moduleIntro.close')} />
      {hole ? (
        <Pressable
          onPress={onSpotlight}
          accessibilityRole="button"
          accessibilityLabel={foundVia ? foundVia : t('moduleIntro.next')}
          testID="help-spotlight"
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
            maxHeight: cardCap,
            transform: [{ translateY: drop }],
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
        testID="help-tour-card"
      >
        <View style={[styles.cardAccent, { backgroundColor: accent }]} />
        <View style={styles.cardInner}>
          <View style={styles.topRow}>
            <View style={[styles.stepPill, { backgroundColor: `${accent}1A` }]}>
              <Ionicons
                name={mode === 'process' ? 'git-merge-outline' : mode === 'welcome' ? 'sparkles-outline' : 'footsteps-outline'}
                size={13}
                color={accent}
              />
              <Text style={[styles.stepPillTxt, { color: accent }]} testID="help-step-counter">
                {t('moduleIntro.stepN')} {stepNo} {t('moduleIntro.of')} {stepCount}
              </Text>
            </View>
            <TouchableOpacity
              onPress={close}
              style={styles.close}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('moduleIntro.close')}
            >
              <Ionicons name="close" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.progress}>
            {Array.from({ length: stepCount }).map((_, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  if (mode === 'module') {
                    const idx = pages.findIndex((p) => p.index === i);
                    if (idx >= 0) goTo(idx);
                    return;
                  }
                  goTo(i);
                }}
                hitSlop={6}
                style={[
                  styles.progressSeg,
                  i < stepNo && { backgroundColor: accent },
                  i === stepNo - 1 && styles.progressSegNow,
                ]}
                accessibilityLabel={`${t('moduleIntro.stepN')} ${i + 1}`}
              />
            ))}
          </View>

          <Animated.View style={{ opacity: stepFade }}>
            <ScrollView
              style={{ maxHeight: Math.max(110, cardCap - 200) }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {mode === 'welcome' ? (
                <WelcomePage page={current} lang={lang} t={t} company={company} />
              ) : (
                <StepPage
                  page={current}
                  copy={copy}
                  process={process}
                  lang={lang}
                  t={t}
                  accent={accent}
                  highlighted={!!hole}
                  viaLabel={hole ? foundVia : null}
                />
              )}
            </ScrollView>
          </Animated.View>

          <View style={styles.actions}>
            {(page > 0 || (mode === 'module' && scene === 'inner')) ? (
              <TouchableOpacity
                onPress={goBack}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel={t('moduleIntro.back')}
              >
                <Ionicons name="chevron-back" size={18} color="#334155" />
                <Text style={styles.backTxt}>{t('moduleIntro.back')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={goNext}
              style={[styles.cta, { backgroundColor: accent }]}
              accessibilityRole="button"
              accessibilityLabel={ctaLabel}
              testID="help-tour-next"
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
              <Text style={styles.keysHint}>
                {Platform.OS === 'web' && !layout.isPhone ? t('moduleIntro.keysHint') : t('moduleIntro.tapHint')}
              </Text>
              {mode === 'module' && copy?.pageKey ? (
                <TouchableOpacity
                  onPress={() => {
                    const label = copy.label || copy.title;
                    dismiss();
                    openAssistant({
                      title: t('assistant.name'),
                      question: lang === 'en' ? `How do I use ${label}?` : `Hvordan bruker jeg ${label}?`,
                    });
                  }}
                  accessibilityRole="button"
                  testID="help-tour-ask"
                >
                  <Text style={styles.skipQuiet}>{t('helpCard.askAssistant')}</Text>
                </TouchableOpacity>
              ) : mode === 'module' ? (
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
    if (!topHost) return null;
    return createPortal(
      <div style={webHelpPortalStyle} data-wp-help-overlay="1">
        {overlayBody}
      </div>,
      topHost,
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
  zIndex: 2147483647,
};

/**
 * Web: egen beholder sist i <body>. Menyer og ark som et steg åpner (f.eks.
 * «Ny kunde») legges også i <body> med høy z-index — beholderen flyttes sist
 * igjen, så rundturen alltid ligger øverst og det åpnede vises i markeringen.
 */
function useTopHost(active) {
  const [host, setHost] = useState(null);
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof document === 'undefined' || !document.body) return undefined;
    const el = document.createElement('div');
    el.setAttribute('data-wp-help-host', '1');
    document.body.appendChild(el);
    setHost(el);
    const keepLast = () => {
      if (el.isConnected && document.body.lastElementChild !== el) document.body.appendChild(el);
    };
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(keepLast) : null;
    observer?.observe(document.body, { childList: true });
    return () => {
      observer?.disconnect();
      el.remove();
      setHost(null);
    };
  }, [active]);
  return host;
}

function WelcomePage({ page, lang, t, company }) {
  if (!page) return null;
  if (page.kind === 'intro') {
    return (
      <View>
        <View style={[styles.iconBadge, { backgroundColor: '#eff6ff' }]}>
          <Ionicons name="sparkles" size={22} color="#1099F4" />
        </View>
        <Text style={styles.kicker}>{t('moduleIntro.help')}</Text>
        <Text style={styles.title}>{t('moduleIntro.welcomeTitle')}</Text>
        <Text style={styles.body}>{t(company ? 'moduleIntro.welcomeLeadCompany' : 'moduleIntro.welcomeLead')}</Text>
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
                  <Text style={styles.rowTitle} numberOfLines={1}>{loc.label || loc.kicker}</Text>
                  <Text style={styles.rowBody} numberOfLines={2}>{shortPitch(loc.pitch, 96)}</Text>
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
                  {loc.label || loc.kicker}
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

function StepPage({ page, copy, process, lang, t, accent, highlighted, viaLabel }) {
  if (!page) return null;
  const heading = page.title
    || (process ? pickIntroText(process.title, lang) : copy?.title)
    || t('moduleIntro.startTitle');
  const context = process
    ? pickIntroText(process.title, lang)
    : (copy?.label || copy?.kicker || '');
  // Uten markering: si når knappen dukker opp — ikke «Fremhevet: …».
  const unlitHint = page.pending
    || (page.where && !/^(Fremhevet|Highlighted)\b/.test(page.where) ? page.where : '');
  return (
    <View>
      {context ? (
        <Text style={[styles.kicker, { color: accent }]} numberOfLines={1}>{context}</Text>
      ) : null}
      <Text style={styles.stepTitle} testID="help-step-title">{heading}</Text>
      {process && page.pageLabel ? (
        <View style={[styles.pageChip, { borderColor: `${accent}55` }]}>
          <Ionicons name="navigate-outline" size={13} color={accent} />
          <Text style={[styles.pageChipTxt, { color: accent }]} numberOfLines={1}>{page.pageLabel}</Text>
        </View>
      ) : null}
      <Text style={styles.stepTxt}>{page.text}</Text>
      {viaLabel ? (
        <View style={[styles.viaRow, { borderColor: `${accent}40`, backgroundColor: `${accent}12` }]} testID="help-step-via">
          <Ionicons name="hand-right-outline" size={15} color={accent} />
          <Text style={[styles.viaTxt, { color: accent }]}>
            {page.viaText
              || (viaLabel.startsWith('#')
                ? t('moduleIntro.viaHintPick')
                : t('moduleIntro.viaHint').replace('{label}', viaLabel))}
          </Text>
        </View>
      ) : highlighted ? (
        <View style={styles.whereRow}>
          <Ionicons name="hand-left-outline" size={14} color={accent} />
          <Text style={[styles.whereHint, { color: accent }]}>
            {page.where || t('moduleIntro.tapHighlight')}
          </Text>
        </View>
      ) : (unlitHint ? (
        <View style={styles.whereRow} testID="help-step-pending">
          <Ionicons name="information-circle-outline" size={14} color="#64748b" />
          <Text style={[styles.whereHint, { color: '#64748b' }]}>{unlitHint}</Text>
        </View>
      ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: 18,
  },
  card: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#0f1419',
    shadowOpacity: 0.28,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 14,
    overflow: 'hidden',
  },
  cardSoft: {
    backgroundColor: soft.cream,
    borderRadius: soft.radius,
    shadowOpacity: 0.14,
    shadowRadius: 18,
  },
  cardAccent: {
    height: 4,
    width: '100%',
  },
  cardInner: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stepPillTxt: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 10,
    marginBottom: 12,
  },
  progressSeg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
  },
  progressSegNow: {
    height: 6,
    marginTop: -1,
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
    fontWeight: '500',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#1099F4',
  },
  title: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '500',
    color: '#0f1419',
    lineHeight: 26,
  },
  stepTitle: {
    marginTop: 4,
    fontSize: 19,
    fontWeight: '600',
    color: '#0f1419',
    lineHeight: 25,
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
  rowTitle: { fontSize: 13, fontWeight: '600', color: '#0f1419' },
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
  chipTxt: { fontSize: 12, fontWeight: '500', maxWidth: 160 },
  pageChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  pageChipTxt: { fontSize: 12, fontWeight: '500' },
  stepTxt: {
    marginTop: 10,
    fontSize: 15.5,
    lineHeight: 23,
    color: '#334155',
    fontWeight: '400',
  },
  whereRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  whereHint: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  backBtn: {
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  backTxt: { color: '#334155', fontSize: 14, fontWeight: '500' },
  cta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
  },
  ctaTxt: { color: '#fff', fontWeight: '600', fontSize: 15 },
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
  viaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  viaTxt: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  keysHint: {
    marginTop: 10,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 11.5,
  },
  moduleExtras: { marginTop: 2 },
});
