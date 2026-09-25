/**
 * Gevinst-/tapsfeiring for familiespill — stabil modal uten flikkering.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, TouchableOpacity, StyleSheet,
  Animated, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';

const NATIVE_DRIVER = Platform.OS !== 'web';
const CONFETTI = ['🎉', '⭐', '✨', '🏆', '🎊', '💫', '🌟', '🎈'];

function ConfettiBurst({ triggerKey, count = 16 }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [particles, setParticles] = useState([]);
  const startedFor = useRef(null);

  useEffect(() => {
    if (!triggerKey) {
      setParticles([]);
      startedFor.current = null;
      return undefined;
    }
    // Unngå å restarte konfetti for samme nøkkel (flikkering).
    if (startedFor.current === triggerKey) return undefined;
    startedFor.current = triggerKey;

    const next = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.35;
      const dist = 55 + Math.random() * Math.min(150, winW * 0.26);
      return {
        id: `${triggerKey}-${i}`,
        emoji: CONFETTI[i % CONFETTI.length],
        p: new Animated.Value(0),
        op: new Animated.Value(0),
        size: 18 + Math.round(Math.random() * 14),
        startX: winW / 2 + (Math.random() - 0.5) * 36,
        startY: winH * 0.38,
        endX: winW / 2 + Math.cos(angle) * dist,
        endY: winH * 0.38 + Math.sin(angle) * dist * 0.65 - 36 - Math.random() * 70,
        delay: i * 24 + Math.round(Math.random() * 30),
        dur: 850 + Math.round(Math.random() * 350),
        rot: new Animated.Value(0),
      };
    });
    setParticles(next);

    next.forEach((part) => {
      Animated.parallel([
        Animated.timing(part.op, {
          toValue: 1, duration: 110, delay: part.delay, useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(part.p, {
          toValue: 1, duration: part.dur, delay: part.delay, useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(part.rot, {
          toValue: 1, duration: part.dur, delay: part.delay, useNativeDriver: NATIVE_DRIVER,
        }),
      ]).start(() => {
        Animated.timing(part.op, {
          toValue: 0, duration: 260, useNativeDriver: NATIVE_DRIVER,
        }).start();
      });
    });

    const t = setTimeout(() => setParticles([]), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  if (!particles.length) return null;

  const layer = (
    <View pointerEvents="none" style={styles.layer}>
      {particles.map((part, idx) => {
        const translateX = part.p.interpolate({
          inputRange: [0, 1],
          outputRange: [part.startX, part.endX],
        });
        const translateY = part.p.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: [part.startY, part.startY - 44, part.endY],
        });
        const rotate = part.rot.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${200 + idx * 22}deg`],
        });
        return (
          <Animated.Text
            key={part.id}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              fontSize: part.size,
              opacity: part.op,
              transform: [{ translateX }, { translateY }, { rotate }],
            }}
          >
            {part.emoji}
          </Animated.Text>
        );
      })}
    </View>
  );

  if (Platform.OS === 'web') {
    return <View style={styles.webPortal} pointerEvents="none">{layer}</View>;
  }
  return layer;
}

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {string} [props.title]
 * @param {string} [props.subtitle]
 * @param {boolean} [props.draw] — uavgjort
 * @param {'win'|'lose'|'draw'} [props.outcome]
 * @param {string} [props.actionLabel]
 * @param {() => void} [props.onAction]
 * @param {() => void} props.onClose
 * @param {string|number} [props.triggerKey]
 */
