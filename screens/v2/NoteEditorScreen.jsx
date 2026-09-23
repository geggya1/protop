import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, radius } from '../../src/theme';
import { Screen } from '../../components/ui';
import { InfoDialog } from '../../components/ConfirmDialog';
import CompactBackLink from '../../components/CompactBackLink';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import { listenNote, updateNote, canManageNote } from '../../src/utils/familyNotes';
import { summarizeVoiceNote } from '../../src/utils/aiVoiceNoteClient';
import { structuredNoteBody } from '../../src/utils/noteAi';
import { useVoiceDictation } from '../../src/hooks/useVoiceDictation';
import HelpTarget from '../../components/HelpTarget';
import { useHelpScene } from '../../src/hooks/useHelpScene';

function FormatBtn({ label, onPress, bold }) {
  return (
    <TouchableOpacity style={styles.fmtBtn} onPress={onPress} accessibilityLabel={label}>
      <Text style={[styles.fmtTxt, bold && styles.fmtBold]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function NoteEditorScreen({ noteId, onBack, onOpenSettings }) {
  const { familyId, uid, isAdmin } = useApp();
  useHelpScene('inner', { onRetreat: onBack });
  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const bodyRef = useRef(null);
  const initedRef = useRef(false);
  const {
    recording, liveText, startRecording, stopRecording,
    speechError, clearSpeechError,
  } = useVoiceDictation();

  useEffect(() => {
    initedRef.current = false;
    if (!familyId || !noteId) return undefined;
    return listenNote(familyId, noteId, (data) => {
      setNote(data);
      if (data && !initedRef.current) {
        setTitle(data.title || '');
        setBody(data.body || '');
        initedRef.current = true;
      }
    });
  }, [familyId, noteId]);

  const applyWrap = useCallback((before, after = before) => {
    const { start, end } = selection;
    const selected = body.slice(start, end);
    const wrapped = `${before}${selected || 'tekst'}${after}`;
    const next = body.slice(0, start) + wrapped + body.slice(end);
    setBody(next);
  }, [body, selection]);

  const applyLinePrefix = useCallback((prefix) => {
    const { start } = selection;
    const lineStart = body.lastIndexOf('\n', start - 1) + 1;
    const next = `${body.slice(0, lineStart)}${prefix}${body.slice(lineStart)}`;
    setBody(next);
  }, [body, selection]);

  const applyAiStructure = useCallback(async (rawText, { appendTranscript } = {}) => {
    const source = String(rawText || '').trim();
    if (!source) {
      setDialog({ title: 'Tomt notat', message: 'Skriv eller ta opp noe først, så kan AI rydde opp.' });
      return;
    }
    setAiBusy(true);
    let nextBody = source;
    let nextTitle = title;
    let summary = source.slice(0, 280);
    let aiOk = false;
    try {
      const ai = await summarizeVoiceNote({ transcript: source, familyId });
      nextBody = structuredNoteBody({
        title: ai.title,
        summary: ai.summary,
        body: ai.body,
      }) || source;
      if (ai.title) nextTitle = ai.title;
      summary = ai.summary || nextBody.slice(0, 280);
      aiOk = true;
    } catch {
      // Behold råtekst hvis AI feiler.
    }
    try {
      if (aiOk && nextTitle) setTitle(nextTitle);
      setBody(nextBody);
      await updateNote(familyId, noteId, {
        title: (nextTitle || title || 'Uten tittel').trim(),
        body: nextBody,
        summary,
        keyPoints: [],
        transcript: note?.transcript || (appendTranscript ? source : ''),
        source: note?.source || (appendTranscript ? 'voice' : 'text'),
      });
      setDialog({
        title: aiOk ? 'Skrevet om ✓' : 'Lagret uten AI',
        message: aiOk
          ? 'AI har skrevet notatet pent om. Du kan redigere videre.'
          : 'Teksten er lagret. AI-omskriving feilet — prøv «Rydd opp med AI» senere.',
      });
    } catch (e) {
      setDialog({ title: 'Feil', message: e?.message || 'Klarte ikke lagre notatet.' });
    } finally {
      setAiBusy(false);
    }
  }, [familyId, noteId, note, title]);

  const onMic = useCallback(async () => {
    const res = await startRecording();
    if (!res?.ok) {
      setDialog({
        title: 'Opptak',
        message: 'Talegjenkjenning er ikke tilgjengelig her. Lim inn tekst og trykk «Rydd opp med AI».',
      });
    }
  }, [startRecording]);

  const onStopMic = useCallback(async () => {
    const result = await stopRecording();
    const spoken = String(result.transcript || '').trim();
    if (!spoken) {
      setDialog({ title: 'Tomt opptak', message: 'Ingen tale ble fanget opp.' });
      return;
    }
    const combined = [body.trim(), spoken].filter(Boolean).join('\n\n');
    await applyAiStructure(combined, { appendTranscript: true });
  }, [stopRecording, body, applyAiStructure]);

  useEffect(() => {
    if (!speechError) return;
    setDialog({
      title: 'Opptak',
      message: speechError.message || 'Opptak feilet. Prøv igjen eller skriv notatet.',
    });
    clearSpeechError();
  }, [speechError, clearSpeechError]);

  const save = async () => {
    if (!familyId || !noteId) return;
    setSaving(true);
    try {
      await updateNote(familyId, noteId, {
        title: title.trim() || 'Uten tittel',
        body,
      });
      setDialog({ title: 'Lagret ✓', message: 'Notatet er lagret.' });
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke lagre notatet. Prøv igjen.' });
    } finally {
      setSaving(false);
    }
  };

  const canManage = canManageNote(note, uid, isAdmin);

  return (
    <Screen>
      <EdgeSwipeBack onBack={onBack}>
      <View style={styles.header}>
        <CompactBackLink onPress={onBack} label="Notater" accessibilityLabel="Alle notater" />
        <View style={styles.headerActions}>
          {canManage && onOpenSettings && (
            <TouchableOpacity style={styles.iconBtn} onPress={onOpenSettings}>
              <Ionicons name="settings-outline" size={20} color={colors.brand} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            <Text style={styles.saveTxt}>{saving ? 'Lagrer…' : 'Lagre'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Tittel"
          multiline={false}
        />

        <View style={styles.toolbar}>
          <FormatBtn label="B" bold onPress={() => applyWrap('**', '**')} />
          <FormatBtn label="I" onPress={() => applyWrap('*', '*')} />
          <FormatBtn label="•" onPress={() => applyLinePrefix('- ')} />
          <FormatBtn label="H" onPress={() => applyLinePrefix('## ')} />
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.fmtBtn, styles.aiBtn, (aiBusy || recording) && { opacity: 0.5 }]}
            onPress={onMic}
            disabled={aiBusy || recording}
            accessibilityLabel="Ta opp"
          >
            <Ionicons name="mic" size={16} color={colors.brand} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fmtBtn, styles.aiBtn, (aiBusy || recording || !body.trim()) && { opacity: 0.5 }]}
            onPress={() => applyAiStructure(body)}
            disabled={aiBusy || recording || !body.trim()}
            accessibilityLabel="Rydd opp med AI"
          >
            {aiBusy ? (
              <ActivityIndicator color={colors.brand} size="small" />
            ) : (
              <>
                <Ionicons name="sparkles" size={14} color={colors.brand} />
                <Text style={styles.aiBtnTxt}>AI</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <HelpTarget id="input">
          <TextInput
            ref={bodyRef}
            style={styles.bodyInput}
            value={body}
            onChangeText={setBody}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            placeholder="Skriv notatet ditt her…"
            multiline
            textAlignVertical="top"
            autoCapitalize="sentences"
          />
        </HelpTarget>

        <Text style={styles.hint}>
          Ta opp eller skriv fritt, og trykk AI for å transkribere, oppsummere og strukturere. **fet**, *kursiv*, - liste, ## overskrift.
        </Text>
      </ScrollView>

      {recording ? (
        <View style={styles.recordingBar}>
          <View style={styles.pulse} />
          <Text style={styles.recordingTxt} numberOfLines={2}>{liveText || 'Lytter…'}</Text>
          <TouchableOpacity style={styles.stopBtn} onPress={onStopMic}>
            <Ionicons name="stop" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}

      <InfoDialog
        visible={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        onClose={() => setDialog(null)}
      />
      </EdgeSwipeBack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line,
    backgroundColor: colors.card,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
  },
  saveBtn: { backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  body: { padding: 16, paddingBottom: 40 },
  titleInput: {
    fontSize: 24, fontWeight: '900', color: colors.ink, marginBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 8,
  },
  toolbar: {
    flexDirection: 'row', gap: 8, marginBottom: 10, backgroundColor: '#f8fafc',
    borderRadius: radius.md, padding: 8, borderWidth: 1, borderColor: colors.line,
  },
  fmtBtn: {
    minWidth: 40, height: 40, borderRadius: 8, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 10,
  },
  fmtTxt: { fontWeight: '700', color: colors.brand, fontSize: 16 },
  fmtBold: { fontWeight: '900' },
  aiBtn: { flexDirection: 'row', gap: 4, minWidth: 44, paddingHorizontal: 8 },
  aiBtnTxt: { fontWeight: '800', color: colors.brand, fontSize: 12 },
  bodyInput: {
    minHeight: Platform.OS === 'web' ? 320 : 280,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 14, fontSize: 16, lineHeight: 24, fontWeight: '500', color: colors.ink,
  },
  hint: { marginTop: 10, color: colors.muted, fontSize: 12, fontWeight: '600' },
  recordingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line,
    backgroundColor: colors.card,
  },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  recordingTxt: { flex: 1, fontWeight: '600', color: colors.ink, fontSize: 14 },
  stopBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
  },
});
