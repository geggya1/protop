/**
 * Crop-modal for barnetegninger — TurboScan-stil:
 * auto-ramme rundt papiret, frie hjørner + kantmidter, forstørrelsesglass ved dra.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, Platform, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';
import { suggestDrawingQuad, rotateImageBlob } from '../src/utils/drawingImageProcess';
import {
  cloneQuad,
  defaultQuad,
  edgeMidpoint,
  moveQuad,
  moveQuadCorner,
  moveQuadEdge,
  quadToPixels,
  rotateQuadCcw90,
  rotateQuadCw90,
} from '../src/utils/drawingCropGeometry';

const HANDLE_VISUAL = 28;
const EDGE_HANDLE = 22;
const HANDLE_HIT = 48;
const LOUPE_SIZE = 132;
const LOUPE_ZOOM = 2.4;
const HANDLE_COLOR = '#E53935';

function containBox(viewW, viewH, imgW, imgH) {
  const vw = Math.max(1, viewW);
  const vh = Math.max(1, viewH);
  const ia = (imgW || 1) / Math.max(1, imgH || 1);
  const va = vw / vh;
  if (va > ia) {
    const height = vh;
    const width = height * ia;
    return { left: (vw - width) / 2, top: 0, width, height };
  }
  const width = vw;
  const height = width / ia;
  return { left: 0, top: (vh - height) / 2, width, height };
}

const CORNERS = ['tl', 'tr', 'bl', 'br'];
const EDGES = ['top', 'right', 'bottom', 'left'];

export default function DrawingCropModal({
  visible,
  imageUri,
  imageBlob,
  onCancel,
  onConfirm,
  title = 'Juster ramme',
}) {
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [workUri, setWorkUri] = useState(imageUri || null);
  const [workBlob, setWorkBlob] = useState(imageBlob || null);
  const workRevokeRef = useRef(null);
  const [quad, setQuad] = useState(() => defaultQuad());
  const [activeHandle, setActiveHandle] = useState(null);
  const [detectMeta, setDetectMeta] = useState({ method: null, confidence: 0 });
  const quadRef = useRef(quad);
  const dragRef = useRef(null);
  const imageBoxRef = useRef(null);
  const autoQuadRef = useRef(null);

  useEffect(() => {
    quadRef.current = quad;
  }, [quad]);

  const clearWorkRevoke = useCallback(() => {
    if (workRevokeRef.current && typeof URL !== 'undefined') {
      try { URL.revokeObjectURL(workRevokeRef.current); } catch { /* ignore */ }
      workRevokeRef.current = null;
    }
  }, []);

  const runSuggest = useCallback(async (blob) => {
    if (!blob || typeof document === 'undefined') return;
    setSuggesting(true);
    try {
      const suggestion = await suggestDrawingQuad(blob);
      if (!suggestion) return;
      const { normalizedQuad, sourceWidth, sourceHeight, confidence, method } = suggestion;
      setNatural({ width: sourceWidth, height: sourceHeight });
      setQuad(normalizedQuad);
      autoQuadRef.current = cloneQuad(normalizedQuad);
      setDetectMeta({ method, confidence: confidence || 0 });
    } catch {
      /* keep default */
    } finally {
      setSuggesting(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    clearWorkRevoke();
    setWorkUri(imageUri || null);
    setWorkBlob(imageBlob || null);
    setQuad(defaultQuad());
    autoQuadRef.current = null;
    setDetectMeta({ method: null, confidence: 0 });
    setNatural({ width: 0, height: 0 });
    setActiveHandle(null);
    let cancelled = false;
    (async () => {
      if (!imageBlob || typeof document === 'undefined') return;
      setSuggesting(true);
      try {
        const suggestion = await suggestDrawingQuad(imageBlob);
        if (cancelled || !suggestion) return;
        const { normalizedQuad, sourceWidth, sourceHeight, confidence, method } = suggestion;
        setNatural({ width: sourceWidth, height: sourceHeight });
        setQuad(normalizedQuad);
        autoQuadRef.current = cloneQuad(normalizedQuad);
        setDetectMeta({ method, confidence: confidence || 0 });
      } catch {
        /* keep default */
      } finally {
        if (!cancelled) setSuggesting(false);
      }
    })();
    return () => {
      cancelled = true;
      clearWorkRevoke();
    };
  }, [visible, imageBlob, imageUri, clearWorkRevoke]);

  const imageBox = useMemo(() => {
    if (!layout.width || !natural.width) return null;
    return containBox(layout.width, layout.height, natural.width, natural.height);
  }, [layout, natural]);

  useEffect(() => {
    imageBoxRef.current = imageBox;
  }, [imageBox]);

  const pixelQuad = useMemo(() => {
    if (!natural.width) return null;
    return quadToPixels(quad, natural.width, natural.height);
  }, [quad, natural]);

  const applyDrag = useCallback((mode, dxNorm, dyNorm) => {
    const start = dragRef.current?.start;
    if (!start) return;
    if (mode === 'move') {
      setQuad(moveQuad(start, dxNorm, dyNorm));
      return;
    }
    if (EDGES.includes(mode)) {
      setQuad(moveQuadEdge(start, mode, dxNorm, dyNorm));
      return;
    }
    setQuad(moveQuadCorner(start, mode, dxNorm, dyNorm));
  }, []);

  const beginDrag = useCallback((mode, clientX, clientY) => {
    const box = imageBoxRef.current;
    if (!box) return false;
    dragRef.current = {
      mode,
      originX: clientX,
      originY: clientY,
      start: cloneQuad(quadRef.current),
    };
    setActiveHandle(mode);
    return true;
  }, []);

  const moveDrag = useCallback((clientX, clientY) => {
    const drag = dragRef.current;
    const box = imageBoxRef.current;
    if (!drag || !box) return;
    const dx = (clientX - drag.originX) / box.width;
    const dy = (clientY - drag.originY) / box.height;
    applyDrag(drag.mode, dx, dy);
  }, [applyDrag]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setActiveHandle(null);
  }, []);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onMove = (e) => {
      if (!dragRef.current) return;
      moveDrag(e.clientX, e.clientY);
    };
    const onUp = () => endDrag();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [visible, moveDrag, endDrag]);

  const webPointerDown = useCallback((mode) => (e) => {
    if (Platform.OS !== 'web') return;
    e?.stopPropagation?.();
    const ne = e?.nativeEvent || e;
    const x = ne.clientX ?? ne.pageX;
    const y = ne.clientY ?? ne.pageY;
    if (!beginDrag(mode, x, y)) return;
    try {
      e?.currentTarget?.setPointerCapture?.(ne.pointerId);
    } catch {
      /* ignore */
    }
  }, [beginDrag]);

  const makeModePan = useCallback((mode) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => {
      dragRef.current = {
        mode,
        originX: 0,
        originY: 0,
        start: cloneQuad(quadRef.current),
      };
      setActiveHandle(mode);
    },
    onPanResponderMove: (_, gesture) => {
      const box = imageBoxRef.current;
      if (!box || !dragRef.current?.start) return;
      applyDrag(mode, gesture.dx / box.width, gesture.dy / box.height);
    },
    onPanResponderRelease: () => endDrag(),
    onPanResponderTerminate: () => endDrag(),
  }), [applyDrag, endDrag]);

  const pans = useMemo(() => {
    const map = {};
    [...CORNERS, ...EDGES].forEach((key) => {
      map[key] = makeModePan(key);
    });
    return map;
  }, [makeModePan]);

  const movePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
    onPanResponderTerminationRequest: () => true,
    onPanResponderGrant: () => {
      dragRef.current = {
        mode: 'move',
        originX: 0,
        originY: 0,
        start: cloneQuad(quadRef.current),
      };
      setActiveHandle('move');
    },
    onPanResponderMove: (_, gesture) => {
      const box = imageBoxRef.current;
      if (!box || !dragRef.current?.start) return;
      applyDrag('move', gesture.dx / box.width, gesture.dy / box.height);
    },
    onPanResponderRelease: () => endDrag(),
    onPanResponderTerminate: () => endDrag(),
  }), [applyDrag, endDrag]);

  const confirm = useCallback(async () => {
    if (!pixelQuad || !workBlob) return;
    setBusy(true);
    try {
      await onConfirm?.({
        cropQuad: pixelQuad,
        blob: workBlob,
        uri: workUri,
        sourceWidth: natural.width,
        sourceHeight: natural.height,
      });
    } finally {
      setBusy(false);
    }
  }, [pixelQuad, workBlob, workUri, natural, onConfirm]);

  const resetAuto = useCallback(() => {
    if (autoQuadRef.current) {
      setQuad(cloneQuad(autoQuadRef.current));
      return;
    }
    if (workBlob) runSuggest(workBlob);
  }, [workBlob, runSuggest]);

  const rotateBy = useCallback(async (degreesCw) => {
    if (!workBlob || busy || suggesting) return;
    if (typeof document === 'undefined') return;
    setBusy(true);
    try {
      const nextBlob = await rotateImageBlob(workBlob, degreesCw);
      const nextUri = typeof URL !== 'undefined' ? URL.createObjectURL(nextBlob) : null;
      clearWorkRevoke();
      if (nextUri) workRevokeRef.current = nextUri;
      setWorkBlob(nextBlob);
      setWorkUri(nextUri);
      setNatural((prev) => (
        degreesCw === 180
          ? prev
          : { width: prev.height || 0, height: prev.width || 0 }
      ));
      const mapQuad = (prev) => (
        degreesCw === 90
          ? rotateQuadCw90(prev)
          : degreesCw === 270
            ? rotateQuadCcw90(prev)
            : rotateQuadCw90(rotateQuadCw90(prev))
      );
      setQuad((prev) => mapQuad(prev));
      if (autoQuadRef.current) {
        autoQuadRef.current = mapQuad(autoQuadRef.current);
      }
    } catch {
      /* ignore rotate failure */
    } finally {
      setBusy(false);
    }
  }, [workBlob, busy, suggesting, clearWorkRevoke]);

  if (!visible) return null;

  const viewPts = imageBox ? {
    tl: {
      x: imageBox.left + quad.tl.x * imageBox.width,
      y: imageBox.top + quad.tl.y * imageBox.height,
    },
    tr: {
      x: imageBox.left + quad.tr.x * imageBox.width,
      y: imageBox.top + quad.tr.y * imageBox.height,
    },
    br: {
      x: imageBox.left + quad.br.x * imageBox.width,
      y: imageBox.top + quad.br.y * imageBox.height,
    },
    bl: {
      x: imageBox.left + quad.bl.x * imageBox.width,
      y: imageBox.top + quad.bl.y * imageBox.height,
    },
  } : null;

  const polyPoints = viewPts
    ? `${viewPts.tl.x},${viewPts.tl.y} ${viewPts.tr.x},${viewPts.tr.y} ${viewPts.br.x},${viewPts.br.y} ${viewPts.bl.x},${viewPts.bl.y}`
    : '';

  const dimPath = viewPts && layout.width
    ? [
      `M0,0H${layout.width}V${layout.height}H0Z`,
      `M${viewPts.tl.x},${viewPts.tl.y}`,
      `L${viewPts.tr.x},${viewPts.tr.y}`,
      `L${viewPts.br.x},${viewPts.br.y}`,
      `L${viewPts.bl.x},${viewPts.bl.y}Z`,
    ].join(' ')
    : '';

  const centroid = viewPts ? {
    left: (viewPts.tl.x + viewPts.tr.x + viewPts.br.x + viewPts.bl.x) / 4 - 22,
    top: (viewPts.tl.y + viewPts.tr.y + viewPts.br.y + viewPts.bl.y) / 4 - 22,
  } : null;

  const handlePositions = viewPts ? {
    tl: { left: viewPts.tl.x - HANDLE_HIT / 2, top: viewPts.tl.y - HANDLE_HIT / 2 },
    tr: { left: viewPts.tr.x - HANDLE_HIT / 2, top: viewPts.tr.y - HANDLE_HIT / 2 },
    bl: { left: viewPts.bl.x - HANDLE_HIT / 2, top: viewPts.bl.y - HANDLE_HIT / 2 },
    br: { left: viewPts.br.x - HANDLE_HIT / 2, top: viewPts.br.y - HANDLE_HIT / 2 },
  } : null;

  const edgePositions = viewPts ? {
    top: {
      left: (viewPts.tl.x + viewPts.tr.x) / 2 - HANDLE_HIT / 2,
      top: (viewPts.tl.y + viewPts.tr.y) / 2 - HANDLE_HIT / 2,
    },
    right: {
      left: (viewPts.tr.x + viewPts.br.x) / 2 - HANDLE_HIT / 2,
      top: (viewPts.tr.y + viewPts.br.y) / 2 - HANDLE_HIT / 2,
    },
    bottom: {
      left: (viewPts.bl.x + viewPts.br.x) / 2 - HANDLE_HIT / 2,
      top: (viewPts.bl.y + viewPts.br.y) / 2 - HANDLE_HIT / 2,
    },
    left: {
      left: (viewPts.tl.x + viewPts.bl.x) / 2 - HANDLE_HIT / 2,
      top: (viewPts.tl.y + viewPts.bl.y) / 2 - HANDLE_HIT / 2,
    },
  } : null;

  // Loupe: show magnified region around active corner/edge
  let loupeStyle = null;
  let loupeBg = null;
  if (activeHandle && activeHandle !== 'move' && imageBox && workUri && natural.width) {
    let nx;
    let ny;
    if (CORNERS.includes(activeHandle)) {
      nx = quad[activeHandle].x;
      ny = quad[activeHandle].y;
    } else {
      const mid = edgeMidpoint(quad, activeHandle);
      nx = mid.x;
      ny = mid.y;
    }
    const focusX = nx * natural.width;
    const focusY = ny * natural.height;
    const sample = LOUPE_SIZE / LOUPE_ZOOM;
    const bgX = -(focusX * LOUPE_ZOOM - LOUPE_SIZE / 2);
    const bgY = -(focusY * LOUPE_ZOOM - LOUPE_SIZE / 2);
    loupeBg = {
      width: natural.width * LOUPE_ZOOM,
      height: natural.height * LOUPE_ZOOM,
      transform: [{ translateX: bgX }, { translateY: bgY }],
    };
    // Prefer bottom of stage; flip to top if handle is in lower third
    const handleY = imageBox.top + ny * imageBox.height;
    const placeTop = handleY > layout.height * 0.62;
    loupeStyle = {
      left: Math.max(12, Math.min(layout.width - LOUPE_SIZE - 12, layout.width / 2 - LOUPE_SIZE / 2)),
      top: placeTop ? 12 : layout.height - LOUPE_SIZE - 12,
    };
    void sample;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={resetAuto}
              style={styles.headerIconBtn}
              accessibilityLabel="Auto-ramme på nytt"
              disabled={busy || suggesting}
            >
              <Ionicons name="scan-outline" size={20} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{title}</Text>
              <Text style={styles.hint}>
                Rammen finner papiret automatisk. Dra hjørner eller kanter
                hvis noe er litt feil — midten flytter hele utsnittet.
              </Text>
            </View>
            <TouchableOpacity
              onPress={confirm}
              style={styles.doneBtn}
              disabled={!pixelQuad || busy}
              accessibilityLabel="Ferdig"
            >
              {busy
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.doneTxt}>Ferdig</Text>}
            </TouchableOpacity>
          </View>

          <View
            style={styles.stage}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setLayout({ width, height });
            }}
          >
            {workUri ? (
              <Image
                source={{ uri: workUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
                pointerEvents="none"
                onLoad={(e) => {
                  const src = e?.nativeEvent?.source;
                  if (src?.width && src?.height) {
                    setNatural({ width: src.width, height: src.height });
                  }
                }}
              />
            ) : null}

            {viewPts && layout.width ? (
              <>
                <Svg
                  width={layout.width}
                  height={layout.height}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                >
                  <Path d={dimPath} fill="rgba(0,0,0,0.5)" fillRule="evenodd" />
                  <Polygon
                    points={polyPoints}
                    fill="transparent"
                    stroke="#fff"
                    strokeWidth={2.5}
                  />
                  {/* dashed accent like TurboScan live frame */}
                  <Line
                    x1={viewPts.tl.x} y1={viewPts.tl.y}
                    x2={viewPts.tr.x} y2={viewPts.tr.y}
                    stroke={HANDLE_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="6 5"
                    opacity={0.85}
                  />
                  <Line
                    x1={viewPts.tr.x} y1={viewPts.tr.y}
                    x2={viewPts.br.x} y2={viewPts.br.y}
                    stroke={HANDLE_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="6 5"
                    opacity={0.85}
                  />
                  <Line
                    x1={viewPts.br.x} y1={viewPts.br.y}
                    x2={viewPts.bl.x} y2={viewPts.bl.y}
                    stroke={HANDLE_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="6 5"
                    opacity={0.85}
                  />
                  <Line
                    x1={viewPts.bl.x} y1={viewPts.bl.y}
                    x2={viewPts.tl.x} y2={viewPts.tl.y}
                    stroke={HANDLE_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="6 5"
                    opacity={0.85}
                  />
                  {CORNERS.map((key) => (
                    <Circle
                      key={`c-${key}`}
                      cx={viewPts[key].x}
                      cy={viewPts[key].y}
                      r={HANDLE_VISUAL / 2}
                      fill="rgba(229,57,53,0.35)"
                      stroke={HANDLE_COLOR}
                      strokeWidth={2}
                    />
                  ))}
                </Svg>

                <View
                  style={[styles.moveHit, centroid]}
                  {...(Platform.OS === 'web' ? {} : movePan.panHandlers)}
                  onPointerDown={Platform.OS === 'web' ? webPointerDown('move') : undefined}
                  accessibilityLabel="Flytt utsnitt"
                >
                  <View pointerEvents="none" style={styles.moveKnob}>
                    <Ionicons name="move" size={16} color="#0b74d1" />
                  </View>
                </View>

                {CORNERS.map((key) => (
                  <View
                    key={key}
                    style={[styles.handleHit, handlePositions[key]]}
                    {...(Platform.OS === 'web' ? {} : pans[key].panHandlers)}
                    onPointerDown={Platform.OS === 'web' ? webPointerDown(key) : undefined}
                    accessibilityLabel={`Juster ${key}-hjørne`}
                    accessibilityRole="adjustable"
                  >
                    <View pointerEvents="none" style={styles.handle} />
                  </View>
                ))}

                {EDGES.map((key) => (
                  <View
                    key={`edge-${key}`}
                    style={[styles.handleHit, edgePositions[key]]}
                    {...(Platform.OS === 'web' ? {} : pans[key].panHandlers)}
                    onPointerDown={Platform.OS === 'web' ? webPointerDown(key) : undefined}
                    accessibilityLabel={`Juster ${key}-kant`}
                    accessibilityRole="adjustable"
                  >
                    <View pointerEvents="none" style={styles.edgeHandle} />
                  </View>
                ))}

                {loupeStyle && loupeBg ? (
                  <View style={[styles.loupe, loupeStyle]} pointerEvents="none">
                    <View style={styles.loupeClip}>
                      <Image
                        source={{ uri: workUri }}
                        style={loupeBg}
                        resizeMode="stretch"
                      />
                      <View style={styles.loupeCrossH} />
                      <View style={styles.loupeCrossV} />
                    </View>
                    <Text style={styles.loupeLabel}>Forstørrelse</Text>
                  </View>
                ) : null}
              </>
            ) : null}

            {(suggesting || !natural.width) ? (
              <View style={styles.loading}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.loadingTxt}>Finner tegningen…</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.actions}>
            <View style={styles.rotateRow}>
              <TouchableOpacity
                onPress={() => rotateBy(270)}
                style={styles.rotateBtn}
                disabled={busy || suggesting || !workBlob}
                accessibilityLabel="Roter mot urviseren"
              >
                <Ionicons name="arrow-undo" size={18} color="#0f172a" />
                <Text style={styles.rotateTxt}>Venstre</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => rotateBy(90)}
                style={styles.rotateBtn}
                disabled={busy || suggesting || !workBlob}
                accessibilityLabel="Roter med urviseren"
              >
                <Ionicons name="arrow-redo" size={18} color="#0f172a" />
                <Text style={styles.rotateTxt}>Høyre</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={onCancel} style={[styles.btn, styles.cancelBtn]} disabled={busy}>
              <Text style={styles.cancelTxt}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirm}
              style={[styles.btn, styles.okBtn, (!pixelQuad || busy) && { opacity: 0.6 }]}
              disabled={!pixelQuad || busy}
            >
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.okTxt}>Bruk utsnitt</Text>}
            </TouchableOpacity>
          </View>
          {detectMeta.method ? (
            <Text style={styles.detectMeta} accessibilityElementsHidden>
              Auto-ramme: {detectMeta.method}
              {detectMeta.confidence ? ` (${Math.round(detectMeta.confidence * 100)}%)` : ''}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  card: {
    width: '100%',
    maxWidth: 920,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      web: { maxHeight: '92vh' },
      default: { maxHeight: '92%' },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f1f5f9',
  },
  headerIconBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTitle: { fontWeight: '800', fontSize: 16, color: '#0f172a' },
  hint: { marginTop: 4, fontSize: 13, color: '#64748b', lineHeight: 18 },
  doneBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#0b74d1',
    minWidth: 72,
    alignItems: 'center',
  },
  doneTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stage: {
    height: 440,
    backgroundColor: '#0b1220',
    position: 'relative',
    overflow: 'hidden',
  },
  moveHit: {
    position: 'absolute',
    width: 44,
    height: 44,
    zIndex: 5,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'move', touchAction: 'none' },
      default: {},
    }),
  },
  moveKnob: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#0b74d1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleHit: {
    position: 'absolute',
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    zIndex: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'grab', touchAction: 'none' },
      default: {},
    }),
  },
  handle: {
    width: HANDLE_VISUAL,
    height: HANDLE_VISUAL,
    borderRadius: HANDLE_VISUAL / 2,
    backgroundColor: 'rgba(229,57,53,0.45)',
    borderWidth: 2.5,
    borderColor: HANDLE_COLOR,
  },
  edgeHandle: {
    width: EDGE_HANDLE,
    height: EDGE_HANDLE,
    borderRadius: EDGE_HANDLE / 2,
    backgroundColor: 'rgba(229,57,53,0.4)',
    borderWidth: 2,
    borderColor: HANDLE_COLOR,
  },
  loupe: {
    position: 'absolute',
    width: LOUPE_SIZE,
    zIndex: 8,
    alignItems: 'center',
  },
  loupeClip: {
    width: LOUPE_SIZE,
    height: LOUPE_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#000',
  },
  loupeCrossH: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: LOUPE_SIZE / 2 - 0.5,
    height: 1,
    backgroundColor: 'rgba(229,57,53,0.85)',
  },
  loupeCrossV: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    left: LOUPE_SIZE / 2 - 0.5,
    width: 1,
    backgroundColor: 'rgba(229,57,53,0.85)',
  },
  loupeLabel: {
    marginTop: 4,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  loadingTxt: { color: '#fff', fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  rotateRow: {
    flexDirection: 'row',
    gap: 8,
    marginRight: 'auto',
  },
  rotateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  rotateTxt: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  cancelBtn: { backgroundColor: '#e2e8f0' },
  cancelTxt: { color: '#0f172a', fontWeight: '800' },
  okBtn: { backgroundColor: '#5C4033' },
  okTxt: { color: '#fff', fontWeight: '800' },
  detectMeta: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    fontSize: 11,
    color: '#94a3b8',
  },
});