export default function GameWinCelebration({
  visible,
  title = 'Gratulerer!',
  subtitle = '',
  draw = false,
  outcome,
  actionLabel,
  onAction,
  onClose,
  triggerKey,
}) {
  const scale = useRef(new Animated.Value(0.86)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);
  const shownKey = useRef(null);

  const resolvedOutcome = outcome || (draw ? 'draw' : 'win');
  const showConfetti = resolvedOutcome === 'win';

  const burstKey = useMemo(() => {
    if (!visible) return null;
    if (triggerKey != null && triggerKey !== '') return String(triggerKey);
    return 'celebration';
  }, [visible, triggerKey]);

  useEffect(() => {
    if (!visible) {
      animating.current = false;
      shownKey.current = null;
      return undefined;
    }
    // Kjør åpningsanimasjon kun én gang per triggerKey.
    if (shownKey.current === burstKey) return undefined;
    shownKey.current = burstKey;
    if (animating.current) return undefined;
    animating.current = true;
    scale.setValue(0.86);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1, friction: 7, tension: 70, useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.timing(opacity, {
        toValue: 1, duration: 180, useNativeDriver: NATIVE_DRIVER,
      }),
    ]).start(() => {
      animating.current = false;
    });
    return undefined;
  }, [visible, burstKey, scale, opacity]);

  if (!visible) return null;

  const hero = resolvedOutcome === 'win' ? '🏆' : resolvedOutcome === 'lose' ? '💫' : '🤝';
  const borderColor = resolvedOutcome === 'win'
    ? colors.brandSoft
    : resolvedOutcome === 'lose'
      ? '#fecaca'
      : colors.line;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {showConfetti ? <ConfettiBurst triggerKey={burstKey} /> : null}
        <Animated.View
          style={[styles.card, { borderColor, opacity, transform: [{ scale }] }]}
          onStartShouldSetResponder={() => true}
        >
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Lukk">
            <Ionicons name="close" size={22} color="#334155" />
          </TouchableOpacity>
          <Text style={styles.heroEmoji}>{hero}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {actionLabel && onAction ? (
            <TouchableOpacity
              style={styles.action}
              onPress={() => { onAction(); onClose?.(); }}
              accessibilityRole="button"
            >
              <Text style={styles.actionTxt}>{actionLabel}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryTxt}>Fortsett</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/**
 * Vis feiring én gang per stabile nøkkel. Ignorerer støyende nøkkelendringer
 * mens samme runde fortsatt er ferdig (f.eks. Firestore updatedAt).
 */
export function useGameCelebration(active, key) {
  const [payload, setPayload] = useState(null);
  const seen = useRef(null);
  const closedFor = useRef(null);

  useEffect(() => {
    if (!active || !key) return;
    if (seen.current === key) return;
    if (closedFor.current === key) return;
    // Hvis vi allerede feiret en «base»-nøkkel (uten støy-suffix), ikke feire på nytt.
    if (seen.current && typeof key === 'string' && typeof seen.current === 'string') {
      const baseSeen = seen.current.split('|')[0];
      const baseNext = key.split('|')[0];
      if (baseSeen && baseSeen === baseNext) return;
    }
    seen.current = key;
    closedFor.current = null;
    setPayload({ key, visible: true });
  }, [active, key]);

  const close = () => {
    closedFor.current = payload?.key || key || closedFor.current;
    setPayload((p) => (p ? { ...p, visible: false } : null));
  };

  return {
    // Hold modal åpen selv om nøkkelen får støy-suffix — ikke knytt synlighet til eksakt key-match.
    celebrationVisible: !!(payload?.visible && active),
    celebrationKey: payload?.key,
    closeCelebration: close,
    resetCelebrationSeen: () => {
      seen.current = null;
      closedFor.current = null;
      setPayload(null);
    },
  };
}

/** Stabil feiringsnøkkel uten Firestore-tidsstempler. */
export function celebrationRoundKey(parts) {
  return (parts || []).filter((p) => p != null && p !== '').join('-');
}

const styles = StyleSheet.create({
  webPortal: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    left: 0, top: 0, right: 0, bottom: 0,
    zIndex: 9998,
    // @ts-ignore
    pointerEvents: 'none',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  heroEmoji: { fontSize: 64, marginBottom: 8 },
  title: {
    fontSize: 26,
    fontWeight: '400',
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    fontWeight: '500',
  },
  action: {
    marginTop: 20,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 160,
    alignItems: 'center',
  },
  actionTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
  secondary: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  secondaryTxt: { color: colors.brand, fontWeight: '400', fontSize: 15 },
});
