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
import BrandMarkBusy from './BrandMarkBusy';
import OperationProgress from './OperationProgress';
import { useColors } from '../src/context/ThemeContext';

const NATIVE = Platform.OS !== 'web';
const NAVY = '#07274C';

/**
 * Full-screen busy state: lightens/dims the page, blocks interaction, and
 * bubbles the ProTop mark pieces in the center. Optional done/total shows a
 * progress bar under the logo. Reuse for imports, saves, and other long ops.
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
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      return undefined;
    }

    const anim = Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE,
    });
    anim.start();
    return () => anim.stop();
  }, [visible, fade]);

  if (!visible) return null;

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
          <BrandMarkBusy height={120} playing={visible} />

          <Text style={[styles.caption, { color: NAVY }]}>{label}</Text>
          {!!detail && !hasMeter ? (
            <Text style={[styles.detail, { color: colors.muted || '#5b6b82' }]}>{detail}</Text>
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
          ) : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Light frost so the full-colour mark stays vivid (no white mono needed).
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(236, 242, 248, 0.78)',
  },
  scrimWeb: {
    backdropFilter: 'blur(10px) saturate(0.92)',
    WebkitBackdropFilter: 'blur(10px) saturate(0.92)',
  },
  center: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    maxWidth: 420,
    width: '100%',
  },
  caption: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginTop: 4,
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
});
