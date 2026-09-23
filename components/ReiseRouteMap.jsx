/**
 * Reise-rute på ekte SVG-verdenskart (samme landflater som Skrapekart).
 * Auto-zoomer til destinasjonene, tegner A→B→C og lenker ut til kart-app.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Platform, Animated, TouchableOpacity, Linking,
} from 'react-native';
import Svg, {
  Path, Circle, Defs, LinearGradient, Stop, Rect, Text as SvgText,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {
  WORLD_MAP_PATHS, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT, WORLD_MAP_VIEWBOX,
} from '../src/utils/worldMapPaths';
import { worldRouteLayout, routeMapsUrl } from '../src/utils/reiseplanleggerLogic';

function routePath(markers) {
  if (!markers.length) return '';
  if (markers.length === 1) return `M ${markers[0].x} ${markers[0].y}`;
  let d = `M ${markers[0].x} ${markers[0].y}`;
  for (let i = 1; i < markers.length; i += 1) {
    const prev = markers[i - 1];
    const cur = markers[i];
    const cx = (prev.x + cur.x) / 2;
    const cy = Math.min(prev.y, cur.y) - Math.max(8, Math.abs(cur.x - prev.x) * 0.08);
    d += ` Q ${cx} ${cy}, ${cur.x} ${cur.y}`;
  }
  return d;
}

export default function ReiseRouteMap({
  points = [],
  height = 200,
  accent = '#0d9488',
}) {
  const layout = useMemo(
    () => worldRouteLayout(points, {
      width: WORLD_MAP_WIDTH,
      height: WORLD_MAP_HEIGHT,
      aspect: 1.8,
    }),
    [points],
  );
  const markers = layout.markers;
  const routeD = useMemo(() => {
    const geo = markers.filter((m) => m.hasCoords);
    if (geo.length >= 2) return routePath(geo);
    if (markers.length >= 2) return routePath(markers);
    return '';
  }, [markers]);
  const hasAny = markers.length > 0;
  const withCoords = useMemo(
    () => points.filter((p) => p.lat != null && p.lng != null
      && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))),
    [points],
  );
  const missingCoords = hasAny && withCoords.length < points.length;
  const mapsLink = useMemo(() => routeMapsUrl(points), [points]);
  const fade = useRef(new Animated.Value(0)).current;
  const [dash, setDash] = useState(0);

  // Stroke/font sizes in world-map units so they stay readable when zoomed.
  const unit = Math.max(layout.spanX, layout.spanY) / 100;
  const strokeW = Math.max(1.2, unit * 1.1);
  const landStroke = Math.max(0.35, unit * 0.22);
  const markerR = Math.max(4.5, unit * 3.2);
  const labelSize = Math.max(5.5, unit * 3.4);
  const nameSize = Math.max(4.5, unit * 2.8);
  const nameDy = markerR + nameSize * 1.35;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 520, useNativeDriver: true }).start();
  }, [routeD, layout.viewBox, fade]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !hasAny || !routeD) return undefined;
    let frame = 0;
    const id = setInterval(() => {
      frame = (frame + 1) % 28;
      setDash(frame);
    }, 90);
    return () => clearInterval(id);
  }, [hasAny, routeD]);

  const openMaps = () => {
    if (!mapsLink) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(mapsLink, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.openURL(mapsLink);
  };

  return (
    <View style={styles.outer}>
      <Animated.View
        style={[styles.wrap, { height, opacity: fade }]}
        accessibilityLabel="Reiserute på verdenskart"
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={layout.viewBox || WORLD_MAP_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
        >
          <Defs>
            <LinearGradient id="routeStroke" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={accent} stopOpacity="0.45" />
              <Stop offset="0.5" stopColor={accent} stopOpacity="1" />
              <Stop offset="1" stopColor="#f59e0b" stopOpacity="0.95" />
            </LinearGradient>
          </Defs>
          <Rect
            x={-WORLD_MAP_WIDTH}
            y={-WORLD_MAP_HEIGHT}
            width={WORLD_MAP_WIDTH * 3}
            height={WORLD_MAP_HEIGHT * 3}
            fill="#b9daf0"
          />
          {WORLD_MAP_PATHS.map((p) => (
            <Path
              key={p.placeKey}
              d={p.d}
              fill="#f8fafc"
              stroke="#94a3b8"
              strokeWidth={landStroke}
            />
          ))}
          {routeD ? (
            <Path
              d={routeD}
              stroke="url(#routeStroke)"
              strokeWidth={strokeW}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${strokeW * 2.4} ${strokeW * 1.6}`}
              strokeDashoffset={-dash * (strokeW * 0.35)}
            />
          ) : null}
          {markers.map((p) => (
            <React.Fragment key={p.id || p.label}>
              <Circle
                cx={p.x}
                cy={p.y}
                r={p.checkedIn ? markerR * 1.12 : markerR}
                fill={p.hasCoords === false ? '#fff7ed' : (p.checkedIn ? accent : '#fff')}
                stroke={p.hasCoords === false ? '#f59e0b' : accent}
                strokeWidth={strokeW * 0.7}
              />
              <SvgText
                x={p.x}
                y={p.y + labelSize * 0.35}
                textAnchor="middle"
                fontSize={labelSize}
                fontWeight="700"
                fill={p.checkedIn && p.hasCoords !== false ? '#fff' : accent}
              >
                {p.label}
              </SvgText>
              <SvgText
                x={p.x}
                y={p.y + nameDy}
                textAnchor="middle"
                fontSize={nameSize}
                fontWeight="600"
                fill="#0f766e"
              >
                {(p.name || '').slice(0, 18)}
              </SvgText>
            </React.Fragment>
          ))}
        </Svg>
        {!hasAny ? (
          <View style={styles.empty} pointerEvents="none">
            <Text style={styles.emptyTxt}>Søk og legg til destinasjoner for å se ruten</Text>
          </View>
        ) : null}
      </Animated.View>

      {hasAny ? (
        <View style={styles.legend}>
          {points.map((p, i) => (
            <View key={p.id || p.label} style={styles.legendRow}>
              {i < points.length - 1 ? <View style={styles.legendRail} /> : null}
              <View style={[
                styles.legendBadge,
                p.checkedIn && { backgroundColor: accent, borderColor: accent },
                (p.lat == null || p.lng == null) && styles.legendBadgeWarn,
              ]}
              >
                <Text style={[
                  styles.legendBadgeTxt,
                  p.checkedIn && { color: '#fff' },
                ]}
                >
                  {p.label}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.legendName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.legendPlace} numberOfLines={1}>
                  {p.placeLabel
                    || (p.lat != null ? `${Number(p.lat).toFixed(2)}, ${Number(p.lng).toFixed(2)}` : 'Mangler sted på kartet')}
                </Text>
              </View>
              {p.lat != null && p.lng != null ? (
                <Ionicons name="location" size={16} color={accent} />
              ) : (
                <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
              )}
            </View>
          ))}
        </View>
      ) : null}

      {missingCoords ? (
        <Text style={styles.hint}>
          Noen stopp mangler sted — søk destinasjon ved redigering for å plassere dem på kartet.
        </Text>
      ) : null}

      {mapsLink ? (
        <TouchableOpacity style={styles.mapAction} onPress={openMaps} accessibilityRole="button">
          <Ionicons name="navigate-outline" size={16} color={accent} />
          <Text style={styles.mapActionTxt}>
            {withCoords.length > 1 ? 'Åpne rute i kart' : 'Åpne i kart'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { width: '100%', gap: 8 },
  wrap: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#b9daf0',
  },
  empty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTxt: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.85,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  legend: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    position: 'relative',
  },
  legendRail: {
    position: 'absolute',
    left: 12,
    top: 30,
    bottom: -8,
    width: 2,
    backgroundColor: '#99f6e4',
  },
  legendBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#0d9488',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    zIndex: 1,
  },
  legendBadgeWarn: { borderColor: '#f59e0b', backgroundColor: '#fff7ed' },
  legendBadgeTxt: { fontSize: 12, fontWeight: '800', color: '#0d9488' },
  legendName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  legendPlace: { fontSize: 12, color: '#64748b', marginTop: 1 },
  hint: { fontSize: 12, color: '#b45309', fontWeight: '500' },
  mapAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ccfbf1',
  },
  mapActionTxt: { fontSize: 13, fontWeight: '700', color: '#0f766e' },
});
