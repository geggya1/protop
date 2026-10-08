import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mapsUrl } from '../../src/utils/locationMaps';
import { nextMapPinIndex } from '../../src/anbud/noticePlace';
import { tenderMapDocument } from '../../src/anbud/tenderMapHtml';

export default function TenderMap({
  pins = [],
  selectedId = '',
  colors,
  onSelect,
  onPreview,
  onMark,
  busyId = '',
  missing = 0,
  mapHeight = 440,
  compact = false,
  note = '',
}) {
  const iframeRef = useRef(null);
  const indexRef = useRef(0);
  const [cursorId, setCursorId] = useState(selectedId);
  const pinKey = pins.map((row) => row.id).join(',');
  const kindKey = pins.map((row) => `${row.id}:${row.kind === 'aktuell' ? 'aktuell' : 'ny'}`).join(',');
  const html = useMemo(
    () => tenderMapDocument(pins, {
      brand: colors?.brand || '#3D6B8A',
      danger: colors?.danger || '#dc2626',
      compact,
    }),
    // Nåler synkes med postMessage. Nytt srcDoc laster kartet på nytt og flytter siden på mobil.
    [colors?.brand, colors?.danger, compact],
  );
  const found = pins.findIndex((row) => row.id === (cursorId || selectedId));
  if (found >= 0) indexRef.current = found;
  const index = found >= 0 ? found : nextMapPinIndex(pins.length, indexRef.current);
  const current = index >= 0 ? pins[index] : null;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    function onMessage(event) {
      const type = event?.data?.type;
      const id = event?.data?.tenderId;
      if (!id) return;
      if (type === 'preview') {
        setCursorId(id);
        onPreview?.(id);
      }
      if (type === 'open') onSelect?.(id);
      if (type === 'mark' && (event?.data?.decision === 'aktuell' || event?.data?.decision === 'forkastet')) {
        onMark?.(id, event.data.decision);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSelect, onPreview, onMark]);

  useEffect(() => {
    if (!selectedId) return;
    setCursorId(selectedId);
    showInMap(selectedId);
  }, [selectedId]);

  function showInMap(id) {
    iframeRef.current?.contentWindow?.postMessage({ type: 'show', id }, '*');
  }

  function syncMap(focusId = '') {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'sync',
      pins: pins.map((row) => ({
        id: row.id,
        title: row.title,
        buyer: row.buyer,
        deadline: row.deadline,
        source: row.source,
        label: row.label,
        lat: row.lat,
        lng: row.lng,
        kind: row.kind === 'aktuell' ? 'aktuell' : 'ny',
      })),
      busyId: busyId || '',
      focusId: focusId || '',
    }, '*');
  }

  useEffect(() => {
    const still = !cursorId || pins.some((row) => row.id === cursorId);
    const nextAt = still ? -1 : nextMapPinIndex(pins.length, indexRef.current);
    const focusId = nextAt >= 0 ? (pins[nextAt]?.id || '') : '';
    if (focusId && focusId !== cursorId) setCursorId(focusId);
    syncMap(focusId);
  }, [pinKey, kindKey, busyId]);

  function step(delta) {
    if (!pins.length) return;
    const next = pins[(index + delta + pins.length) % pins.length];
    setCursorId(next.id);
    showInMap(next.id);
    onPreview?.(next.id);
  }

  const count = pins.length;

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.head}>
        <Text style={[styles.h, { color: colors.ink }]}>Kart</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{count} nål{count === 1 ? '' : 'er'}</Text>
      </View>
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
      {note ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.brand, fontSize: 13 }}>{note}</Text>
      ) : null}
      {Platform.OS === 'web' ? (
        <View style={[styles.map, { height: mapHeight }]}>
          {React.createElement('iframe', {
            ref: iframeRef,
            title: 'Kart over nye og aktuelle treff',
            srcDoc: html,
            sandbox: 'allow-scripts allow-same-origin',
            style: { border: 0, width: '100%', height: '100%', borderRadius: 12 },
            onLoad: () => {
              syncMap();
              if (selectedId || cursorId) showInMap(selectedId || cursorId);
            },
          })}
        </View>
      ) : current ? (
        <TouchableOpacity
          onPress={() => Linking.openURL(mapsUrl({ lat: current.lat, lng: current.lng, label: current.label }))}
          accessibilityRole="button"
          style={[styles.open, { backgroundColor: colors.sunken }]}
        >
          <Ionicons name="map-outline" size={18} color={colors.brand} />
          <Text style={{ color: colors.ink }}>Åpne kart</Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ color: colors.muted }}>Ingen stedfestede treff å vise ennå.</Text>
      )}
      {current ? (
        <View style={[styles.bubble, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600' }}>
            {current.kind === 'aktuell' ? 'Aktuell' : 'Ny'} · {current.label}
          </Text>
          <View style={styles.decisions}>
            <TouchableOpacity
              onPress={() => onMark?.(current.id, 'aktuell')}
              accessibilityRole="button"
              accessibilityLabel={`Merk ${current.title} som aktuell`}
              accessibilityState={{ selected: current.kind === 'aktuell' }}
              style={[styles.markBtn, compact && styles.markBtnCompact, {
                backgroundColor: current.kind === 'aktuell' ? colors.brand : colors.card,
                borderColor: current.kind === 'aktuell' ? colors.brand : colors.line,
              }]}
            >
              <Text style={{ color: current.kind === 'aktuell' ? '#fff' : colors.ink, fontSize: compact ? 15 : 13, fontWeight: '600' }}>
                {busyId === current.id ? 'Henter …' : 'Aktuell'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onMark?.(current.id, 'forkastet')}
              accessibilityRole="button"
              accessibilityLabel={`Merk ${current.title} som uaktuell`}
              style={[styles.markBtn, compact && styles.markBtnCompact, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <Text style={{ color: colors.ink, fontSize: compact ? 15 : 13, fontWeight: '600' }}>Uaktuell</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => onSelect?.(current.id)} accessibilityRole="button">
            <Text style={{ color: colors.brand, fontWeight: '700' }} numberOfLines={compact ? 2 : undefined}>{current.title}</Text>
          </TouchableOpacity>
          {current.buyer ? <Text style={{ color: colors.ink, fontSize: 12 }}>{current.buyer}</Text> : null}
          {current.deadline ? <Text style={{ color: colors.muted, fontSize: 12 }}>Frist {current.deadline}</Text> : null}
          <View style={styles.nav}>
            <TouchableOpacity onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Forrige sted" style={[styles.navBtn, { backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink }}>Forrige</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{count ? `${index + 1} / ${count}` : '0 / 0'}</Text>
            <TouchableOpacity onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Neste sted" style={[styles.navBtn, { backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink }}>Neste</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => onSelect?.(current.id)} accessibilityRole="button" style={[styles.jump, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Åpne i listen</Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
  map: { height: 440, borderRadius: 12, overflow: 'hidden' },
  open: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 10, padding: 10 },
  bubble: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  navBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  decisions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  markBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  markBtnCompact: { minHeight: 44, paddingVertical: 12 },
  jump: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', marginTop: 4 },
});
