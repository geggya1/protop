import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { immersiveHeroMuted, immersiveHeroText } from './homeGlass';
import { soft } from '../parentHome/softTheme';

export default function HomeHeroOverlay({
  greeting,
  subtitle,
  weather,
  onPress,
}) {
  const temp = weather?.temp != null ? `${weather.temp}°` : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Bakgrunnsbilde. Trykk for å bytte bilde."
      style={styles.wrap}
      testID="home-hero-overlay"
    >
      <View style={styles.copy}>
        {greeting ? <Text style={styles.hi}>{greeting}</Text> : null}
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {temp ? (
        <View style={styles.weather} testID="home-hero-weather">
          <Ionicons name={weather.icon || 'partly-sunny'} size={28} color="#FFE08A" />
          <Text style={styles.temp}>{temp}</Text>
          {weather.place ? <Text style={styles.place} numberOfLines={1}>{weather.place}</Text> : null}
          {weather.label ? <Text style={styles.cond} numberOfLines={2}>{weather.label}</Text> : null}
          {weather.hint ? <Text style={styles.cond} numberOfLines={2}>{weather.hint}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 4,
    paddingBottom: 8,
    minHeight: 72,
  },
  copy: { flex: 1, minWidth: 0, paddingRight: 6 },
  hi: {
    fontSize: 26,
    lineHeight: 30,
    color: immersiveHeroText,
    fontFamily: soft.display,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  sub: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 18,
    color: immersiveHeroMuted,
    fontFamily: soft.body,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  weather: { width: 100, alignItems: 'flex-end' },
  temp: {
    fontSize: 26,
    lineHeight: 30,
    color: immersiveHeroText,
    fontFamily: soft.display,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  place: {
    fontSize: 13,
    color: immersiveHeroMuted,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  cond: {
    fontSize: 12,
    color: immersiveHeroMuted,
    textAlign: 'right',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
