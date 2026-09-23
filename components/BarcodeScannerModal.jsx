import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
  TextInput, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ScreenOrientation from 'expo-screen-orientation';
import { colors } from '../src/theme';
import { friendlyWebCameraError, needsCameraUserGesture } from '../src/utils/webCamera';

const NATIVE_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'];

/** Session flag: after first successful web camera open, skip the gate when remounting (non-iOS). */
let webCameraSessionReady = false;

/** Keep scanner UI in portrait — ignore failures (common on mobile web). */
async function lockPortrait() {
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch {
    // Unsupported outside fullscreen / installed PWA — ignore.
  }
}

function resolveDomHost(node) {
  if (!node) return null;
  if (typeof node.appendChild === 'function') return node;
  // react-native-web may expose the DOM node via these fields
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
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: { facingMode: 'environment' }, audio: false },
    { video: true, audio: false },
  ];

  let lastErr;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastErr = e;
      // Ikke prøv flere varianter hvis brukeren eksplisitt nektet
      if (e?.name === 'NotAllowedError') throw e;
    }
  }
  throw lastErr || new Error('Klarte ikke starte kamera.');
}

function ScanOverlay({ title, hint, onClose, footer }) {
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.topBar}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Lukk skanner">
          <Text style={styles.closeBtnTxt}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame} />
      </View>
      <View style={styles.bottomBar}>
        <Text style={styles.hint}>{hint}</Text>
        {footer}
      </View>
    </View>
  );
}

function ManualCodeEntry({ onSubmit, onInvalid }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    const ok = onSubmit(v);
    if (ok === false) {
      onInvalid?.(v);
      return;
    }
    setValue('');
    setOpen(false);
  };

  if (!open) {
    return (
      <TouchableOpacity style={styles.manualLink} onPress={() => setOpen(true)}>
        <Text style={styles.manualLinkTxt}>Skriv strekkode manuelt</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.manualBox}>
      <TextInput
        style={styles.manualInput}
        value={value}
        onChangeText={setValue}
        placeholder="EAN / strekkode"
        placeholderTextColor="#94a3b8"
        keyboardType="number-pad"
        autoFocus
        onSubmitEditing={submit}
      />
      <TouchableOpacity style={styles.manualBtn} onPress={submit}>
        <Text style={styles.manualBtnTxt}>Bruk</Text>
      </TouchableOpacity>
    </View>
  );
}

function NativeScanner({ title, hint, permissionText, normalize, onScan, onClose, resumeKey = 0 }) {
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  useEffect(() => {
    scannedRef.current = false;
  }, [resumeKey]);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarcode = useCallback((result) => {
    if (scannedRef.current) return;
    // Noen iOS/expo-camera-versjoner har manglet `data` for EAN-13; fall tilbake til raw.
    const raw = result?.data || result?.raw || result?.rawValue || '';
    const normalized = normalize ? normalize(raw) : raw;
    if (!normalized) return;
    scannedRef.current = true;
    onScan(normalized);
  }, [normalize, onScan]);

  const handleManual = useCallback((raw) => {
    if (scannedRef.current) return false;
    const normalized = normalize ? normalize(raw) : raw;
    if (!normalized) return false;
    scannedRef.current = true;
    onScan(normalized);
    return true;
  }, [normalize, onScan]);

  const handleInvalidManual = useCallback(() => {
    Alert.alert('Ugyldig strekkode', 'Skriv en EAN-8 eller EAN-13 (vanlig strekkode på matvarer).');
  }, []);

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
        <Text style={styles.permBody}>{permissionText}</Text>
        {permission.canAskAgain ? (
          <TouchableOpacity style={styles.actionBtn} onPress={requestPermission}>
            <Text style={styles.actionBtnTxt}>Gi tilgang</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.permBody}>
            Tillat kamera i nettleser-/app-innstillinger og prøv igjen.
          </Text>
        )}
        <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
          <Text style={styles.cancelLinkTxt}>Avbryt</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.scanner}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        responsiveOrientationWhenOrientationLocked={false}
        barcodeScannerSettings={{ barcodeTypes: NATIVE_BARCODE_TYPES }}
        onBarcodeScanned={handleBarcode}
      />
      <ScanOverlay
        title={title}
        hint={hint}
        onClose={onClose}
        footer={<ManualCodeEntry onSubmit={handleManual} onInvalid={handleInvalidManual} />}
      />
    </View>
  );
}

