import React, { useEffect } from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mapsUrl } from '../../src/utils/locationMaps';
import { tenderMapDocument } from '../../src/anbud/tenderMapHtml';

export default function TenderMap({
  pins = [],
  selectedId = '',
  colors,
  onSelect,
  missing = 0,
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    function onMessage(event) {
      const id = event?.data?.tenderId;
      if (id) onSelect?.(id);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSelect]);

  const count = pins.length;
  const first = pins[0];
  const html = tenderMapDocument(pins, { selectedId, brand: colors?.brand || '#3D6B8A' });

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.head}>
        <Text style={[styles.h, { color: colors.ink }]}>Kart</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{count} nål{count === 1 ? '' : 'er'}</Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Nye og aktuelle treff. Sted leses fra kommune, fylke og kunngjøringstekst.
      </Text>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#64748b' }]} />
          <Text style={{ color: colors.ink, fontSize: 12 }}>Nye</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors.brand }]} />
          <Text style={{ color: colors.ink, fontSize: 12 }}>Aktuelle</Text>
        </View>
      </View>
      {Platform.OS === 'web' ? (
        <View style={styles.map}>
          {React.createElement('iframe', {
            title: 'Kart over nye og aktuelle treff',
            srcDoc: html,
            sandbox: 'allow-scripts allow-same-origin',
            style: { border: 0, width: '100%', height: '100%', borderRadius: 12 },
          })}
        </View>
      ) : first ? (
        <TouchableOpacity
          onPress={() => Linking.openURL(mapsUrl({ lat: first.lat, lng: first.lng, label: first.label }))}
          accessibilityRole="button"
          style={[styles.open, { backgroundColor: colors.sunken }]}
        >
          <Ionicons name="map-outline" size={18} color={colors.brand} />
          <Text style={{ color: colors.ink }}>Åpne kart med {count} treff</Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ color: colors.muted }}>Ingen stedfestede treff å vise ennå.</Text>
      )}
      {Platform.OS !== 'web' ? pins.slice(0, 12).map((row) => (
        <TouchableOpacity
          key={row.id}
          onPress={() => onSelect?.(row.id)}
          accessibilityRole="button"
          accessibilityLabel={`${row.title} i ${row.label}`}
        >
          <Text style={{ color: selectedId === row.id ? colors.brand : colors.ink, fontSize: 12 }} numberOfLines={1}>
            {row.kind === 'aktuell' ? 'Aktuell' : 'Ny'} · {row.label} · {row.title}
          </Text>
        </TouchableOpacity>
      )) : null}
      {missing ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {missing} treff mangler sted i kunngjøringen.
        </Text>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 11 }}>Kart: OpenStreetMap. Stedsøk: Kartverket og Photon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h: { fontSize: 16, fontWeight: '600' },
  legend: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  legendItem: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 99 },
  map: { height: 320, borderRadius: 12, overflow: 'hidden' },
  open: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 10, padding: 10 },
});
