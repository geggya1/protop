import React, { useEffect, useRef } from 'react';
import {
  Animated, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import { labelForEventType } from '../src/utils/inAppNotifications';

const AUTO_DISMISS_MS = 8000;

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}

/**
 * Large centered popup for a single notification.
 * Tap body / "Åpne" to navigate; X or backdrop to dismiss.
 */
function PopupCard({ toast, onPress, onDismiss }) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const native = Platform.OS !== 'web';
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: native, speed: 18, bounciness: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: native }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(scale, { toValue: 0.96, duration: 160, useNativeDriver: native }),
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: native }),
      ]).start(({ finished }) => {
        if (finished) onDismiss?.(toast.id);
      });
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [toast.id, scale, opacity, onDismiss]);

  const kind = labelForEventType(toast.eventType);

  return (
    <Animated.View
      style={[styles.cardWrap, { opacity, transform: [{ scale }] }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Pressable
        onPress={() => onPress?.(toast)}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.iconWrap}>
          <Ionicons name={toast.icon || 'notifications'} size={28} color={colors.brand} />
        </View>
        <Text style={styles.kicker}>{kind}</Text>
        <Text style={styles.title} numberOfLines={2}>{toast.title}</Text>
        {toast.body ? (
          <Text style={styles.body} numberOfLines={4}>{toast.body}</Text>
        ) : null}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => onDismiss?.(toast.id)}
            style={styles.secondaryBtn}
            accessibilityLabel="Lukk varsel"
          >
            <Text style={styles.secondaryTxt}>Lukk</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onPress?.(toast)}
            style={styles.primaryBtn}
            accessibilityLabel="Åpne varsel"
          >
            <Text style={styles.primaryTxt}>Åpne</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => onDismiss?.(toast.id)}
          hitSlop={12}
          accessibilityLabel="Lukk"
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={20} color={colors.muted} />
        </TouchableOpacity>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Host for large in-app notification popups.
 * Invites use InviteRespondOverlay; everything else pops here while the app is open.
 * Web: portal to document.body so ChatDock / shell stacking cannot hide it.
 */
export default function InAppNotificationToast({ toasts = [], onPress, onDismiss }) {
  if (!toasts?.length) return null;

  const latest = toasts[toasts.length - 1];
  const queue = Math.max(0, toasts.length - 1);

  const body = (
    <View pointerEvents="box-none" style={styles.host}>
      <Pressable
        style={styles.backdrop}
        onPress={() => onDismiss?.(latest.id)}
        accessibilityLabel="Lukk varsel"
      />
      <PopupCard
        toast={latest}
        onPress={onPress}
        onDismiss={onDismiss}
      />
      {queue > 0 ? (
        <Text style={styles.queueHint}>{queue} flere venter</Text>
      ) : null}
    </View>
  );

  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined') {
    return createPortal(body, document.body);
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={() => onDismiss?.(latest.id)}
    >
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 2147483000,
    elevation: 2147483000,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  cardWrap: {
    width: '100%',
    maxWidth: 420,
    zIndex: 1,
  },
  card: {
    position: 'relative',
    backgroundColor: colors.card,
    borderRadius: radius.lg || 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 22,
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 24px 48px rgba(15, 23, 42, 0.28)',
      },
      default: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.28,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 16,
      },
    }),
  },
  cardPressed: {
    opacity: 0.96,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.brand,
    marginBottom: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 26,
  },
  body: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
  },
  actions: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  secondaryTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
  },
  primaryTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
  },
  queueHint: {
    marginTop: 14,
    zIndex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
