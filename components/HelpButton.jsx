import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../src/i18n';
import { useHelp } from '../src/context/HelpContext';
import HelpTarget from './HelpTarget';

const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Lightbulb — on-demand help for the current page.
 * `floating` is the phone placement: a round chip under the title-right
 * action (e.g. «Ny hendelse»), so it stays clear of page toolbars.
 */
export default function HelpButton({
  compact = false,
  floating = false,
  color = '#1a2744',
  borderColor = '#e2e8f0',
  backgroundColor = '#fff',
}) {
  const { t } = useI18n();
  const { hasHelp, moduleSeen, openModuleHelp, mode, moduleId } = useHelp();
  const pulse = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasHelp || moduleSeen || mode) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasHelp, moduleSeen, mode, pulse]);

  useEffect(() => {
    if (!floating || !hasHelp) {
      bob.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1800, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(bob, { toValue: 0, duration: 1800, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [floating, hasHelp, bob]);

  if (!hasHelp && !moduleId) return null;

  const size = floating ? 40 : compact ? 32 : 36;
  const radius = floating ? size / 2 : compact ? 6 : size / 2;
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });

  return (
    <HelpTarget id="helpBtn">
      <Animated.View style={{ transform: [{ translateY }, { scale: pulse }] }}>
        <TouchableOpacity
          onPress={openModuleHelp}
          style={[
            styles.btn,
            floating && styles.btnFloating,
            {
              width: size,
              height: size,
              borderRadius: radius,
              borderColor,
              backgroundColor,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('moduleIntro.helpHint')}
        >
          <Ionicons
            name={moduleSeen ? 'bulb-outline' : 'bulb'}
            size={floating ? 20 : compact ? 16 : 18}
            color={moduleSeen ? color : '#d97706'}
          />
          {!moduleSeen ? <View style={[styles.dot, floating && styles.dotFloating]} /> : null}
        </TouchableOpacity>
      </Animated.View>
    </HelpTarget>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  btnFloating: {
    borderWidth: 0,
    shadowColor: '#1a2744',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#d97706',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  dotFloating: {
    top: 6,
    right: 6,
  },
});
