import { Platform } from 'react-native';
import { detectAppleMobileWeb, isAppleMobileWeb } from './appleMobileWeb';
import {
  isTransientSpeechError,
  speechErrorInfo,
} from './speechErrors';

export { detectAppleMobileWeb, isAppleMobileWeb };
export {
  isTransientSpeechError,
  isFatalSpeechError,
  speechErrorMessage,
  speechErrorInfo,
} from './speechErrors';

/** Web Speech API dictation — returns transcript chunks with timestamps. */
export function createSpeechRecognizer({
  lang = 'nb-NO', onPartial, onSegment, onError,
} = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  const rec = new SR();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  let startMs = Date.now();
  let segments = [];
  let interimText = '';
  let stopResolve = null;
  let stopTimer = null;
  let intentionalStop = false;
  let active = false;
  let fatalEnded = false;

  const buildTranscript = () => {
    const full = segments.map((s) => s.text).join(' ').trim();
    if (interimText) return full ? `${full} ${interimText}`.trim() : interimText;
    return full;
  };

  const finishStop = () => {
    if (!stopResolve) return;
    const resolve = stopResolve;
    stopResolve = null;
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    resolve({
      segments: [...segments],
      transcript: buildTranscript(),
      durationMs: Date.now() - startMs,
    });
  };

  const endFatally = (code) => {
    if (fatalEnded) return;
    fatalEnded = true;
    intentionalStop = true;
    active = false;
    const info = speechErrorInfo(code);
    try { onError?.(info); } catch { /* ignore UI errors */ }
    finishStop();
  };

  const safeRestart = () => {
    if (!active || intentionalStop || fatalEnded) return;
    // iPad/iOS avslutter continuous recognition ofte midt i økten — restart.
    try {
      rec.start();
    } catch {
      setTimeout(() => {
        if (!active || intentionalStop || fatalEnded) return;
        try { rec.start(); } catch { /* ignore */ }
      }, 250);
    }
  };

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const res = event.results[i];
      const text = res[0]?.transcript || '';
      if (res.isFinal) {
        const atMs = Date.now() - startMs;
        const seg = { atMs, text: text.trim() };
        if (seg.text) {
          segments.push(seg);
          onSegment?.(seg);
        }
      } else {
        interim += text;
      }
    }
    interimText = interim.trim();
    onPartial?.(buildTranscript(), [...segments]);
  };

  rec.onend = () => {
    if (intentionalStop || fatalEnded) {
      active = false;
      finishStop();
      return;
    }
    safeRestart();
  };

  rec.onerror = (event) => {
    const err = event?.error || '';
    // no-speech / aborted / network er vanlige midt i continuous — ikke avslutt økten.
    if (!intentionalStop && isTransientSpeechError(err)) {
      return;
    }
    if (intentionalStop) {
      finishStop();
      return;
    }
    // not-allowed, audio-capture, language-not-supported, … — stopp og si ifra.
    endFatally(err);
  };

  return {
    start() {
      startMs = Date.now();
      segments = [];
      interimText = '';
      stopResolve = null;
      intentionalStop = false;
      fatalEnded = false;
      active = true;
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      try { rec.start(); } catch { /* already started */ }
    },
    stop() {
      return new Promise((resolve) => {
        const snapshot = {
          segments: [...segments],
          transcript: buildTranscript(),
          durationMs: Date.now() - startMs,
        };
        if (stopResolve) {
          resolve(snapshot);
          return;
        }
        if (fatalEnded || !active) {
          resolve(snapshot);
          return;
        }
        intentionalStop = true;
        active = false;
        stopResolve = resolve;
        try {
          rec.stop();
        } catch {
          finishStop();
          return;
        }
        // Fallback if onend never fires (some browsers)
        stopTimer = setTimeout(finishStop, 2000);
      });
    },
    abort() {
      intentionalStop = true;
      active = false;
      fatalEnded = true;
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      stopResolve = null;
      try { rec.abort(); } catch { /* ignore */ }
    },
  };
}

export function speechRecognitionSupported() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return '';
  }
  const candidates = [
    'audio/mp4',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

/**
 * Optional audio blob recording (web).
 * NB: Do NOT run alongside SpeechRecognition on iOS/iPad — one mic session only.
 */
export function createAudioRecorder() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  if (typeof MediaRecorder === 'undefined') return null;

  let mediaRecorder = null;
  let stream = null;
  let chunks = [];

  const releaseStream = () => {
    try {
      stream?.getTracks?.().forEach((t) => t.stop());
    } catch { /* ignore */ }
    stream = null;
  };

  return {
    async start() {
      // Unngå dobbel mic-capture på iPad/iPhone (henger UI når SpeechRecognition også kjører).
      if (isAppleMobileWeb()) {
        return null;
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      const mimeType = pickRecorderMimeType();
      try {
        mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch (e) {
        releaseStream();
        mediaRecorder = null;
        throw e;
      }
      mediaRecorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      // Uten timeslice på Safari — timeslice har vært ustabil der.
      mediaRecorder.start();
      return stream;
    },
    stop() {
      return new Promise((resolve) => {
        if (!mediaRecorder) {
          releaseStream();
          resolve(null);
          return;
        }
        const mime = mediaRecorder.mimeType || pickRecorderMimeType() || 'audio/webm';
        mediaRecorder.onstop = () => {
          const blob = chunks.length ? new Blob(chunks, { type: mime }) : null;
          releaseStream();
          mediaRecorder = null;
          resolve(blob);
        };
        try {
          mediaRecorder.stop();
        } catch {
          releaseStream();
          mediaRecorder = null;
          resolve(null);
        }
      });
    },
  };
}
