import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, ScrollView,
  Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, radius, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Title, Mute } from '../../components/ui';
import { InfoDialog } from '../../components/ConfirmDialog';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import {
  listenAccessibleNotes, createNote, memberSummary, isPrivateNote, notePreview,
  filterNotesForProfile, migrateVoiceNotesIntoFamily,
} from '../../src/utils/familyNotes';
import { titleFromTranscript } from '../../src/utils/voiceNotes';
import { summarizeVoiceNote } from '../../src/utils/aiVoiceNoteClient';
import { structuredNoteBody } from '../../src/utils/noteAi';
import { useVoiceDictation } from '../../src/hooks/useVoiceDictation';
import NoteEditorScreen from './NoteEditorScreen';
import NoteSettingsScreen from './NoteSettingsScreen';
import { ModulePageFrame, ModuleHubIntro } from '../../components/ModulePageBg';

export default function NotesHubScreen({ compactHeader = false, profileUid = null }) {
  const { t } = useI18n();
  const { isDesktop } = useLayout();
  const { familyId, uid, members, shellIntent, clearShellIntent } = useApp();
  const [notes, setNotes] = useState([]);
  const [archivedNotes, setArchivedNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [view, setView] = useState('hub');
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [dialog, setDialog] = useState(null);
  useHelpScene(view === 'hub' ? 'hub' : 'inner');
  const {
    recording, liveText, liveScrollRef, supported, startRecording, stopRecording,
    speechError, clearSpeechError,
  } = useVoiceDictation();

  const myName = members.find((m) => m.uid === uid)?.name || '';

  const visibleNotes = useMemo(
    () => filterNotesForProfile(notes, profileUid),
    [notes, profileUid],
  );

  const visibleArchivedNotes = useMemo(
    () => filterNotesForProfile(archivedNotes, profileUid),
    [archivedNotes, profileUid],
  );

  useEffect(() => {
    if (!familyId || !uid) return undefined;
    return listenAccessibleNotes(familyId, uid, { includeArchived: false }, (data) => {
      setNotes(data);
      setLoading(false);
    });
  }, [familyId, uid]);

  useEffect(() => {
    if (!familyId || !uid || !showArchived) return undefined;
    return listenAccessibleNotes(familyId, uid, { includeArchived: true }, (data) => {
      setArchivedNotes(data.filter((n) => n.archived));
    });
  }, [familyId, uid, showArchived]);

  useEffect(() => {
    if (!familyId || !uid) return;
    migrateVoiceNotesIntoFamily(familyId, uid, myName).catch(() => {});
  }, [familyId, uid, myName]);

  const openCreate = useCallback(() => {
    setNewTitle('');
    setCreateOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    if (creating) return;
    setCreateOpen(false);
  }, [creating]);

  const createNew = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || !familyId) return;
    setCreating(true);
    try {
      const ref = await createNote(familyId, uid, title, myName, profileUid);
      setNewTitle('');
      setCreateOpen(false);
      setActiveNoteId(ref.id);
      setView('editor');
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke opprette notat.' });
    } finally {
      setCreating(false);
    }
  }, [familyId, uid, newTitle, myName, profileUid]);

  const finishFromTranscript = useCallback(async (transcript, durationMs = 0) => {
    const raw = String(transcript || '').trim();
    if (!raw) {
      setDialog({ title: 'Tomt notat', message: 'Ingen tale ble fanget opp. Prøv igjen eller skriv notatet.' });
      return;
    }
    if (!familyId || !uid) return;
    setProcessing(true);
    let body = raw;
    let title = titleFromTranscript(raw);
    let summary = raw.slice(0, 280);
    try {
      const ai = await summarizeVoiceNote({ transcript: raw, familyId });
      body = structuredNoteBody({
        title: ai.title,
        summary: ai.summary,
        body: ai.body,
      }) || raw;
      title = ai.title || title;
      summary = ai.summary || body.slice(0, 280);
    } catch {
      // Behold råtranskripsjon — bedre å lagre det som ble sagt enn å miste notatet.
    }
    try {
      const ref = await createNote(
        familyId,
        uid,
        title,
        myName,
        profileUid,
        {
          body,
          source: 'voice',
          transcript: raw,
          summary,
          keyPoints: [],
          durationMs,
        },
      );
      setActiveNoteId(ref.id);
      setView('editor');
    } catch (e) {
      setDialog({ title: 'Feil', message: e?.message || 'Klarte ikke lagre notatet.' });
    } finally {
      setProcessing(false);
    }
  }, [familyId, uid, myName, profileUid]);

  const onMic = useCallback(async () => {
    setCreateOpen(false);
    const res = await startRecording();
    if (!res?.ok) setManualOpen(true);
  }, [startRecording]);

  const onStop = useCallback(async () => {
    const result = await stopRecording();
    await finishFromTranscript(result.transcript, result.durationMs);
  }, [stopRecording, finishFromTranscript]);

  useEffect(() => {
    if (!speechError) return;
    setDialog({
      title: 'Opptak',
      message: speechError.message || 'Opptak feilet. Prøv igjen eller skriv notatet.',
    });
    setManualOpen(true);
    clearSpeechError();
  }, [speechError, clearSpeechError]);

  const saveManual = async () => {
    const text = manualText.trim();
    if (!text) return;
    setManualOpen(false);
    setManualText('');
    await finishFromTranscript(text, 0);
  };

  useEffect(() => {
    if (shellIntent !== 'create' || !familyId || !uid) return;
    clearShellIntent?.();
    setCreateOpen(true);
  }, [shellIntent, familyId, uid, clearShellIntent]);

  const busy = recording || processing;
  const showInlineAdd = !createOpen && !busy && !manualOpen && view === 'hub';
  const shellNoteBtn = useMemo(() => {
    if (!showInlineAdd) return null;
    return <ShellAddButton label="Nytt notat" onPress={openCreate} />;
  }, [isDesktop, showInlineAdd, openCreate]);
  useShellTitleRight(shellNoteBtn, { active: view === 'hub' });

  if (view === 'editor' && activeNoteId) {
    return (
      <NoteEditorScreen
        noteId={activeNoteId}
        onBack={() => { setView('hub'); setActiveNoteId(null); }}
        onOpenSettings={() => setView('settings')}
      />
    );
  }

  if (view === 'settings' && activeNoteId) {
    return (
      <NoteSettingsScreen
        noteId={activeNoteId}
        onBack={() => setView('editor')}
        onDeleted={() => { setView('hub'); setActiveNoteId(null); }}
      />
    );
  }

  const renderNote = ({ item }) => (
    <TouchableOpacity
      style={[styles.noteRow, isDesktop && styles.noteRowDesk]}
      onPress={() => { setActiveNoteId(item.id); setView('editor'); }}
      activeOpacity={0.75}
    >
      <View style={[styles.noteIcon, isDesktop && styles.noteIconDesk]}>
        <Ionicons
          name={item.source === 'voice' ? 'mic' : 'document-text'}
          size={isDesktop ? 16 : 20}
          color={colors.brand}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.noteTitle, isDesktop && styles.noteTitleDesk]} numberOfLines={1}>
          {item.title || 'Uten tittel'}
        </Text>
        <Text style={[styles.notePreview, isDesktop && styles.notePreviewDesk]} numberOfLines={isDesktop ? 1 : 2}>
          {notePreview(item.body || item.summary)}
        </Text>
        <Text style={[styles.noteMeta, isDesktop && styles.noteMetaDesk]} numberOfLines={1}>
          {item.source === 'voice' ? 'Opptak · ' : ''}
          {isPrivateNote(item) ? 'Privat' : 'Delt'}
          {item.createdByName ? ` · ${item.createdByName}` : ''}
          {!isPrivateNote(item) ? ` · ${memberSummary(item, members)}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );

  return (
    <Screen>
      <ModulePageFrame name="notes">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.hub, isDesktop && styles.hubDesk]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <ModuleHubIntro>
        {!compactHeader && (
          <>
            <Title size={22}>{t('tabs.notes')}</Title>
            <Mute>Skriv eller ta opp — AI skriver det pent om for deg.</Mute>
          </>
        )}
        </ModuleHubIntro>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : (
          <View style={[styles.listCard, isDesktop && styles.listCardDesk]}>
            <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
              Mine notater
            </Text>
            {visibleNotes.length === 0 ? (
              <Text style={styles.emptyInline}>
                {profileUid
                  ? 'Ingen notater for denne profilen ennå.'
                  : 'Ingen notater ennå. Opprett ett, eller ta opp med mikrofon.'}
              </Text>
            ) : (
              visibleNotes.map((item, i) => (
                i === 0 ? (
                  <HelpTarget
                    key={item.id}
                    id="content"
                    onAdvance={() => { setActiveNoteId(item.id); setView('editor'); }}
                  >
                    {renderNote({ item })}
                  </HelpTarget>
                ) : (
                  <View key={item.id}>{renderNote({ item })}</View>
                )
              ))
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.archiveToggle, isDesktop && styles.archiveToggleDesk]}
          onPress={() => setShowArchived(!showArchived)}
        >
          <Ionicons name="archive-outline" size={16} color={colors.brand} />
          <Text style={[styles.archiveToggleTxt, isDesktop && styles.archiveToggleTxtDesk]}>
            {showArchived ? 'Skjul arkiverte' : 'Vis arkiverte notater'}
          </Text>
        </TouchableOpacity>

        {showArchived && (
          <View style={[styles.listCard, isDesktop && styles.listCardDesk, { marginTop: 4 }]}>
            <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
              Arkiverte
            </Text>
            {visibleArchivedNotes.length === 0 ? (
              <Text style={styles.emptyInline}>Ingen arkiverte notater.</Text>
            ) : (
              visibleArchivedNotes.map((item) => (
                <View key={`arch-${item.id}`}>{renderNote({ item })}</View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={createOpen} animationType={isDesktop ? 'fade' : 'slide'} transparent onRequestClose={closeCreate}>
        <Pressable style={[styles.modalBackdrop, isDesktop && desktopOverlay]} onPress={closeCreate}>
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onPress={() => {}}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>Nytt notat</Text>
            <TextInput
              style={[styles.modalInput, isDesktop && styles.modalInputDesk]}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Tittel…"
              onSubmitEditing={createNew}
              returnKeyType="done"
              autoFocus
            />
            <TouchableOpacity
              style={styles.voiceRow}
              onPress={onMic}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Ta opp notat"
            >
              <Ionicons name="mic" size={20} color={colors.brand} />
              <Text style={styles.voiceRowTxt}>Eller ta opp med mikrofon</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, isDesktop && styles.modalBtnDesk]}
                onPress={closeCreate}
                disabled={creating}
              >
                <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, isDesktop && styles.modalBtnDesk, (!newTitle.trim() || creating) && { opacity: 0.5 }]}
                onPress={createNew}
                disabled={!newTitle.trim() || creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryBtnTxt}>Opprett</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {busy && (
        <View style={styles.recordingPanel}>
          {recording ? (
            <>
              <View style={styles.recordingHeader}>
                <View style={styles.pulse} />
                <Text style={styles.recordingLbl}>Tar opp — AI skriver det pent om når du stopper</Text>
                <TouchableOpacity style={styles.stopBtn} onPress={onStop} accessibilityRole="button">
                  <Ionicons name="stop" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
              <ScrollView
                ref={liveScrollRef}
                style={styles.liveScroll}
                contentContainerStyle={{ paddingBottom: 4 }}
                showsVerticalScrollIndicator
              >
                <Text style={styles.recordingTxt}>{liveText || 'Lytter…'}</Text>
              </ScrollView>
            </>
          ) : (
            <View style={styles.processingRow}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.processingTxt}>AI skriver om notatet…</Text>
            </View>
          )}
        </View>
      )}

      {manualOpen ? (
        <View style={styles.manualBackdrop}>
          <View style={styles.manualCard}>
            <Text style={styles.manualTitle}>Skriv eller lim inn</Text>
            <Mute style={{ marginBottom: 10 }}>
              {supported
                ? 'Lim inn tekst, så rydder AI opp.'
                : 'Talegjenkjenning er ikke tilgjengelig her. Skriv eller lim inn, så rydder AI opp.'}
            </Mute>
            <TextInput
              style={styles.manualInput}
              multiline
              value={manualText}
              onChangeText={setManualText}
              placeholder="Skriv notatet…"
            />
            <View style={styles.manualActions}>
              <TouchableOpacity onPress={() => { setManualOpen(false); setManualText(''); }}>
                <Text style={styles.cancelTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveManualBtn} onPress={saveManual}>
                <Text style={styles.saveManualTxt}>Rydd opp med AI</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      <InfoDialog
        visible={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        onClose={() => setDialog(null)}
      />
      </ModulePageFrame>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bgWrap: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 10,
    zIndex: 0,
  },
  bgArt: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  hub: { flex: 1, padding: 16, gap: 12 },
  hubDesk: { padding: 12, gap: 10 },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  listCardDesk: { borderRadius: 8, padding: 10 },
  listSection: {
    fontWeight: '600',
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  listSectionDesk: { fontWeight: '500', fontSize: 11, marginBottom: 6 },
  emptyInline: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 13,
    paddingVertical: 10,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  noteRowDesk: { paddingVertical: 8, gap: 8 },
  noteIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  noteIconDesk: { width: 32, height: 32, borderRadius: 7 },
  noteTitle: { fontWeight: '600', fontSize: 15, color: colors.ink },
  noteTitleDesk: { fontWeight: '500', fontSize: 14 },
  notePreview: { color: colors.muted, fontWeight: '400', fontSize: 13, marginTop: 2 },
  notePreviewDesk: { fontSize: 12 },
  noteMeta: { color: colors.muted, fontWeight: '400', fontSize: 11, marginTop: 3 },
  noteMetaDesk: { fontSize: 11, marginTop: 2 },
  deskAddWrap: { marginBottom: 2, alignSelf: 'flex-start' },
  archiveToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10,
  },
  archiveToggleDesk: { justifyContent: 'flex-start', paddingVertical: 6 },
  archiveToggleTxt: { fontWeight: '600', color: colors.brand, fontSize: 13 },
  archiveToggleTxtDesk: { fontWeight: '500', fontSize: 12 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 28,
  },
  modalSheetDesk: {
    maxWidth: 420, width: '100%',
    borderRadius: 12, marginBottom: 0, padding: 18, paddingBottom: 18,
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 14,
  },
  modalTitle: { fontWeight: '700', fontSize: 18, color: colors.ink, marginBottom: 12 },
  modalTitleDesk: { fontWeight: '500', fontSize: 16, marginBottom: 10 },
  modalInput: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontWeight: '500', color: colors.ink, marginBottom: 12,
  },
  modalInputDesk: { paddingVertical: 8, fontSize: 14, borderRadius: 8, fontWeight: '400' },
  voiceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, marginBottom: 12,
  },
  voiceRowTxt: { fontWeight: '500', color: colors.brand, fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '600' },
  secondaryBtn: {
    flex: 1, backgroundColor: colors.brandSoft, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '600' },
  modalBtnDesk: { paddingVertical: 10, borderRadius: 8 },
  recordingPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    maxHeight: '45%',
  },
  recordingHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  recordingLbl: { flex: 1, fontWeight: '600', color: colors.ink, fontSize: 13 },
  liveScroll: { maxHeight: 160 },
  pulse: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#ef4444' },
  recordingTxt: { fontWeight: '500', color: colors.ink, fontSize: 15, lineHeight: 22 },
  stopBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
  },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  processingTxt: { flex: 1, fontWeight: '500', color: colors.brand },
  manualBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20,
  },
  manualCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: 20, maxWidth: 480, alignSelf: 'center', width: '100%',
  },
  manualTitle: { fontWeight: '600', fontSize: 18, marginBottom: 4 },
  manualInput: {
    minHeight: 120, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 12, fontSize: 16, textAlignVertical: 'top', marginBottom: 14,
  },
  manualActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, alignItems: 'center' },
  cancelTxt: { color: colors.muted, fontWeight: '600' },
  saveManualBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
  saveManualTxt: { color: '#fff', fontWeight: '600' },
});
