import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Platform, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pickPraise } from '../../src/utils/leksehjelp/pedagogy';

const NATIVE = Platform.OS !== 'web';

/** Lett feiring når barnet treffer — growth-mindset ros (innsats/metode). */
export default function TutorPraise({
  visible,
  message,
  seed = 0,
  tone = 'success', // success | progress
}) {
  const scale = useRef(new Animated.Value(0.86)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(0.86);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 280, useNativeDriver: NATIVE,
      }),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: 220,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: NATIVE,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 160,
          useNativeDriver: NATIVE,
        }),
      ]),
    ]).start();
  }, [visible, seed, opacity, scale]);

  if (!visible) return null;

  const bg = tone === 'progress' ? '#fff7ed' : '#ecfdf5';
  const border = tone === 'progress' ? '#fdba74' : '#86efac';
  const ink = tone === 'progress' ? '#9a3412' : '#166534';
  const icon = tone === 'progress' ? 'sparkles-outline' : 'star';

  return (
    <Animated.View
      style={[
        styles.wrap,
        { backgroundColor: bg, borderColor: border, opacity, transform: [{ scale }] },
      ]}
      accessibilityRole="summary"
    >
      <View style={[styles.iconWrap, { backgroundColor: border }]}>
        <Ionicons name={icon} size={18} color={ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: ink }]}>
          {tone === 'progress' ? 'Fremgang!' : 'Mestring!'}
        </Text>
        <Text style={styles.body}>{message || pickPraise(seed)}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontWeight: '400', fontSize: 14, marginBottom: 2 },
  body: { fontWeight: '400', fontSize: 13, color: '#1a2744', lineHeight: 18 },
});
