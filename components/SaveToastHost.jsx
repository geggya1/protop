import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../src/theme';
import { runToastAction, subscribeSaveToast, toastDuration } from '../src/ui/saveToast';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* native */ }
}

/**
 * Liten bekreftelse nederst på skjermen. Den blir noen sekunder, så forsvinner den.
 * Nytt kall mens den vises, bytter teksten og starter tiden på nytt.
 * Har toasten en handling («Angre»), kan den trykkes til tiden er ute.
 */
export default function SaveToastHost() {
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const shift = useRef(new Animated.Value(14)).current;

  useEffect(() => subscribeSaveToast(setToast), []);

  useEffect(() => {
    if (!toast) return undefined;
    const native = Platform.OS !== 'web';
    opacity.setValue(0);
    shift.setValue(14);
    const intro = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: native }),
      Animated.timing(shift, { toValue: 0, duration: 180, useNativeDriver: native }),
    ]);
    intro.start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: native }),
        Animated.timing(shift, { toValue: 10, duration: 220, useNativeDriver: native }),
      ]).start(({ finished }) => {
        if (finished) setToast((current) => (current && current.id === toast.id ? null : current));
      });
    }, toastDuration(toast));
    return () => {
      clearTimeout(timer);
      intro.stop();
      opacity.stopAnimation();
      shift.stopAnimation();
    };
  }, [toast, opacity, shift]);

  if (!toast) return null;
  const failed = toast.kind === 'error';
  const action = toast.action && !toast.action.done ? toast.action : null;
  const undo = () => {
    runToastAction(toast);
    setToast((current) => (current && current.id === toast.id ? null : current));
  };

  const card = (
    <View pointerEvents={action ? 'box-none' : 'none'} style={styles.host} nativeID="save-toast-host">
      <Animated.View
        nativeID="save-toast"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.card, { opacity, transform: [{ translateY: shift }] }]}
      >
        <View style={[styles.check, failed && styles.fail]}>
          <Text style={[styles.checkMark, failed && styles.failMark]}>{failed ? '!' : '✓'}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{toast.title}</Text>
          {toast.detail ? (
            <Text style={styles.detail} numberOfLines={failed ? 3 : 2}>{toast.detail}</Text>
          ) : null}
        </View>
        {action ? (
          <TouchableOpacity
            onPress={undo}
            accessibilityRole="button"
            accessibilityLabel={`${action.label}: ${toast.title}`}
            nativeID="save-toast-action"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.actionBtn}
          >
            <Text style={styles.actionTxt}>{action.label}</Text>
          </TouchableOpacity>
        ) : null}
      </Animated.View>
    </View>
  );

  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined') {
    return createPortal(card, document.body);
  }
  return card;
}

const styles = StyleSheet.create({
  host: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    zIndex: 2000000,
    elevation: 24,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 420,
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.md || 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...Platform.select({
      web: { boxShadow: '0 10px 28px rgba(15, 23, 42, 0.16)' },
      default: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.16,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      },
    }),
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: colors.successInk,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '600',
  },
  fail: {
    backgroundColor: colors.dangerSoft,
  },
  failMark: {
    color: colors.dangerInk,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  detail: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  actionBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTxt: {
    color: colors.brandInk,
    fontSize: 14,
    fontWeight: '600',
  },
});
