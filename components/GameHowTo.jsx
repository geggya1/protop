/**
 * Kollapsbar spillveiledning — «Slik går du frem».
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * @param {{ title?: string, steps?: string[], defaultOpen?: boolean, simpleUi?: boolean }} props
 */
export default function GameHowTo({
  title = 'Slik går du frem',
  steps = [],
  defaultOpen = false,
  simpleUi = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!steps?.length) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View style={[styles.wrap, simpleUi && styles.wrapSimple]}>
      <TouchableOpacity
        style={styles.head}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
      >
        <View style={styles.headIcon}>
          <Ionicons name="help-circle" size={simpleUi ? 26 : 22} color={colors.brand} />
        </View>
        <Text style={[styles.headTxt, simpleUi && styles.headTxtSimple]} numberOfLines={2}>
          {title}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.muted}
        />
      </TouchableOpacity>
      {open ? (
        <View style={styles.body}>
          {steps.map((step, i) => (
            <View key={`${i}-${step.slice(0, 12)}`} style={styles.stepRow}>
              <View style={[styles.badge, simpleUi && styles.badgeSimple]}>
                <Text style={[styles.badgeTxt, simpleUi && styles.badgeTxtSimple]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepTxt, simpleUi && styles.stepTxtSimple]}>{step}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
    overflow: 'hidden',
  },
  wrapSimple: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.brandSoft,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  headIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTxt: {
    flex: 1,
    fontWeight: '400',
    fontSize: 14,
    color: colors.ink,
  },
  headTxtSimple: { fontSize: 17 },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 12,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  badgeSimple: { width: 28, height: 28, borderRadius: 14 },
  badgeTxt: { color: '#fff', fontWeight: '400', fontSize: 12 },
  badgeTxtSimple: { fontSize: 14 },
  stepTxt: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  stepTxtSimple: { fontSize: 16, lineHeight: 23 },
});
