import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSpeechRecognizer, speechRecognitionSupported,
} from '../utils/voiceRecording';

/**
 * Diktering med live transkripsjon (web Speech API).
 * Kjører IKKE MediaRecorder parallelt — på iPad/iOS henger appen når
 * getUserMedia/MediaRecorder og SpeechRecognition kjemper om mikrofonen.
 * Lydblob ble uansett ikke brukt i notat-flyten (kun transcript).
 */
export function useVoiceDictation() {
  const [recording, setRecording] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [speechError, setSpeechError] = useState(null);
  const recRef = useRef(null);
  const segmentsRef = useRef([]);
  const liveTextRef = useRef('');
  const liveScrollRef = useRef(null);
  const recordingRef = useRef(false);

  useEffect(() => {
    liveTextRef.current = liveText;
    if (recording && liveText) {
      requestAnimationFrame(() => {
        try {
          liveScrollRef.current?.scrollToEnd?.({ animated: true });
        } catch { /* ignore scroll errors on some WebViews */ }
      });
    }
  }, [liveText, recording]);

  const clearSpeechError = useCallback(() => setSpeechError(null), []);

  const startRecording = useCallback(async () => {
    if (!speechRecognitionSupported()) return { ok: false, reason: 'unsupported' };
    // Rydd eventuell forrige økt
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    recRef.current = null;
    setSpeechError(null);

    const rec = createSpeechRecognizer({
      onPartial: (text, segs) => {
        liveTextRef.current = text;
        setLiveText(text);
        segmentsRef.current = segs;
      },
      onError: (info) => {
        recordingRef.current = false;
        setRecording(false);
        recRef.current = null;
        setSpeechError(info);
      },
    });
    if (!rec) return { ok: false, reason: 'unsupported' };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
      return { ok: false, reason: 'start-failed' };
    }
    recordingRef.current = true;
    setRecording(true);
    setLiveText('');
    liveTextRef.current = '';
    segmentsRef.current = [];
    return { ok: true };
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current && !recRef.current) {
      return { transcript: '', segments: [], durationMs: 0 };
    }
    recordingRef.current = false;
    setRecording(false);
    const rec = recRef.current;
    recRef.current = null;

    let result = {
      transcript: liveTextRef.current,
      segments: segmentsRef.current,
      durationMs: 0,
    };
    try {
      if (rec?.stop) result = await rec.stop();
    } catch {
      // keep fallback from refs
    }

    const transcript = (result.transcript || liveTextRef.current || '').trim();
    const segs = result.segments?.length
      ? result.segments
      : (transcript ? [{ atMs: 0, text: transcript }] : segmentsRef.current);
    setLiveText('');
    segmentsRef.current = [];
    return { transcript, segments: segs, durationMs: result.durationMs || 0 };
  }, []);

  useEffect(() => () => {
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
  }, []);

  return {
    recording,
    liveText,
    liveScrollRef,
    speechError,
    clearSpeechError,
    supported: speechRecognitionSupported(),
    startRecording,
    stopRecording,
  };
}