function WebScanner({ title, hint, permissionText, normalize, onScan, onClose, resumeKey = 0 }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const stopRef = useRef(null);
  const scannedRef = useRef(false);
  const cancelledRef = useRef(false);
  const rafIdRef = useRef(null);
  const detectorLoopActiveRef = useRef(false);
  // idle | starting | live | error — first open needs a tap on iOS (getUserMedia user gesture)
  const [phase, setPhase] = useState('idle');
  const [errorInfo, setErrorInfo] = useState(null);
  const openCameraRef = useRef(null);
  const prevResumeKeyRef = useRef(resumeKey);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    detectorLoopActiveRef.current = false;
    try { stopRef.current?.(); } catch { /* ignore */ }
    stopRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
        videoRef.current.remove?.();
      } catch { /* ignore */ }
      videoRef.current = null;
    }
  }, []);

  useEffect(() => {
    scannedRef.current = false;
    cancelledRef.current = false;
    setPhase('idle');
    setErrorInfo(null);
    return () => {
      cancelledRef.current = true;
      teardown();
    };
  }, [teardown]);

  const finishScan = useCallback((raw) => {
    if (scannedRef.current) return false;
    const normalized = normalize ? normalize(raw) : raw;
    if (!normalized) return false;
    scannedRef.current = true;
    // Keep camera warm so "Skann neste" does not show the gate again.
    onScan(normalized);
    return true;
  }, [normalize, onScan]);

  const handleManual = useCallback((raw) => finishScan(raw), [finishScan]);
  const handleInvalidManual = useCallback(() => {
    Alert.alert('Ugyldig strekkode', 'Skriv en EAN-8 eller EAN-13 (vanlig strekkode på matvarer).');
  }, []);

  const startDetectorLoop = useCallback(() => {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return;
    const video = videoRef.current;
    if (!video || detectorLoopActiveRef.current) return;
    try {
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      detectorLoopActiveRef.current = true;
      const loop = async () => {
        if (cancelledRef.current || scannedRef.current) {
          detectorLoopActiveRef.current = false;
          return;
        }
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            for (const code of codes) {
              if (code?.rawValue) {
                finishScan(code.rawValue);
                detectorLoopActiveRef.current = false;
                return;
              }
            }
          }
        } catch {
          // ignore frame errors
        }
        if (!cancelledRef.current && !scannedRef.current) {
          rafIdRef.current = requestAnimationFrame(loop);
        } else {
          detectorLoopActiveRef.current = false;
        }
      };
      loop();
    } catch {
      detectorLoopActiveRef.current = false;
    }
  }, [finishScan]);

  const resumeScanning = useCallback(() => {
    // Brief lock so the same barcode still in frame is not instantly re-accepted.
    scannedRef.current = true;
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    detectorLoopActiveRef.current = false;
    const t = setTimeout(() => {
      if (cancelledRef.current) return;
      scannedRef.current = false;
      startDetectorLoop();
    }, 700);
    return () => clearTimeout(t);
  }, [startDetectorLoop]);

  useEffect(() => {
    if (prevResumeKeyRef.current === resumeKey) return undefined;
    prevResumeKeyRef.current = resumeKey;
    return resumeScanning();
  }, [resumeKey, resumeScanning]);

  const attachStream = useCallback(async (stream) => {
    // Vent kort på at host er i DOM (alltid montert i denne komponenten).
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
    video.style.transform = 'none';
    host.appendChild(video);
    videoRef.current = video;

    const stopStream = () => {
      stream?.getTracks?.().forEach((t) => t.stop());
    };

    video.srcObject = stream;
    await video.play().catch(() => {});

    const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
    const reader = new BrowserMultiFormatOneDReader();
    const controls = await reader.decodeFromStream(stream, video, (result) => {
      if (result) finishScan(result.getText());
    });

    stopRef.current = () => {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      detectorLoopActiveRef.current = false;
      try { controls?.stop?.(); } catch { /* ignore */ }
      stopStream();
    };

    startDetectorLoop();
  }, [finishScan, startDetectorLoop]);

  /**
   * Må kalles direkte fra trykk/klikk (brukeraktivering) første gang.
   * iOS Safari avviser getUserMedia startet fra useEffect / etter setTimeout.
   */
  const openCamera = useCallback(async () => {
    setErrorInfo(null);
    setPhase('starting');
    teardown();
    scannedRef.current = false;

    let stream = null;
    try {
      // Kall getUserMedia FØRST mens brukergesten fortsatt er aktiv.
      stream = await requestCameraStream();
      if (cancelledRef.current) {
        stream.getTracks?.().forEach((t) => t.stop());
        return;
      }
      await attachStream(stream);
      if (!cancelledRef.current) {
        webCameraSessionReady = true;
        setPhase('live');
      }
    } catch (e) {
      try { stream?.getTracks?.().forEach((t) => t.stop()); } catch { /* ignore */ }
      if (cancelledRef.current) return;
      setErrorInfo(friendlyWebCameraError(e));
      setPhase('error');
    }
  }, [attachStream, teardown]);

  openCameraRef.current = openCamera;

  // After first successful open in this tab, auto-start on remount when the browser allows it.
  useEffect(() => {
    if (phase !== 'idle') return undefined;
    if (!webCameraSessionReady) return undefined;
    if (needsCameraUserGesture()) return undefined;
    const t = setTimeout(() => {
      openCameraRef.current?.();
    }, 0);
    return () => clearTimeout(t);
  }, [phase]);

  const showGate = phase === 'idle' || phase === 'error';
  const info = errorInfo || {
    title: 'Klar til å skanne',
    body: permissionText || 'Trykk «Åpne kamera» for å starte. På iPhone må tilgangen startes med et trykk.',
  };

  return (
    <View style={styles.scanner}>
      {/* Stabil host — aldri unmount ved fasebytte (ellers mister vi video/stream). */}
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

      {phase === 'live' && (
        <ScanOverlay
          title={title}
          hint={hint}
          onClose={onClose}
          footer={<ManualCodeEntry onSubmit={handleManual} onInvalid={handleInvalidManual} />}
        />
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
          <View style={{ height: 16 }} />
          <ManualCodeEntry onSubmit={handleManual} onInvalid={handleInvalidManual} />
          <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
            <Text style={styles.cancelLinkTxt}>Lukk</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function BarcodeScannerModal({
  visible,
  onClose,
  onScan,
  title = 'Skann strekkode',
  hint = 'Hold strekkoden i rammen. Skanning skjer automatisk.',
  permissionText = 'Vi trenger kamera for å lese strekkoden.',
  normalize,
  /** Increment to accept another scan without remounting / showing the gate. */
  resumeKey = 0,
}) {
  const handleScan = useCallback((code) => {
    onScan?.(code);
  }, [onScan]);

  useEffect(() => {
    if (!visible) return undefined;
    lockPortrait();
    return () => {
      lockPortrait();
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      supportedOrientations={['portrait']}
      presentationStyle="fullScreen"
    >
      <View style={styles.modal}>
        {visible ? (
          Platform.OS === 'web' ? (
            <WebScanner
              title={title}
              hint={hint}
              permissionText={permissionText}
              normalize={normalize}
              onScan={handleScan}
              onClose={onClose}
              resumeKey={resumeKey}
            />
          ) : (
            <NativeScanner
              title={title}
              hint={hint}
              permissionText={permissionText}
              normalize={normalize}
              onScan={handleScan}
              onClose={onClose}
              resumeKey={resumeKey}
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'web' ? 16 : 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  frameWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: '78%',
    maxWidth: 320,
    aspectRatio: 1.6,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  bottomBar: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 10,
  },
  hint: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },
  manualLink: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 10 },
  manualLinkTxt: { color: '#93c5fd', fontWeight: '700', fontSize: 14 },
  manualBox: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  manualInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  manualBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  manualBtnTxt: { color: '#fff', fontWeight: '800' },
  center: {
    flex: 1,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gate: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  permBody: {
    color: '#cbd5e1', textAlign: 'center', lineHeight: 22,
    fontWeight: '600', marginBottom: 20,
  },
  actionBtn: {
    backgroundColor: colors.brand, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  actionBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  cancelLink: { marginTop: 16, padding: 8 },
  cancelLinkTxt: { color: '#93c5fd', fontWeight: '700' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 2,
  },
  loadingTxt: { color: '#fff', marginTop: 12, fontWeight: '600' },
});
