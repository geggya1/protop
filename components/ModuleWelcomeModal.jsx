import React, { useCallback, useEffect, useId, useRef } from 'react';
import {
  Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import BrandLogo from './BrandLogo';
import { illustrationSourceForModule } from '../src/modules/moduleActivationAssets';
import {
  overlayDismissAllowedAt,
  OVERLAY_DISMISS_GUARD_MS,
} from '../src/utils/overlayDismissGuard';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}

const PANEL_TOP = '#152344';
const PANEL_MID = '#0B1429';
const PANEL_END = '#152B61';
const TEXT = '#F2F5FF';
const TEXT_MUTED = '#D2DAEA';
const TEXT_SOFT = '#9FAAC0';
const EYEBROW = '#9FBFFF';
const LOGO_WORD = '#EAF1FF';
const CHECK_FILL = 'rgba(99, 216, 189, 0.16)';
const CHECK_STROKE = 'rgba(112, 228, 198, 0.40)';
const CHECK_MARK = '#73E4C8';
const PRIMARY = '#347CF5';
const SECONDARY = '#6B58EE';
const PANEL_GRADIENT = `linear-gradient(135deg, ${PANEL_TOP} 0%, ${PANEL_MID} 58%, ${PANEL_END} 100%)`;
const BRAND_GRADIENT = `linear-gradient(135deg, ${PRIMARY} 0%, ${SECONDARY} 100%)`;
const GLOW = 'radial-gradient(circle, rgba(84,136,255,0.34) 0%, rgba(112,91,241,0.13) 52%, rgba(112,91,241,0) 100%)';

function webFocusRing() {
  if (Platform.OS !== 'web') return null;
  return {
    outlineWidth: 2,
    outlineStyle: 'solid',
    outlineColor: '#93c5fd',
    outlineOffset: 3,
  };
}

