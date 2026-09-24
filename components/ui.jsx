import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { colors as baseColors, radius, space, useLayout } from '../src/theme';
import { useColors, useThemeMeta } from '../src/context/ThemeContext';
import { useHomeImmersive } from '../src/context/HomeImmersiveContext';
import ChildThemeBackdrop from './ChildThemeBackdrop';

export function Screen({ children, style }) {
  const themeColors = useColors();
  const { isChildTheme, theme } = useThemeMeta();
  const immersive = useHomeImmersive();
  const showPattern = isChildTheme && !!theme?.pattern && !immersive;
  return (
    <View style={[
      styles.screen,
      { backgroundColor: immersive ? 'transparent' : themeColors.bg },
      style,
    ]}
    >
      {showPattern ? <ChildThemeBackdrop /> : null}
      <View style={styles.screenContent}>{children}</View>
    </View>
  );
}

export function Card({ children, style }) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  return (
    <View style={[
      styles.card,
      isDesktop && styles.cardDesktop,
      { backgroundColor: colors.card, borderColor: colors.line },
      style,
    ]}
    >
      {children}
    </View>
  );
}

export function Title({ children, size = 20, style }) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const fontSize = isDesktop ? Math.min(size, 17) : size;
  return (
    <Text style={[styles.title, isDesktop && styles.titleDesktop, { fontSize, color: colors.ink }, style]}>
      {children}
    </Text>
  );
}

export function Mute({ children, style }) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  return <Text style={[styles.mute, isDesktop && styles.muteDesktop, { color: colors.muted }, style]}>{children}</Text>;
}

export function BigButton({ label, onPress, color, icon, disabled }) {
  const themeColors = useColors();
  const { isDesktop } = useLayout();
  const bg = color || themeColors.brand;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.bigBtn,
        isDesktop && styles.bigBtnDesktop,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon}
      <Text style={[styles.bigBtnTxt, isDesktop && styles.bigBtnTxtDesktop]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ProgressBar({ value = 0, total = 1, color }) {
  const themeColors = useColors();
  const fill = color || themeColors.brand;
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, total)) * 100)));
  return (
    <View style={[styles.barTrack, { backgroundColor: themeColors.brandSoft }]}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: fill }]} />
    </View>
  );
}

export function Loader() {
  const themeColors = useColors();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={themeColors.brand} />
    </View>
  );
}

export function ScrollBody({ children, pad = space.md }) {
  const { isDesktop } = useLayout();
  const gap = isDesktop ? 8 : space.md;
  const bottom = isDesktop ? 28 : 48;
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ padding: pad, paddingBottom: bottom, gap, flexGrow: 1 }}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      nestedScrollEnabled
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, height: '100%', backgroundColor: baseColors.bg },
  screenContent: { flex: 1, minHeight: 0, zIndex: 1, position: 'relative', overflow: 'visible', backgroundColor: 'transparent' },
  scroll: { flex: 1, minHeight: 0 },
  card: {
    backgroundColor: baseColors.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: baseColors.line,
  },
  cardDesktop: {
    padding: 10,
  },
  title: { fontWeight: '700', color: baseColors.ink },
  titleDesktop: { fontWeight: '600', letterSpacing: -0.2 },
  mute: { color: baseColors.muted, fontSize: 13, lineHeight: 19, fontWeight: '400' },
  muteDesktop: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  bigBtn: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
  },
  bigBtnDesktop: {
    minHeight: 40,
    paddingHorizontal: 14,
  },
  bigBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 18 },
  bigBtnTxtDesktop: { fontSize: 14, fontWeight: '600' },
  barTrack: { height: 12, backgroundColor: baseColors.brandSoft, borderRadius: 99, overflow: 'hidden' },
  barFill: { height: 12, borderRadius: 99 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
