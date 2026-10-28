import React, { useEffect, useRef } from 'react';
import {
  Animated, Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../src/i18n';
import { useHelp } from '../src/context/HelpContext';
import HelpTarget from './HelpTarget';
import { useReducedMotion } from '../src/hooks/useReducedMotion';
import { autoLoopIterations } from '../src/hooks/reducedMotion';
import { useLayout } from '../src/theme';
import { touchHit } from '../src/ui/touchTarget';

const NATIVE_DRIVER = Platform.OS !== 'web';
const AMBER = '#d97706';
const AMBER_SOFT = '#fff7e6';
const AMBER_LINE = '#f5c776';

/**
 * Lightbulb — on-demand help for the current page.
 * `floating` is the overlay chip that sits under the profile photo (mobil/nettbrett).
 * `inline` sits in the desktop button row next to Varslinger, with a «Hjelp» label.
 * Pair either with `compact` for a smaller control.
 * Inline er 32 px høy; på berøringsskjerm ligger en gjennomsiktig trykkflate på 44 px rundt (UX-26).
 */
export default function HelpButton({
  compact = false,
  floating = false,
  inline = false,
  color = '#1a2744',
  borderColor = '#e2e8f0',
  backgroundColor = '#fff',
}) {
  const { t } = useI18n();
  const { hasHelp, moduleSeen, openModuleHelp, mode, moduleId } = useHelp();
  const pulse = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;
  // Redusert bevegelse: stå stille. Ellers stopper løkkene før fem sekunder (WCAG 2.2.2).
  const reduced = useReducedMotion();
  const { isTouch } = useLayout();

  useEffect(() => {
    const iterations = autoLoopIterations(1400, { reduced });
    if (!hasHelp || moduleSeen || mode || !iterations) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: NATIVE_DRIVER }),
      ]),
      { iterations },
    );
    loop.start();
    return () => loop.stop();
  }, [hasHelp, moduleSeen, mode, pulse, reduced]);

  const lively = floating && !compact;

  useEffect(() => {
    const iterations = autoLoopIterations(3600, { reduced });
    if (!lively || !hasHelp || !iterations) {
      bob.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1800, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(bob, { toValue: 0, duration: 1800, useNativeDriver: NATIVE_DRIVER }),
      ]),
      { iterations },
    );
    loop.start();
    return () => loop.stop();
  }, [lively, hasHelp, bob, reduced]);

  if (!hasHelp && !moduleId) return null;

  const label = t('moduleIntro.helpHint');

  if (inline) {
    const height = 32;
    // Med tekst er knappen bredere enn 44 px; da trengs bare høyden.
    const hit = touchHit(compact ? height : 44, height, { touch: isTouch, os: Platform.OS });
    return (
      <HelpTarget id="helpBtn">
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <TouchableOpacity
            onPress={openModuleHelp}
            style={[styles.inlineHit, hit.style]}
            hitSlop={hit.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID="help-bulb"
          >
            <View
              style={[
                styles.inline,
                {
                  height,
                  paddingHorizontal: compact ? 0 : 10,
                  width: compact ? height : undefined,
                  borderColor: moduleSeen ? borderColor : AMBER_LINE,
                  backgroundColor: moduleSeen ? backgroundColor : AMBER_SOFT,
                },
              ]}
            >
              <Ionicons name="bulb" size={17} color={AMBER} />
              {!compact ? (
                <Text style={[styles.inlineTxt, { color }]} numberOfLines={1}>
                  {t('moduleIntro.help')}
                </Text>
              ) : null}
              {!moduleSeen ? <View style={[styles.dot, styles.dotInline]} /> : null}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </HelpTarget>
    );
  }

  const size = floating ? (compact ? 34 : 42) : compact ? 32 : 36;
  const radius = floating || !compact ? size / 2 : 6;
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
              borderColor: floating ? AMBER_LINE : borderColor,
              backgroundColor: floating && !moduleSeen ? AMBER_SOFT : backgroundColor,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={label}
          testID="help-bulb"
        >
          <Ionicons
            name="bulb"
            size={floating ? 21 : compact ? 16 : 18}
            color={AMBER}
          />
          {!moduleSeen ? <View style={[styles.dot, floating && styles.dotFloating]} /> : null}
        </TouchableOpacity>
      </Animated.View>
    </HelpTarget>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  btnFloating: {
    borderWidth: 1.5,
    shadowColor: '#1a2744',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    position: 'relative',
  },
  inlineHit: { borderRadius: 999 },
  inlineTxt: { fontSize: 13, fontWeight: '500' },
  dot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#e11d48',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  dotFloating: {
    top: 5,
    right: 5,
  },
  dotInline: {
    top: -2,
    right: -2,
  },
});