function BenefitCheck({ size = 23 }) {
  const markSize = size <= 20 ? 11 : 13;
  return (
    <View
      style={[
        styles.check,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      accessible={false}
      importantForAccessibility="no"
    >
      <Text style={[styles.checkMark, { fontSize: markSize, lineHeight: markSize + 2 }]}>✓</Text>
    </View>
  );
}

/**
 * Velkomst- og aktiveringsvindu. Tekst kommer fra modulregisteret.
 * Layout og farger følger renderer-scriptet som laget PC/mobil-mockupene.
 */
export default function ModuleWelcomeModal({
  module,
  onActivate,
  onBack,
  activating = false,
  canActivate = true,
  showReassurance = true,
  primaryLabel,
  activatingLabel = 'Aktiverer…',
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const primaryRef = useRef(null);
  const { width, height } = useWindowDimensions();
  const split = width >= 768 && height >= 520;
  const compact = height < 640 || width < 380;
  const stackedHeight = Math.min(compact ? 620 : 760, Math.max(280, height - 30));
  const artWidth = split ? 312 : (compact ? 160 : 186);
  const artHeight = split ? 312 : (compact ? 132 : 155);
  const glowSize = split
    ? { width: 336, height: 336 }
    : { width: compact ? 210 : 250, height: compact ? 160 : 192 };
  const reassurance = split
    ? module?.reassuranceText
    : (module?.mobileReassuranceText || module?.reassuranceTextCompact || module?.reassuranceText);

  useEffect(() => {
    const node = primaryRef.current;
    const t = setTimeout(() => {
      try { node?.focus?.(); } catch { /* ignore */ }
    }, 40);
    return () => clearTimeout(t);
  }, [module?.id]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const root = dialogRef.current;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack?.();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const focusable = root.querySelectorAll?.(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onBack, module?.id]);

  if (!module) return null;

  const benefits = Array.isArray(module.benefits) ? module.benefits.slice(0, 3) : [];
  const illustrationSrc = illustrationSourceForModule(module.id, module.illustrationPath || module.illustration);

  return (
    <View
      ref={dialogRef}
      accessibilityRole="dialog"
      accessibilityViewIsModal
      aria-modal="true"
      aria-labelledby={titleId}
      style={[
        styles.dialog,
        split ? styles.dialogSplit : styles.dialogStack,
        Platform.OS === 'web' && styles.dialogWebGradient,
        split
          ? {
            width: Math.min(940, width - 24),
            height: Math.min(590, height - 32),
            borderRadius: 32,
          }
          : {
            width: '100%',
            maxWidth: 360,
            height: stackedHeight,
            maxHeight: stackedHeight,
            borderRadius: 27,
          },
      ]}
    >
      <View style={[styles.artPane, split ? styles.artPaneSplit : styles.artPaneStack, compact && styles.artPaneCompact]}>
        <View style={[styles.logoWrap, split ? styles.logoWrapSplit : styles.logoWrapStack, compact && styles.logoWrapCompact]}>
          <View style={styles.logoRow} accessible={false} importantForAccessibility="no-hide-descendants">
            <BrandLogo variant="mark" height={split ? 25 : 22} />
            <Text style={[styles.logoWord, !split && styles.logoWordStack]} accessibilityElementsHidden>
              ProTop
            </Text>
          </View>
        </View>
        <View style={[styles.artStage, split ? styles.artStageSplit : styles.artStageStack]}>
          <View
            pointerEvents="none"
            style={[
              styles.glow,
              glowSize,
              Platform.OS === 'web' && styles.glowWeb,
            ]}
          />
          {illustrationSrc ? (
            <Image
              source={illustrationSrc}
              style={[styles.art, { width: artWidth, height: artHeight }]}
              resizeMode="contain"
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              alt=""
            />
          ) : null}
        </View>
      </View>

      <View style={split ? styles.vDivider : styles.hDivider} />

      <View style={[styles.copyPane, split ? styles.copyPaneSplit : styles.copyPaneStack]}>
        <ScrollView
          style={styles.copyScroll}
          contentContainerStyle={[
            styles.copyInner,
            split ? styles.copyInnerSplit : styles.copyInnerStack,
            compact && styles.copyInnerCompact,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {module.eyebrow ? (
            <Text style={[styles.eyebrow, !split && styles.eyebrowStack]}>{module.eyebrow}</Text>
          ) : null}
          <Text nativeID={titleId} id={titleId} style={[styles.headline, !split && styles.headlineStack]}>
            {module.headline}
          </Text>
          {module.pitch ? (
            <Text style={[styles.pitch, !split && styles.pitchStack]}>{module.pitch}</Text>
          ) : null}

          <View style={[styles.benefits, !split && styles.benefitsStack]}>
            {benefits.map((text) => (
              <View key={text} style={styles.benefitRow}>
                <BenefitCheck size={split ? 23 : 20} />
                <Text style={[styles.benefitTxt, !split && styles.benefitTxtStack]}>{text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={[styles.footer, split ? styles.footerSplit : styles.footerStack, compact && styles.footerCompact]}>
          <View style={[styles.actions, !split && styles.actionsStack]}>
            {canActivate ? (
              <TouchableOpacity
                ref={primaryRef}
                onPress={onActivate}
                disabled={activating}
                accessibilityRole="button"
                accessibilityLabel={primaryLabel || module.activationLabel}
                style={[
                  styles.primaryBtn,
                  split ? styles.primaryBtnSplit : styles.primaryBtnStack,
                  Platform.OS === 'web' && styles.primaryBtnWeb,
                  activating && styles.btnDisabled,
                  webFocusRing(),
                ]}
              >
                <Text style={[styles.primaryTxt, !split && styles.primaryTxtStack]} numberOfLines={1}>
                  {activating ? activatingLabel : (primaryLabel || module.activationLabel)}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={module.backLabel}
              style={[
                styles.secondaryBtn,
                split ? styles.secondaryBtnSplit : styles.secondaryBtnStack,
                webFocusRing(),
              ]}
            >
              <Text style={[styles.secondaryTxt, !split && styles.secondaryTxtStack]}>{module.backLabel}</Text>
            </TouchableOpacity>
          </View>

          {showReassurance && reassurance ? (
            <Text style={[styles.reassurance, !split && styles.reassuranceStack]}>
              {reassurance}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function ModuleActivationScrim({ children, onRequestBack, dismissLabel = 'Lukk uten å aktivere' }) {
  const { width } = useWindowDimensions();
  const mobile = width < 768;
  const openedAtRef = useRef(Date.now());

  useEffect(() => {
    openedAtRef.current = Date.now();
  }, []);

  const requestBack = useCallback(() => {
    if (!overlayDismissAllowedAt(openedAtRef.current, Date.now(), OVERLAY_DISMISS_GUARD_MS)) {
      return;
    }
    onRequestBack?.();
  }, [onRequestBack]);

  const overlay = (
    <View
      style={[styles.scrim, mobile ? styles.scrimMobile : styles.scrimDesktop]}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.scrimFill}
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        onPress={requestBack}
      />
      <View
        style={styles.scrimCenter}
        pointerEvents="box-none"
      >
        {children}
      </View>
    </View>
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body && createPortal) {
    return createPortal(
      <div style={webPortalStyle} data-wp-module-welcome="1">
        {overlay}
      </div>,
      document.body,
    );
  }

  if (Platform.OS !== 'web') {
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={requestBack}
        statusBarTranslucent
      >
        {overlay}
      </Modal>
    );
  }

  return overlay;
}

const webPortalStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 200000,
  display: 'flex',
  width: '100%',
  height: '100%',
};

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    zIndex: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 16,
    width: '100%',
    height: '100%',
  },
  scrimDesktop: {
    backgroundColor: 'rgba(5, 10, 22, 0.81)',
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(2px)',
      WebkitBackdropFilter: 'blur(2px)',
    } : null),
  },
  scrimMobile: {
    backgroundColor: 'rgba(5, 10, 22, 0.82)',
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(2px)',
      WebkitBackdropFilter: 'blur(2px)',
    } : null),
  },
  scrimFill: {
    ...StyleSheet.absoluteFillObject,
  },
  scrimCenter: {
    width: '100%',
    maxWidth: 940,
    maxHeight: '100%',
    zIndex: 1,
    alignItems: 'center',
  },
  dialog: {
    backgroundColor: PANEL_MID,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    maxHeight: '100%',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 24 },
    elevation: 16,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 24px 56px rgba(0,0,0,0.42)',
    } : null),
  },
  dialogWebGradient: Platform.OS === 'web' ? {
    backgroundImage: PANEL_GRADIENT,
  } : null,
  dialogSplit: {
    flexDirection: 'row',
  },
  dialogStack: {
    flexDirection: 'column',
    alignSelf: 'center',
  },
  artPane: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  artPaneSplit: {
    flex: 395,
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 18,
  },
  artPaneStack: {
    flexShrink: 0,
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
    minHeight: 205,
  },
  artPaneCompact: {
    minHeight: 156,
    paddingTop: 44,
    paddingBottom: 8,
  },
  logoWrap: {
    position: 'absolute',
    zIndex: 2,
  },
  logoWrapSplit: {
    top: 29,
    left: 30,
  },
  logoWrapStack: {
    top: 18,
    left: 22,
  },
  logoWrapCompact: {
    top: 12,
    left: 14,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoWord: {
    color: LOGO_WORD,
    fontSize: 15,
    fontWeight: '400',
  },
  logoWordStack: {
    fontSize: 13,
  },
  artStage: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  artStageSplit: {
    marginTop: 18,
  },
  artStageStack: {
    marginTop: 8,
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(84, 136, 255, 0.18)',
  },
  glowWeb: Platform.OS === 'web' ? {
    backgroundColor: 'transparent',
    backgroundImage: GLOW,
  } : null,
  art: {
    zIndex: 1,
    ...(Platform.OS === 'web' ? {
      filter: 'drop-shadow(0 16px 14px rgba(0,0,0,0.28))',
    } : {
      shadowColor: '#000',
      shadowOpacity: 0.28,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 16 },
    }),
  },
  vDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  hDivider: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  copyPane: {
    minWidth: 0,
    minHeight: 0,
    zIndex: 1,
    flexDirection: 'column',
  },
  copyPaneSplit: {
    flex: 545,
  },
  copyPaneStack: {
    flex: 1,
  },
  copyScroll: {
    flex: 1,
    minHeight: 0,
  },
  copyInner: {
    flexGrow: 0,
    justifyContent: 'flex-start',
  },
  copyInnerSplit: {
    paddingHorizontal: 52,
    paddingTop: 48,
    paddingBottom: 12,
    gap: 12,
  },
  copyInnerStack: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 8,
    gap: 10,
  },
  copyInnerCompact: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  footer: {
    flexShrink: 0,
  },
  footerSplit: {
    paddingHorizontal: 52,
    paddingBottom: 28,
    paddingTop: 4,
  },
  footerStack: {
    paddingHorizontal: 24,
    paddingBottom: 22,
    paddingTop: 4,
  },
  footerCompact: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 2,
  },
  eyebrow: {
    color: EYEBROW,
    fontSize: 12,
    fontWeight: '400',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  eyebrowStack: {
    fontSize: 10,
    letterSpacing: 1.3,
  },
  headline: {
    color: TEXT,
    fontSize: 43,
    fontWeight: '400',
    letterSpacing: -0.4,
    lineHeight: 47,
  },
  headlineStack: {
    fontSize: 30,
    lineHeight: 33,
  },
  pitch: {
    color: TEXT_MUTED,
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 27,
  },
  pitchStack: {
    fontSize: 14.5,
    lineHeight: 20.5,
  },
  benefits: {
    gap: 13,
    marginTop: 8,
    marginBottom: 10,
  },
  benefitsStack: {
    gap: 11,
    marginTop: 4,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  check: {
    backgroundColor: CHECK_FILL,
    borderWidth: 1,
    borderColor: CHECK_STROKE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkMark: {
    color: CHECK_MARK,
    fontWeight: '400',
    textAlign: 'center',
  },
  benefitTxt: {
    flex: 1,
    color: TEXT,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 21,
  },
  benefitTxtStack: {
    fontSize: 13,
    lineHeight: 17,
  },
  actions: {
    marginTop: 4,
    gap: 13,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  actionsStack: {
    gap: 9,
    marginTop: 4,
  },
  primaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: PRIMARY,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  primaryBtnSplit: {
    width: 244,
    minHeight: 52,
    borderRadius: 15,
    flexGrow: 0,
  },
  primaryBtnStack: {
    flexGrow: 1,
    minHeight: 47,
    borderRadius: 14,
  },
  primaryBtnWeb: Platform.OS === 'web' ? {
    backgroundImage: BRAND_GRADIENT,
  } : null,
  primaryTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '400',
  },
  primaryTxtStack: {
    fontSize: 14,
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.075)',
    flexShrink: 0,
  },
  secondaryBtnSplit: {
    width: 112,
    minHeight: 52,
    borderRadius: 15,
  },
  secondaryBtnStack: {
    minWidth: 85,
    minHeight: 47,
    borderRadius: 14,
  },
  secondaryTxt: {
    color: '#E6EBF5',
    fontSize: 16,
    fontWeight: '500',
  },
  secondaryTxtStack: {
    fontSize: 14,
  },
  btnDisabled: { opacity: 0.7 },
  reassurance: {
    color: TEXT_SOFT,
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'left',
    marginTop: 10,
    lineHeight: 17,
  },
  reassuranceStack: {
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 8,
  },
});
