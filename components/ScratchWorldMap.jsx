/**
 * Zoom-/pan-bart verdenskart for Våre reiser (SVG landflater).
 * Hvert adskilt landområde (f.eks. Frankrike / Korsika / Fransk Guyana) er eget sted.
 *
 * Mobil: én finger scroller siden; to fingre paner kartet; knip zoomer.
 * Vertikal page-scroll skal ikke kapres av kartet.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors, radius } from '../src/theme';
import {
  WORLD_MAP_PATHS, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT, WORLD_MAP_VIEWBOX,
  mapPlacesForCountry,
} from '../src/utils/worldMapPaths';

const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
const DEFAULT_VIEW = { zoom: 1.6, pan: { x: 30, y: -55 } };

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function latLngToMapXY(lat, lng) {
  return {
    x: ((Number(lng) + 180) / 360) * WORLD_MAP_WIDTH,
    y: ((90 - Number(lat)) / 180) * WORLD_MAP_HEIGHT,
  };
}

export function initialViewForCountry(code, { padding = 0.45 } = {}) {
  const places = mapPlacesForCountry(code);
  if (!places.length) return DEFAULT_VIEW;
  const pts = places.map((p) => latLngToMapXY(p.lat, p.lng));
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spanX = Math.max(maxX - minX, 36);
  const spanY = Math.max(maxY - minY, 28);
  const zoomX = WORLD_MAP_WIDTH / (spanX * (1 + padding));
  const zoomY = WORLD_MAP_HEIGHT / (spanY * (1 + padding));
  const zoom = clamp(Math.min(zoomX, zoomY), MIN_ZOOM, MAX_ZOOM);
  const lim = {
    x: WORLD_MAP_WIDTH * (1 - 1 / zoom) / 2,
    y: WORLD_MAP_HEIGHT * (1 - 1 / zoom) / 2,
  };
  return {
    zoom,
    pan: {
      x: clamp(cx - WORLD_MAP_WIDTH / 2, -lim.x, lim.x),
      y: clamp(cy - WORLD_MAP_HEIGHT / 2, -lim.y, lim.y),
    },
  };
}

function resolveDomNode(refValue) {
  if (!refValue) return null;
  if (typeof refValue.addEventListener === 'function') return refValue;
  if (refValue.getNode && typeof refValue.getNode === 'function') {
    const n = refValue.getNode();
    if (n && typeof n.addEventListener === 'function') return n;
  }
  return null;
}

export default function ScratchWorldMap({
  visitedPlaceKeys,
  visitedCodes,
  selectedPlaceKey,
  selectedCode,
  onPressPlace,
  focusCountryCode = null,
  width,
  height = 240,
  showControls = true,
  showHint = true,
  compact = false,
}) {
  const w = Math.max(compact ? 240 : 280, Number(width) || 320);
  const h = Math.max(compact ? 160 : 180, Number(height) || 240);
  const visitedPlaces = visitedPlaceKeys instanceof Set
    ? visitedPlaceKeys
    : new Set(visitedPlaceKeys || []);
  const visitedCountries = visitedCodes instanceof Set
    ? visitedCodes
    : new Set(visitedCodes || []);

  const focusView = useMemo(
    () => (focusCountryCode ? initialViewForCountry(focusCountryCode) : DEFAULT_VIEW),
    [focusCountryCode],
  );

  const [zoom, setZoom] = useState(focusView.zoom);
  const [pan, setPan] = useState(focusView.pan);
  const frameRef = useRef(null);
  const panStart = useRef({ x: 0, y: 0 });
  const pinchStartZoom = useRef(zoom);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  useEffect(() => {
    setZoom(focusView.zoom);
    setPan(focusView.pan);
  }, [focusView]);

  const paths = useMemo(() => {
    if (!focusCountryCode) return WORLD_MAP_PATHS;
    return WORLD_MAP_PATHS.filter((p) => p.code === focusCountryCode);
  }, [focusCountryCode]);

  const applyZoom = useCallback((nextZoom) => {
    const z0 = zoomRef.current;
    const z1 = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (z1 === z0) return;
    const { x: px, y: py } = panRef.current;
    const lim = {
      x: WORLD_MAP_WIDTH * (1 - 1 / z1) / 2,
      y: WORLD_MAP_HEIGHT * (1 - 1 / z1) / 2,
    };
    setZoom(z1);
    setPan({
      x: clamp(px, -lim.x, lim.x),
      y: clamp(py, -lim.y, lim.y),
    });
  }, []);

  const movePan = useCallback((dx, dy) => {
    const z = zoomRef.current;
    const lim = {
      x: WORLD_MAP_WIDTH * (1 - 1 / z) / 2,
      y: WORLD_MAP_HEIGHT * (1 - 1 / z) / 2,
    };
    const scaleX = (WORLD_MAP_WIDTH / z) / w;
    const scaleY = (WORLD_MAP_HEIGHT / z) / h;
    setPan({
      x: clamp(panStart.current.x - dx * scaleX, -lim.x, lim.x),
      y: clamp(panStart.current.y - dy * scaleY, -lim.y, lim.y),
    });
  }, [w, h]);

  const viewBox = useMemo(() => {
    const vw = WORLD_MAP_WIDTH / zoom;
    const vh = WORLD_MAP_HEIGHT / zoom;
    const minX = WORLD_MAP_WIDTH / 2 + pan.x - vw / 2;
    const minY = WORLD_MAP_HEIGHT / 2 + pan.y - vh / 2;
    return `${minX} ${minY} ${vw} ${vh}`;
  }, [zoom, pan]);

  // To fingre for pan — én finger overlates til sidescroll (ScrollView).
  const panGesture = useMemo(() => Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .onBegin(() => {
      panStart.current = { ...panRef.current };
    })
    .onUpdate((e) => {
      movePan(e.translationX, e.translationY);
    }), [movePan]);

  const pinchGesture = useMemo(() => Gesture.Pinch()
    .onBegin(() => {
      pinchStartZoom.current = zoomRef.current;
    })
    .onUpdate((e) => {
      applyZoom(pinchStartZoom.current * e.scale);
    }), [applyZoom]);

  const mapGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture),
    [panGesture, pinchGesture],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const node = resolveDomNode(frameRef.current);
    if (!node) return undefined;
    const onWheel = (e) => {
      // Kun zoom med Ctrl/Cmd+hjul — ellers la siden scrolle.
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = (e.deltaY || 0) > 0 ? 0.88 : 1.14;
      applyZoom(zoomRef.current * factor);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [applyZoom, w, h]);

  const zoomIn = () => applyZoom(zoomRef.current * 1.5);
  const zoomOut = () => applyZoom(zoomRef.current / 1.5);
  const reset = () => {
    setZoom(focusView.zoom);
    setPan({ ...focusView.pan });
  };

  const hintText = focusCountryCode
    ? 'Trykk området du vil markere · to fingre for å dra · knip for zoom'
    : `Zoom med +/−${Platform.OS === 'web' ? ' / Ctrl+musehjul' : ''} · to fingre for å dra · knip for zoom · trykk land`;

  return (
    <View style={[styles.wrap, { width: w }]}>
      <GestureDetector gesture={mapGesture}>
        <View
          ref={frameRef}
          style={[styles.mapFrame, { width: w, height: h }]}
        >
          <Svg width={w} height={h} viewBox={viewBox || WORLD_MAP_VIEWBOX}>
            <Rect
              x={-WORLD_MAP_WIDTH}
              y={-WORLD_MAP_HEIGHT}
              width={WORLD_MAP_WIDTH * 3}
              height={WORLD_MAP_HEIGHT * 3}
              fill="#b9daf0"
            />
            {paths.map((p) => {
              const on = visitedPlaces.has(p.placeKey)
                || (visitedPlaces.size === 0 && visitedCountries.has(p.code) && p.partId === 0);
              const sel = selectedPlaceKey
                ? selectedPlaceKey === p.placeKey
                : selectedCode === p.code;
              const dimmed = focusCountryCode && !sel && !on;
              return (
                <Path
                  key={p.placeKey}
                  d={p.d}
                  fill={on ? '#0f766e' : dimmed ? '#e2e8f0' : '#f8fafc'}
                  stroke={sel ? colors.brand : on ? '#134e4a' : dimmed ? '#cbd5e1' : '#94a3b8'}
                  strokeWidth={sel ? 2.2 / zoom : 0.6 / zoom}
                  onPress={() => onPressPlace?.(p)}
                />
              );
            })}
          </Svg>

          {showControls ? (
            <View style={styles.controls} pointerEvents="box-none">
              <TouchableOpacity style={styles.ctrlBtn} onPress={zoomIn} accessibilityLabel="Zoom inn">
                <Ionicons name="add" size={20} color={colors.ink} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.ctrlBtn} onPress={zoomOut} accessibilityLabel="Zoom ut">
                <Ionicons name="remove" size={20} color={colors.ink} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.ctrlBtn} onPress={reset} accessibilityLabel="Nullstill kart">
                <Ionicons name="scan-outline" size={18} color={colors.ink} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </GestureDetector>
      {showHint ? (
        <Text style={styles.hint}>{hintText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', marginTop: 4 },
  mapFrame: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#b9daf0',
    position: 'relative',
  },
  controls: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    gap: 6,
  },
  ctrlBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
  },
});
