/**
 * Flisene øverst på Min side: ett område per flis (Gjøremål, Timer, Fravær, Utlegg, Kjørebok,
 * Innstillinger) med farge og ikon fra ANSATT_AREAS, tallet som betyr mest, og en stolpe der
 * det gir mening. Hele flisen er en knapp. Ingen hooks utover bredden, så den kan rendres i tester.
 */
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tint } from '../../src/employees/ansattAreas.js';
import { BREAKPOINTS } from '../../src/ui/layout';
import { elevation, radius, space, type } from '../../src/ui/tokens';

const lift = Platform.OS === 'web' ? elevation[1].web : elevation[1].native;

function Tile({ tile, colors, basis }) {
  return (
    <Pressable
      nativeID={`ansatt-tile-${tile.id}`}
      onPress={tile.onPress}
      accessibilityRole="button"
      accessibilityLabel={[tile.label, tile.value, tile.caption].filter(Boolean).join(', ')}
      style={({ hovered, pressed }) => [
        styles.tile,
        lift,
        basis ? { flexBasis: basis } : null,
        {
          backgroundColor: colors.card,
          borderColor: hovered ? tile.color : colors.line,
          transform: pressed ? [{ scale: 0.98 }] : (hovered && Platform.OS === 'web' ? [{ translateY: -2 }] : undefined),
        },
      ]}
    >
      <View style={[styles.wash, { backgroundColor: tint(tile.color, 0.1) }]} />
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: tile.color }]}>
          <Ionicons name={tile.icon} size={18} color="#fff" />
        </View>
        {tile.alert ? <View style={[styles.alertDot, { backgroundColor: colors.danger, borderColor: colors.card }]} /> : null}
        <Ionicons name="arrow-forward" size={16} color={tile.color} style={styles.arrow} />
      </View>
      <Text style={[type.label, { color: colors.ink }]} numberOfLines={1}>{tile.label}</Text>
      {tile.value ? <Text style={[styles.value, { color: colors.ink }]} numberOfLines={1}>{tile.value}</Text> : null}
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={2}>{tile.caption}</Text>
      {tile.progress != null ? (
        <View style={[styles.track, { backgroundColor: tint(tile.color, 0.15) }]}>
          <View style={[styles.fill, { width: `${Math.round(tile.progress * 100)}%`, backgroundColor: tile.color }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

export default function AnsattTiles({ tiles = [], colors }) {
  const [width, setWidth] = useState(0);
  if (!tiles.length) return null;
  // Så mange i bredden som får plass: 2 på mobil, 3 på nettbrett, alle (opptil 6) på PC.
  const perRow = !width ? tiles.length
    : width < BREAKPOINTS.tablet ? 2
      : width < BREAKPOINTS.desktop ? 3
        : Math.min(tiles.length, 6);
  const basis = `${(100 / perRow) - 2}%`;
  return (
    <View nativeID="ansatt-tiles" style={styles.row} onLayout={(ev) => setWidth(ev.nativeEvent.layout.width)}>
      {tiles.map((tile) => <Tile key={tile.id} tile={tile} colors={colors} basis={basis} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, width: '100%' },
  tile: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: radius.sheet,
    padding: space.md,
    gap: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  wash: { position: 'absolute', width: 140, height: 140, borderRadius: 70, right: -50, top: -60 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  alertDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginLeft: -8, marginTop: -24 },
  arrow: { marginLeft: 'auto' },
  value: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3 },
  track: { height: 5, borderRadius: radius.pill, overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', borderRadius: radius.pill },
});
