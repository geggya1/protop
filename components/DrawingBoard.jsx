/**
 * Enkel tegneflate for Tegn og gjett.
 * Normaliserte koordinater (0–1) synces via Firestore.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, StyleSheet, Platform, PanResponder,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../src/theme';
import { sanitizeStroke, sanitizeStrokes } from '../src/utils/drawGuessLogic';

function pointsToPath(points, width, height) {
  if (!points?.length) return '';
  return points
    .map((p, i) => {
      const x = (Number(p.x) || 0) * width;
      const y = (Number(p.y) || 0) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function samplePoint(prev, next) {
  if (!prev) return [next];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.008) return [];
  if (dist < 0.04) return [next];
  const steps = Math.min(4, Math.floor(dist / 0.02));
  const out = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    out.push({ x: prev.x + dx * t, y: prev.y + dy * t });
  }
  return out;
}

export default function DrawingBoard({
  strokes = [],
  liveStroke = null,
  editable = false,
  color = '#1a2744',
  strokeWidth = 5,
  onStrokesChange,
  onLiveStrokeChange,
  height = 280,
}) {
  const sizeRef = useRef({ width: 320, height });
  const [size, setSize] = useState({ width: 320, height });
  const [localStrokes, setLocalStrokes] = useState(() => sanitizeStrokes(strokes));
  const [localLive, setLocalLive] = useState(null);
  const drawingRef = useRef(false);
  const liveObjRef = useRef(null);
  const liveThrottleRef = useRef(0);

  useEffect(() => {
    if (drawingRef.current) return;
    setLocalStrokes(sanitizeStrokes(strokes));
  }, [strokes]);

  useEffect(() => {
    if (drawingRef.current) return;
    setLocalLive(liveStroke ? sanitizeStroke(liveStroke) : null);
  }, [liveStroke]);

  const measure = useCallback((evt) => {
    const { width: w, height: h } = evt.nativeEvent.layout;
    if (w > 0 && h > 0) {
      sizeRef.current = { width: w, height: h };
      setSize({ width: w, height: h });
    }
  }, []);

  const toNorm = useCallback((locX, locY) => {
    if (!Number.isFinite(locX) || !Number.isFinite(locY)) return null;
    const { width: w, height: h } = sizeRef.current;
    return {
      x: Math.min(1, Math.max(0, locX / Math.max(1, w))),
      y: Math.min(1, Math.max(0, locY / Math.max(1, h))),
    };
  }, []);

  const pushLive = useCallback((stroke, force = false) => {
    liveObjRef.current = stroke;
    setLocalLive(stroke);
    const now = Date.now();
    if (force || now - liveThrottleRef.current > 80) {
      liveThrottleRef.current = now;
      onLiveStrokeChange?.(stroke);
    }
  }, [onLiveStrokeChange]);

  const finishStroke = useCallback(() => {
    const stroke = sanitizeStroke(liveObjRef.current);
    drawingRef.current = false;
    liveObjRef.current = null;
    setLocalLive(null);
    onLiveStrokeChange?.(null);
    if (!stroke) return;
    setLocalStrokes((prev) => {
      const next = sanitizeStrokes([...(prev || []), stroke]);
      onStrokesChange?.(next);
      return next;
    });
  }, [onLiveStrokeChange, onStrokesChange]);

  const panResponder = useMemo(() => {
    if (!editable) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const pt = toNorm(locationX, locationY);
        if (!pt) return;
        drawingRef.current = true;
        pushLive({ color, width: strokeWidth, points: [pt] }, true);
      },
      onPanResponderMove: (evt) => {
        if (!drawingRef.current || !liveObjRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        const pt = toNorm(locationX, locationY);
        if (!pt) return;
        const prevPts = liveObjRef.current.points || [];
        const prev = prevPts[prevPts.length - 1];
        const added = samplePoint(prev, pt);
        if (!added.length) return;
        pushLive({
          ...liveObjRef.current,
          points: [...prevPts, ...added].slice(-200),
        });
      },
      onPanResponderRelease: () => finishStroke(),
      onPanResponderTerminate: () => finishStroke(),
    });
  }, [editable, color, strokeWidth, toNorm, pushLive, finishStroke]);

  const allPaths = useMemo(() => {
    const list = [...localStrokes];
    const live = localLive ? sanitizeStroke(localLive) : null;
    if (live) list.push(live);
    return list;
  }, [localStrokes, localLive]);

  return (
    <View
      onLayout={measure}
      style={[
        styles.board,
        { height },
        Platform.OS === 'web' ? styles.boardWeb : null,
      ]}
      {...(panResponder ? panResponder.panHandlers : {})}
      accessibilityLabel={editable ? 'Tegneflate' : 'Tegning'}
    >
      <Svg width={size.width} height={size.height}>
        {allPaths.map((stroke, idx) => (
          <Path
            // eslint-disable-next-line react/no-array-index-key
            key={`s-${idx}-${stroke.points?.length || 0}`}
            d={pointsToPath(stroke.points, size.width, size.height)}
            stroke={stroke.color || colors.ink}
            strokeWidth={stroke.width || 4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  boardWeb: {
    // @ts-ignore — web-only CSS
    touchAction: 'none',
    userSelect: 'none',
    cursor: 'crosshair',
  },
});
