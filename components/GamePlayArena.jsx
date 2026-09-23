/**
 * Visuelt spillområde — myk gradient-bakgrunn bak brettet.
 */
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { colors } from '../src/theme';

const THEMES = {
  default: { from: '#eef4ff', to: '#f8fafc', accent: colors.brandSoft },
  chess: { from: '#e8efe4', to: '#f5f7f2', accent: '#c5d4b8' },
  board: { from: '#dbeafe', to: '#eff6ff', accent: '#93c5fd' },
  cards: { from: '#ecfdf5', to: '#f0fdf4', accent: '#86efac' },
  night: { from: '#1e293b', to: '#0f172a', accent: '#334155' },
};

/**
 * @param {{ theme?: keyof typeof THEMES, children: React.ReactNode, style?: object }} props
 */
export default function GamePlayArena({ theme = 'default', children, style }) {
  const t = THEMES[theme] || THEMES.default;
  const webGradient = Platform.OS === 'web'
    ? {
      // @ts-ignore
      backgroundImage: `radial-gradient(ellipse at 50% 0%, ${t.accent} 0%, transparent 55%), linear-gradient(180deg, ${t.from} 0%, ${t.to} 100%)`,
    }
    : null;

  return (
    <View
      style={[
        styles.arena,
        { backgroundColor: t.from, borderColor: t.accent },
        webGradient,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  arena: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
});
