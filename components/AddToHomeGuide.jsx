import React, { useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Platform, Image, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import {
  APP_INSTALL,
  detectMobileWebPlatform,
  getInstallGuide,
  markAddHomeSeen,
} from '../src/utils/addToHome';
import { APP_LAUNCH_PATH, markPreferApp } from '../src/utils/preferApp';

function StepLine({ index, parts }) {
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepNum}>{index}.</Text>
      <View style={styles.stepParts}>
        {parts.map((part, i) => {
          if (part.icon) {
            return (
              <View key={`i-${i}`} style={styles.inlineChip}>
                <Ionicons name={part.icon} size={14} color={colors.ink} />
              </View>
            );
          }
          return (
            <Text key={`t-${i}`} style={styles.stepTxt}>
              {part.text}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Smartplan-style install sheet: dimmed screen + bottom card with
 * app identity and numbered steps (iOS / Android variants).
 */
export default function AddToHomeGuide({ visible, onClose }) {
  const platform = useMemo(() => detectMobileWebPlatform(), []);
  const guide = useMemo(() => getInstallGuide(platform), [platform]);
  const fade = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    if (!visible) return undefined;
    markAddHomeSeen();
    markPreferApp();
    // Pin URL so iOS «Legg til på Hjem-skjerm» opens the app, not marketing.
    try {
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        const next = `${APP_LAUNCH_PATH}${window.location.search || ''}${window.location.hash || ''}`;
        window.history.replaceState(window.history.state, '', next);
      }
    } catch { /* ignore */ }
    fade.setValue(0);
    cardY.setValue(28);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.timing(cardY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
    return undefined;
  }, [visible, fade, cardY]);

  if (Platform.OS !== 'web') return null;
  if (!visible) return null;

  const close = () => onClose?.();
  const host = typeof window !== 'undefined'
    ? (window.location?.host || APP_INSTALL.host)
    : APP_INSTALL.host;

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />

        <Animated.View style={[styles.sheet, { transform: [{ translateY: cardY }] }]}>
          <View style={styles.head}>
            <Text style={styles.title}>{guide.title}</Text>
            <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel="Lukk" style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.appCard}>
            <Image
              source={{ uri: APP_INSTALL.iconSrc }}
              style={styles.appIcon}
              accessibilityIgnoresInvertColors
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.appName}>{APP_INSTALL.name}</Text>
              <Text style={styles.appHost}>{host}</Text>
            </View>
          </View>

          <View style={styles.steps}>
            {guide.steps.map((step, idx) => (
              <StepLine key={step.id} index={idx + 1} parts={step.parts} />
            ))}
          </View>

          {guide.footnote ? (
            <Text style={styles.footnote}>{guide.footnote}</Text>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    marginHorizontal: 12,
    marginBottom: 16,
    backgroundColor: colors.card,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 20,
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '400',
    color: colors.ink,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  appCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  appIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  appName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '400',
  },
  appHost: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },
  steps: {
    gap: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  stepNum: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.ink,
    lineHeight: 24,
    minWidth: 22,
    marginTop: 1,
  },
  stepParts: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 4,
    rowGap: 6,
  },
  stepTxt: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.ink,
    lineHeight: 24,
  },
  inlineChip: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footnote: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '400',
    color: colors.muted,
    lineHeight: 17,
  },
});
