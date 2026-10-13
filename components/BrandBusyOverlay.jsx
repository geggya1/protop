import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BrandLogo from './BrandLogo';
import OperationProgress from './OperationProgress';
import { useColors } from '../src/context/ThemeContext';

const NATIVE = Platform.OS !== 'web';

/**
 * Full-screen busy state: dims the page, blocks interaction, and dances the
 * ProTop mark in the center. Optional done/total shows a progress bar under
 * the logo. Reuse for imports, saves, and other long operations.
 */
export default function BrandBusyOverlay({
  visible,
  label = 'Jobber…',
  detail,
  done,
  total,
  testID = 'brand-busy-overlay',
}) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }

    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE,
    }).start();

    const dance = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 640,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 640,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVE,
        }),
      ]),
    );
    dance.start();
    return () => {
      dance.stop();
    };
  }, [visible, fade, pulse]);

  if (!visible) return null;

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.1],
  });
  const rotate = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['-6deg', '6deg'],
  });
  const lift = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [8, -14],
  });
  const halo = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.55],
  });
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1.22],
  });

  const hasMeter = Number(total) > 0;
  const progressLabel = hasMeter
    ? `${label} ${Math.min(Number(done) || 0, Number(total))} av ${Number(total)}`
    : label;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <Animated.View
        testID={testID}
        nativeID={testID}
        accessibilityViewIsModal
        accessibilityLabel={progressLabel}
        accessibilityLiveRegion="assertive"
        style={[styles.root, { opacity: fade }]}
      >
        <View
          style={[
            styles.scrim,
            Platform.OS === 'web' ? styles.scrimWeb : null,
          ]}
          pointerEvents="auto"
        />
        <View style={styles.center} pointerEvents="none">
          <View style={styles.stage}>
            <Animated.View
              style={[
                styles.halo,
                {
                  backgroundColor: colors.brandSoft || '#E5F6FE',
                  opacity: halo,
                  transform: [{ scale: haloScale }],
                },
              ]}
            />
            <Animated.View
              style={{
                transform: [
                  { translateY: lift },
                  { scale },
                  { rotate },
                ],
              }}
            >
              <BrandLogo variant="mark" height={96} accessible={false} />
            </Animated.View>
          </View>

          <Text style={[styles.caption, { color: colors.ink }]}>{label}</Text>
          {!!detail && !hasMeter ? (
            <Text style={[styles.detail, { color: colors.muted }]}>{detail}</Text>
          ) : null}

          {hasMeter ? (
            <View style={styles.meter}>
              <OperationProgress
                value={Number(done) || 0}
                total={Number(total) || 0}
                label={progressLabel}
                detail={detail}
                status="running"
                compact
              />
            </View>
          ) : (
            <View style={[styles.pulseDots, { backgroundColor: colors.brandSoft || '#E5F6FE' }]}>
              <PulseDots color={colors.brand || '#1099F4'} pulse={pulse} />
            </View>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

function PulseDots({ color, pulse }) {
  const a = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const b = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.35] });
  const c = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  return (
    <View style={styles.dots}>
      {[a, b, c].map((opacity, index) => (
        <Animated.View
          key={index}
          style={[styles.dot, { backgroundColor: color, opacity }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  scrimWeb: {
    backdropFilter: 'blur(7px) saturate(0.85)',
    WebkitBackdropFilter: 'blur(7px) saturate(0.85)',
  },
  center: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    maxWidth: 420,
    width: '100%',
  },
  stage: {
    width: 168,
    height: 168,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 999,
  },
  caption: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  detail: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: -4,
  },
  meter: {
    width: '100%',
    marginTop: 4,
  },
  pulseDots: {
    marginTop: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
});
