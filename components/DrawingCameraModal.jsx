/**
 * Kamera for å ta bilde av barnetegning.
 * Blitz: Av / Auto / På (konstant torch) — huskes mellom økter.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { friendlyWebCameraError } from '../src/utils/webCamera';
import {
  FLASH_MODES,
  flashModeIcon,
  flashModeLabel,
  nextFlashMode,
  setWebTorch,
  webTorchSupported,
} from '../src/utils/drawingCameraFlash';
import { detectDrawingQuadFromImageData } from '../src/utils/drawingImageProcess';
import { pickImage } from '../src/utils/media';
import Svg, { Line, Polygon } from 'react-native-svg';

const FLASH_STORAGE_KEY = 'drawingCamera.flashMode';
const DETECT_INTERVAL_MS = 280;
const DETECT_PROBE = 360;
const FRAME_COLOR = '#E85A4F';

async function loadDrawingFlashMode() {
  try {
    const raw = await AsyncStorage.getItem(FLASH_STORAGE_KEY);
    if (FLASH_MODES.includes(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'auto';
}

async function saveDrawingFlashMode(mode) {
  if (!FLASH_MODES.includes(mode)) return;
  try {
    await AsyncStorage.setItem(FLASH_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function resolveDomHost(node) {
  if (!node) return null;
  if (typeof node.appendChild === 'function') return node;
  const candidates = [node.childNodes?.[0], node._nativeNode, node.__domNode];
  for (const c of candidates) {
    if (c && typeof c.appendChild === 'function') return c;
  }
  return null;
}

async function requestCameraStream() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const err = new Error('Kamera støttes ikke i denne nettleseren.');
    err.name = 'NotSupportedError';
    throw err;
  }
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    const err = new Error('Kamera krever HTTPS.');
    err.name = 'SecurityError';
    throw err;
  }
  const attempts = [
    {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      },
      audio: false,
    },
    { video: { facingMode: 'environment' }, audio: false },
    { video: true, audio: false },
  ];
  let lastErr;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastErr = e;
      if (e?.name === 'NotAllowedError') throw e;
    }
  }
  throw lastErr || new Error('Klarte ikke starte kamera.');
}

function FlashCycleButton({ mode, onCycle, torchHint, compact }) {
  return (
    <TouchableOpacity
      style={[styles.flashBtn, compact && styles.flashBtnCompact]}
      onPress={onCycle}
      accessibilityRole="button"
      accessibilityLabel={flashModeLabel(mode)}
    >
      <Ionicons name={flashModeIcon(mode)} size={compact ? 20 : 22} color="#fff" />
      {!compact ? <Text style={styles.flashTxt}>{flashModeLabel(mode)}</Text> : null}
      {torchHint ? <Text style={styles.flashHint}>{torchHint}</Text> : null}
    </TouchableOpacity>
  );
}

function NativeCapture({ flashMode, onFlashCycle, onCaptured, onClose, onPickGallery }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const take = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
        shutterSound: true,
      });
      const uri = photo?.uri;
      if (!uri) throw new Error('Ingen bilde');
      onCaptured({ uri, blob: null });
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke ta bilde.');
    } finally {
      setBusy(false);
    }
  }, [busy, onCaptured]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permTitle}>Kameratilgang</Text>
        <Text style={styles.permBody}>Vi trenger kamera for å ta bilde av tegningen.</Text>
        {permission.canAskAgain ? (
          <TouchableOpacity style={styles.actionBtn} onPress={requestPermission}>
            <Text style={styles.actionBtnTxt}>Gi tilgang</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.permBody}>Tillat kamera i innstillinger og prøv igjen.</Text>
        )}
        <TouchableOpacity style={styles.secondaryBtn} onPress={onPickGallery}>
          <Text style={styles.secondaryBtnTxt}>Velg fra galleri</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
          <Text style={styles.cancelLinkTxt}>Avbryt</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const torchOn = flashMode === 'on';
  const flash = flashMode === 'off' ? 'off' : (flashMode === 'on' ? 'on' : 'auto');

  return (
    <View style={styles.scanner}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        flash={flash}
        enableTorch={ready && torchOn}
        onCameraReady={() => setReady(true)}
      />
      {/* Static guide frame — live CV on native requires frame processors */}
      <View style={styles.guideFrame} pointerEvents="none">
        <View style={[styles.guideCorner, styles.guideTL]} />
        <View style={[styles.guideCorner, styles.guideTR]} />
        <View style={[styles.guideCorner, styles.guideBL]} />
        <View style={[styles.guideCorner, styles.guideBR]} />
      </View>
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Text style={styles.title}>Ta bilde av tegning</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Lukk">
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.hintWrap} pointerEvents="none">
          <Text style={styles.hint}>
            Legg tegningen flatt innenfor rammen. Etter bilde justeres auto-rammen — dra hjørnene om den treffer feil.
          </Text>
        </View>
        <View style={styles.bottomBar}>
          <FlashCycleButton mode={flashMode} onCycle={onFlashCycle} />
          <TouchableOpacity
            style={[styles.shutter, busy && { opacity: 0.6 }]}
            onPress={take}
            disabled={busy || !ready}
            accessibilityLabel="Ta bilde"
          >
            {busy ? <ActivityIndicator color="#0f172a" /> : <View style={styles.shutterInner} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.galleryBtn} onPress={onPickGallery} accessibilityLabel="Galleri">
            <Ionicons name="images-outline" size={26} color="#fff" />
            <Text style={styles.galleryTxt}>Galleri</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function WebCapture({ flashMode, onFlashCycle, onCaptured, onClose, onPickGallery }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const cancelledRef = useRef(false);
  const detectCanvasRef = useRef(null);
  const lastQuadRef = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [errorInfo, setErrorInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [torchHint, setTorchHint] = useState('');
  const [autoMode, setAutoMode] = useState(true);
  const [liveQuad, setLiveQuad] = useState(null);
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const teardown = useCallback(() => {
    try {
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch { /* ignore */ }
    streamRef.current = null;
    trackRef.current = null;
    lastQuadRef.current = null;
    setLiveQuad(null);
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
        videoRef.current.remove?.();
      } catch { /* ignore */ }
      videoRef.current = null;
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    setPhase('idle');
    setErrorInfo(null);
    setTorchOk(false);
    setTorchHint('');
    setLiveQuad(null);
    return () => {
      cancelledRef.current = true;
      teardown();
    };
  }, [teardown]);

  const applyTorch = useCallback(async (mode) => {
    const track = trackRef.current;
    if (!track) return;
    if (mode === 'on') {
      const ok = await setWebTorch(track, true);
      setTorchOk(ok);
      setTorchHint(ok ? '' : 'Konstant blitz støttes ikke i denne nettleseren');
      return;
    }
    await setWebTorch(track, false);
    setTorchHint('');
  }, []);

  useEffect(() => {
    if (phase !== 'live') return;
    applyTorch(flashMode);
  }, [flashMode, phase, applyTorch]);

  // Live document-frame detection (TurboScan-style dashed overlay)
  useEffect(() => {
    if (phase !== 'live' || !autoMode) {
      if (!autoMode) {
        setLiveQuad(null);
        lastQuadRef.current = null;
      }
      return undefined;
    }
    let alive = true;
    let timer = null;

    const tick = () => {
      if (!alive || cancelledRef.current) return;
      const video = videoRef.current;
      if (!video || !video.videoWidth) {
        timer = setTimeout(tick, DETECT_INTERVAL_MS);
        return;
      }
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const scale = Math.min(1, DETECT_PROBE / Math.max(vw, vh));
        const pw = Math.max(1, Math.round(vw * scale));
        const ph = Math.max(1, Math.round(vh * scale));
        let canvas = detectCanvasRef.current;
        if (!canvas) {
          canvas = document.createElement('canvas');
          detectCanvasRef.current = canvas;
        }
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw;
          canvas.height = ph;
        }
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, pw, ph);
        const result = detectDrawingQuadFromImageData(
          ctx.getImageData(0, 0, pw, ph),
        );
        if (result?.normalized && result.confidence >= 0.4) {
          lastQuadRef.current = result.normalized;
          setLiveQuad(result.normalized);
        }
      } catch {
        /* ignore frame errors */
      }
      timer = setTimeout(tick, DETECT_INTERVAL_MS);
    };

    timer = setTimeout(tick, 120);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, autoMode]);

  const attachStream = useCallback(async (stream) => {
    let host = resolveDomHost(containerRef.current);
    for (let i = 0; !host && i < 10; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
      host = resolveDomHost(containerRef.current);
    }
    if (!host) {
      stream.getTracks?.().forEach((t) => t.stop());
      throw new Error('Klarte ikke starte kameravisning.');
    }
    while (host.firstChild) host.removeChild(host.firstChild);

    const video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('muted', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;
    video.playsInline = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.objectPosition = 'center';
    host.appendChild(video);
    videoRef.current = video;
    streamRef.current = stream;
    trackRef.current = stream.getVideoTracks?.()[0] || null;

    video.srcObject = stream;
    await video.play().catch(() => {});

    if (trackRef.current && webTorchSupported(trackRef.current)) {
      setTorchOk(true);
    }
  }, []);

  const openCamera = useCallback(async () => {
    setErrorInfo(null);
    setPhase('starting');
    teardown();
    let stream = null;
    try {
      stream = await requestCameraStream();
      if (cancelledRef.current) {
        stream.getTracks?.().forEach((t) => t.stop());
        return;
      }
      await attachStream(stream);
      if (!cancelledRef.current) setPhase('live');
    } catch (e) {
      try { stream?.getTracks?.().forEach((t) => t.stop()); } catch { /* ignore */ }
      if (cancelledRef.current) return;
      setErrorInfo(friendlyWebCameraError(e));
      setPhase('error');
    }
  }, [attachStream, teardown]);

  const take = useCallback(async () => {
    const video = videoRef.current;
    if (!video || busy) return;
    setBusy(true);
    try {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Kunne ikke lage bilde'))),
          'image/jpeg',
          0.92,
        );
      });
      const uri = URL.createObjectURL(blob);
      const detectedQuad = autoMode ? lastQuadRef.current : null;
      teardown();
      onCaptured({ uri, blob, revoke: true, detectedQuad });
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke ta bilde.');
    } finally {
      setBusy(false);
    }
  }, [busy, onCaptured, teardown, autoMode]);

  const showGate = phase === 'idle' || phase === 'error';
  const info = errorInfo || {
    title: 'Klar til å fotografere',
    body: 'Trykk «Åpne kamera» for å starte. På iPhone må tilgangen startes med et trykk.',
  };

  // Map normalized quad onto cover-fitted video layout
  const overlayPts = useMemo(() => {
    if (!liveQuad || !layout.width || !layout.height) return null;
    const video = videoRef.current;
    const vw = video?.videoWidth || 4;
    const vh = video?.videoHeight || 3;
    // object-fit: cover mapping
    const scale = Math.max(layout.width / vw, layout.height / vh);
    const dispW = vw * scale;
    const dispH = vh * scale;
    const ox = (layout.width - dispW) / 2;
    const oy = (layout.height - dispH) / 2;
    const map = (p) => ({
      x: ox + p.x * dispW,
      y: oy + p.y * dispH,
    });
    return {
      tl: map(liveQuad.tl),
      tr: map(liveQuad.tr),
      br: map(liveQuad.br),
      bl: map(liveQuad.bl),
    };
  }, [liveQuad, layout]);

  const polyPoints = overlayPts
    ? `${overlayPts.tl.x},${overlayPts.tl.y} ${overlayPts.tr.x},${overlayPts.tr.y} ${overlayPts.br.x},${overlayPts.br.y} ${overlayPts.bl.x},${overlayPts.bl.y}`
    : '';

  return (
    <View
      style={styles.scanner}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setLayout({ width, height });
      }}
    >
      {React.createElement('div', {
        ref: containerRef,
        style: {
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          background: '#000',
        },
      })}

      {phase === 'starting' && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.loadingTxt}>Starter kamera…</Text>
        </View>
      )}

      {phase === 'live' && overlayPts && layout.width ? (
        <Svg
          width={layout.width}
          height={layout.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Polygon
            points={polyPoints}
            fill="rgba(232,90,79,0.12)"
            stroke="#fff"
            strokeWidth={2}
          />
          {[
            [overlayPts.tl, overlayPts.tr],
            [overlayPts.tr, overlayPts.br],
            [overlayPts.br, overlayPts.bl],
            [overlayPts.bl, overlayPts.tl],
          ].map((seg, i) => (
            <Line
              key={`seg-${i}`}
              x1={seg[0].x}
              y1={seg[0].y}
              x2={seg[1].x}
              y2={seg[1].y}
              stroke={FRAME_COLOR}
              strokeWidth={2.5}
              strokeDasharray="10 7"
            />
          ))}
        </Svg>
      ) : null}

      {phase === 'live' && (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.topBar}>
            <FlashCycleButton
              mode={flashMode}
              onCycle={onFlashCycle}
              torchHint={flashMode === 'on' && !torchOk ? torchHint : ''}
              compact
            />
            <Text style={styles.title}>
              {autoMode ? 'Side [1]' : 'Manuell'}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Lukk">
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.hintWrap} pointerEvents="none">
            <Text style={styles.hint}>
              {autoMode
                ? (liveQuad
                  ? 'Tegning funnet — ta bilde for å croppe til rammen.'
                  : 'Rett kameraet mot tegningen. Rammen dukker opp når papiret gjenkjennes.')
                : 'Manuell: ta bilde, juster rammen etterpå.'}
            </Text>
          </View>
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.modeBtn}
              onPress={() => setAutoMode((v) => !v)}
              accessibilityLabel={autoMode ? 'Bytt til manuell' : 'Bytt til auto'}
            >
              <Text style={styles.modeBtnTxt}>{autoMode ? 'Manuell' : 'Auto'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.shutter, busy && { opacity: 0.6 }]}
              onPress={take}
              disabled={busy}
              accessibilityLabel="Ta bilde"
            >
              {busy ? <ActivityIndicator color="#0f172a" /> : <View style={styles.shutterInner} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.galleryBtn} onPress={onPickGallery} accessibilityLabel="Galleri">
              <Ionicons name="images-outline" size={26} color="#fff" />
              <Text style={styles.galleryTxt}>Galleri</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showGate && (
        <View style={styles.gate}>
          <Text style={styles.permTitle}>{info.title}</Text>
          <Text style={styles.permBody}>{info.body}</Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={openCamera}
            accessibilityRole="button"
            accessibilityLabel="Åpne kamera"
          >
            <Text style={styles.actionBtnTxt}>Åpne kamera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onPickGallery}>
            <Text style={styles.secondaryBtnTxt}>Velg fra galleri</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
            <Text style={styles.cancelLinkTxt}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function DrawingCameraModal({
  visible,
  onClose,
  onCaptured,
}) {
  const [flashMode, setFlashMode] = useState('auto');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const mode = await loadDrawingFlashMode();
      if (!cancelled) setFlashMode(mode);
    })();
    return () => { cancelled = true; };
  }, [visible]);

  const cycleFlash = useCallback(() => {
    setFlashMode((prev) => {
      const next = nextFlashMode(prev);
      saveDrawingFlashMode(next);
      return next;
    });
  }, []);

  const pickGallery = useCallback(async () => {
    try {
      const picked = await pickImage({ camera: false, edit: false });
      if (!picked) return;
      onCaptured(picked);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke hente bilde.');
    }
  }, [onCaptured]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View style={styles.modal}>
        {visible ? (
          Platform.OS === 'web' ? (
            <WebCapture
              flashMode={flashMode}
              onFlashCycle={cycleFlash}
              onCaptured={onCaptured}
              onClose={onClose}
              onPickGallery={pickGallery}
            />
          ) : (
            <NativeCapture
              flashMode={flashMode}
              onFlashCycle={cycleFlash}
              onCaptured={onCaptured}
              onClose={onClose}
              onPickGallery={pickGallery}
            />
          )
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#000' },
  scanner: { flex: 1, backgroundColor: '#000' },
  guideFrame: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '18%',
    bottom: '28%',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    borderStyle: 'dashed',
  },
  guideCorner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#E85A4F',
  },
  guideTL: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
  guideTR: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
  guideBL: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
  guideBR: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#0b1220',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'web' ? 16 : 48,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  title: { color: '#fff', fontWeight: '800', fontSize: 17 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  hintWrap: {
    alignSelf: 'center',
    maxWidth: 340,
    paddingHorizontal: 16,
  },
  hint: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'web' ? 24 : 36,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 8,
  },
  flashBtn: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
    minWidth: 0,
  },
  flashBtnCompact: {
    flex: 0,
    minWidth: 44,
    alignItems: 'center',
  },
  flashTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  flashHint: { color: '#fbbf24', fontSize: 10, marginTop: 2 },
  modeBtn: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    minWidth: 0,
  },
  modeBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  galleryBtn: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  galleryTxt: { color: '#fff', fontWeight: '600', fontSize: 12 },
  gate: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,18,32,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permTitle: { color: '#fff', fontWeight: '800', fontSize: 20, textAlign: 'center' },
  permBody: {
    color: '#cbd5e1',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 18,
    lineHeight: 22,
  },
  actionBtn: {
    backgroundColor: '#0b74d1',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  actionBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    minWidth: 200,
    alignItems: 'center',
  },
  secondaryBtnTxt: { color: '#fff', fontWeight: '700' },
  cancelLink: { marginTop: 18 },
  cancelLinkTxt: { color: '#94a3b8', fontWeight: '600' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  loadingTxt: { color: '#fff', fontWeight: '600' },
});
