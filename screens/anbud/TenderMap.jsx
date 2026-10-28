import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mapsUrl } from '../../src/utils/locationMaps';
import { MAP_FRAME_SANDBOX } from '../../src/utils/mapFrame';
import { nextMapPinIndex } from '../../src/anbud/noticePlace';
import { tenderMapDocument } from '../../src/anbud/tenderMapHtml';
import { dateText } from '../../src/format/nb';

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
  followId = '',
  followAt = 0,
  view = 'nye',
  showMark = true,
  openLabel = 'Åpne i listen',
  kindLabel = '',
  legendLabel = '',
  mapTitle = 'Kart over nye og aktuelle treff',
  showHeading = true,
  requireSelection = false,
  brief = false,
  onExpand,
  legendItems = null,
  coveragePalette = false,
}) {
  const iframeRef = useRef(null);
  const indexRef = useRef(0);
  const [cursorId, setCursorId] = useState(selectedId);
  const pinKey = pins.map((row) => `${row.id}:${row.coverage || ''}`).join(',');
  const kindKey = pins.map((row) => `${row.id}:${row.kind || 'ny'}`).join(',');
  const html = useMemo(
    () => tenderMapDocument(pins, {
      brand: colors?.brand || '#3D6B8A',
      danger: colors?.danger || '#dc2626',
      compact,
      showMark,
      openLabel,
      kindLabel,
      coveragePalette,
    }),
    // Nåler synkes med postMessage. Nytt srcDoc laster kartet på nytt og flytter siden på mobil.
    [colors?.brand, colors?.danger, compact, showMark, openLabel, kindLabel, coveragePalette],
  );
  const found = pins.findIndex((row) => row.id === (cursorId || selectedId));
  if (found >= 0) indexRef.current = found;
  const index = found >= 0 ? found : nextMapPinIndex(pins.length, indexRef.current);
  const current = index >= 0 ? pins[index] : null;
  const showCurrent = current && (!requireSelection || found >= 0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    function onMessage(event) {
      // Bare meldinger fra vårt eget kart (iframen har ikke samme opphav som appen).
      if (iframeRef.current && event?.source !== iframeRef.current.contentWindow) return;
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

  function showInMap(id, { silent = false } = {}) {
    iframeRef.current?.contentWindow?.postMessage({ type: 'show', id, silent }, '*');
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
        coverage: row.coverage === 'land' ? 'land' : '',
        kind: row.kind === 'aktuell' || row.kind === 'uaktuell' ? row.kind : 'ny',
        placeKind: row.placeKind === 'hele' || row.placeKind === 'miss' ? row.placeKind : 'point',
        mapNo: Number(row.mapNo) > 0 ? Number(row.mapNo) : 0,
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

  useEffect(() => {
    if (!followId) return;
    setCursorId(followId);
    showInMap(followId, { silent: true });
  }, [followId, followAt]);

  function step(delta) {
    if (!pins.length) return;
    const next = pins[(index + delta + pins.length) % pins.length];
    setCursorId(next.id);
    showInMap(next.id);
    onPreview?.(next.id);
  }

  const count = pins.length;
  const national = pins.filter((row) => row.coverage === 'land').length;
  const placed = count - national;
  const legend = legendItems?.length
    ? legendItems
    : legendLabel
    ? [{ label: legendLabel, color: colors.brand }]
    : view === 'aktuelle'
      ? [{ label: 'Aktuelle', color: colors.brand }]
      : view === 'uaktuelle'
        ? [{ label: 'Uaktuelle', color: colors.danger || '#dc2626' }]
        : view === 'nye'
          ? [{ label: 'Nye', color: '#64748b' }]
          : [];
  const emptyMap = legendLabel
    ? 'Ingen steder å vise på kartet.'
    : view === 'nye' || view === 'aktuelle' || view === 'uaktuelle'
      ? 'Ingen treff å vise på kartet i denne visningen.'
      : 'Kartet viser Nye, Aktuelle og Uaktuelle.';
  const kindText = kindLabel
    || (current?.kind === 'aktuell' ? 'Aktuell' : current?.kind === 'uaktuell' ? 'Uaktuell' : 'Ny');
  const currentNo = Number(current?.mapNo) > 0 ? `${current.mapNo} · ` : '';

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {showHeading ? (
        <View style={styles.head}>
          <Text style={[styles.h, { color: colors.ink }]}>Kart</Text>
          <View style={styles.headTools}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {`${placed} nål${placed === 1 ? '' : 'er'}${national ? ` · ${national} hele landet` : ''}`}
            </Text>
            {onExpand ? (
              <TouchableOpacity
                onPress={onExpand}
                accessibilityRole="button"
                accessibilityLabel="Større kart. Dra inn fra høyre marg, eller trykk her."
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.expand}
              >
                <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 13 }}>Større</Text>
                <Ionicons name="expand-outline" size={14} color={colors.brand} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {`${placed} nål${placed === 1 ? '' : 'er'}${national ? ` · ${national} hele landet` : ''}`}
        </Text>
      )}
      {legend.length ? (
        <View style={styles.legend}>
          {legend.map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={{ color: colors.ink, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{item.label}</Text>
            </View>
          ))}
          {national && !legendItems?.length ? (
            <View style={styles.legendItem}>
              <View style={[styles.landSwatch, { backgroundColor: colors.brand, borderColor: colors.brand }]} />
              <Text style={{ color: colors.ink, fontSize: 12 }}>Hele Norge</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 13 }}>{emptyMap}</Text>
      )}
      {note ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.brand, fontSize: 13 }}>{note}</Text>
      ) : null}
      {!count && legend.length ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>{emptyMap}</Text>
      ) : null}
      {Platform.OS === 'web' ? (
        <View style={[styles.map, { height: mapHeight }]}>
          {React.createElement('iframe', {
            ref: iframeRef,
            title: mapTitle,
            srcDoc: html,
            // Samme opphav, ellers sender nettleseren ingen Referer og OpenStreetMap blokkerer flisene.
            sandbox: MAP_FRAME_SANDBOX,
            style: { border: 0, width: '100%', height: '100%', borderRadius: 12 },
            onLoad: () => {
              syncMap();
              if (selectedId || cursorId) showInMap(selectedId || cursorId);
            },
          })}
        </View>
      ) : current && current.coverage !== 'land' ? (
        <TouchableOpacity
          onPress={() => Linking.openURL(mapsUrl({ lat: current.lat, lng: current.lng, label: current.label }))}
          accessibilityRole="button"
          style={[styles.open, { backgroundColor: colors.sunken }]}
        >
          <Ionicons name="map-outline" size={18} color={colors.brand} />
          <Text style={{ color: colors.ink }}>Åpne kart</Text>
        </TouchableOpacity>
      ) : current ? (
        <Text style={{ color: colors.ink }}>Ikke stedbunden · gjelder hele Norge</Text>
      ) : (
        <Text style={{ color: colors.muted }}>Ingen stedfestede treff å vise ennå.</Text>
      )}
      {!brief && showCurrent ? (
        <View style={[styles.bubble, {
          borderColor: current.id === (cursorId || selectedId) ? colors.brand : colors.line,
          backgroundColor: current.id === (cursorId || selectedId) ? colors.brandSoft : colors.sunken,
          borderWidth: current.id === (cursorId || selectedId) ? 2 : 1,
        }]}>
          <Text style={{ color: colors.brand, fontSize: 12, fontWeight: '700' }}>
            {currentNo}{kindText} · {current.coverage === 'land' ? 'Hele Norge · ikke stedbunden' : current.label}
          </Text>
          {showMark ? <View style={styles.decisions}>
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
          </View> : null}
          <TouchableOpacity onPress={() => onSelect?.(current.id)} accessibilityRole="button">
            <Text style={{ color: colors.brand, fontWeight: '700' }} numberOfLines={compact ? 2 : undefined}>{current.title}</Text>
          </TouchableOpacity>
          {current.buyer ? <Text style={{ color: colors.ink, fontSize: 12 }}>{current.buyer}</Text> : null}
          {current.deadline ? <Text style={{ color: colors.muted, fontSize: 12 }}>Frist {dateText(current.deadline)}</Text> : null}
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
            <Text style={{ color: '#fff', fontWeight: '600' }}>{openLabel}</Text>
          </TouchableOpacity>
        </View>
      ) : !brief && requireSelection ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {selectedId
            ? 'Oppdraget er valgt i listen, men er ikke plassert på kartet.'
            : 'Trykk et oppdrag i listen, eller en nål på kartet. Samme nummer lyses opp begge steder.'}
        </Text>
      ) : null}
      {missing ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {missing} treff mangler sted i kunngjøringen.
        </Text>
      ) : null}
      {brief ? null : (
        <Text style={{ color: colors.muted, fontSize: 11 }}>Kart: OpenStreetMap. Stedsøk: Kartverket og Photon.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headTools: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  expand: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  h: { fontSize: 16, fontWeight: '600' },
  legend: { flexDirection: 'row', flexWrap: 'nowrap', gap: 10, alignItems: 'center' },
  legendItem: { flexDirection: 'row', gap: 5, alignItems: 'center', flexShrink: 1, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 99 },
  landSwatch: { width: 14, height: 10, borderRadius: 2, borderWidth: 1, opacity: 0.45 },
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
