import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, radius } from '../../src/theme';
import { Screen, Title, Mute, ScrollBody, BigButton } from '../../components/ui';
import ConfirmDialog, { InfoDialog } from '../../components/ConfirmDialog';
import CompactBackLink from '../../components/CompactBackLink';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import {
  listenNote, updateNote, archiveNote, deleteNote, setNoteMembers, canManageNote, isPrivateNote,
} from '../../src/utils/familyNotes';
import { notifyUsers } from '../../src/utils/notifications';

export default function NoteSettingsScreen({ noteId, onBack, onDeleted }) {
  const { familyId, uid, members, isAdmin } = useApp();
  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [pickedMembers, setPickedMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!familyId || !noteId) return undefined;
    return listenNote(familyId, noteId, (data) => {
      setNote(data);
      if (data) {
        setTitle(data.title || '');
        setPickedMembers(data.memberIds || []);
      }
    });
  }, [familyId, noteId]);

  const canManage = canManageNote(note, uid, isAdmin);

  const toggleMember = (memberUid) => {
    if (memberUid === note?.createdBy) return;
    setPickedMembers((prev) => (
      prev.includes(memberUid) ? prev.filter((id) => id !== memberUid) : [...prev, memberUid]
    ));
  };

  const save = async () => {
    if (!familyId || !noteId || !canManage) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setDialog({ title: 'Navn mangler', message: 'Gi notatet en tittel.' });
      return;
    }
    const ids = [...new Set([note.createdBy, ...pickedMembers])];
    setSaving(true);
    try {
      await updateNote(familyId, noteId, { title: trimmed });
      await setNoteMembers(familyId, noteId, ids, ids.length <= 1 ? 'private' : 'shared');
      const previous = note.memberIds || [];
      const added = ids.filter((id) => id && id !== uid && !previous.includes(id));
      if (added.length) {
        notifyUsers(added, {
          eventType: 'noteShared',
          title: 'Delt notat',
          body: trimmed,
          familyId,
          createdBy: uid,
        }).catch(() => {});
      }
      setDialog({
        title: 'Lagret ✓',
        message: 'Innstillingene for notatet er lagret.',
        onOk: () => onBack?.(),
      });
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke lagre. Prøv igjen.' });
    } finally {
      setSaving(false);
    }
  };

  const executeArchive = useCallback(async () => {
    setConfirmArchive(false);
    try {
      await archiveNote(familyId, noteId, !note?.archived);
      onBack?.();
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke endre arkivstatus.' });
    }
  }, [familyId, noteId, note?.archived, onBack]);

  const executeDelete = useCallback(async () => {
    setConfirmDelete(false);
    try {
      await deleteNote(familyId, noteId);
      onDeleted?.();
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke slette.' });
    }
  }, [familyId, noteId, onDeleted]);

  if (!note) {
    return (
      <Screen>
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <EdgeSwipeBack onBack={onBack}>
      <ScrollBody>
        <CompactBackLink onPress={onBack} label="Notat" accessibilityLabel="Tilbake til notat" />

        <Title size={22}>Notat-innstillinger</Title>
        <Mute>{note.title}</Mute>

        {!canManage && (
          <View style={styles.infoBox}>
            <Text style={styles.infoTxt}>Kun eier eller admin kan endre dette notatet.</Text>
          </View>
        )}

        <Text style={styles.label}>Tittel</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} editable={canManage} />

        <Text style={styles.label}>Deling</Text>
        <Text style={styles.hint}>Notatet er ditt.</Text>
        <View style={styles.chipRow}>
          {members.filter((m) => m.uid).map((m) => {
            const on = pickedMembers.includes(m.uid);
            const isOwner = m.uid === note.createdBy;
            return (
              <TouchableOpacity
                key={m.uid}
                disabled={!canManage || isOwner}
                onPress={() => toggleMember(m.uid)}
                style={[styles.chip, on && styles.chipOn, isOwner && styles.chipOwner, !canManage && styles.chipDisabled]}
              >
                <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>
                  {m.name}{isOwner ? ' (eier)' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.statusTxt}>
          {isPrivateNote({ ...note, memberIds: pickedMembers }) ? '🔒 Privat' : '👥 Delt'}
        </Text>

        {canManage && (
          <>
            <Text style={styles.section}>Handlinger</Text>
            <TouchableOpacity style={styles.actionRow} onPress={() => setConfirmArchive(true)}>
              <Ionicons name={note.archived ? 'arrow-undo' : 'archive-outline'} size={20} color={colors.brand} />
              <Text style={styles.actionTxt}>{note.archived ? 'Gjenopprett' : 'Arkiver'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionRow, styles.actionDanger]} onPress={() => setConfirmDelete(true)}>
              <Ionicons name="trash-outline" size={20} color="#b91c1c" />
              <Text style={[styles.actionTxt, { color: '#b91c1c' }]}>Slett permanent</Text>
            </TouchableOpacity>
            <BigButton label={saving ? 'Lagrer…' : 'Lagre endringer'} onPress={save} disabled={saving} />
            <View style={{ height: 32 }} />
          </>
        )}
      </ScrollBody>
      </EdgeSwipeBack>

      <ConfirmDialog
        visible={confirmArchive}
        title={note?.archived ? 'Gjenopprett notat' : 'Arkiver notat'}
        message={note?.archived ? 'Notatet vises igjen i hovedlisten.' : 'Notatet skjules fra hovedlisten.'}
        confirmText={note?.archived ? 'Gjenopprett' : 'Arkiver'}
        cancelText="Avbryt"
        onCancel={() => setConfirmArchive(false)}
        onConfirm={executeArchive}
        onClose={() => setConfirmArchive(false)}
      />
      <ConfirmDialog
        visible={confirmDelete}
        title="Slett notat"
        message="Notatet slettes permanent."
        confirmText="Slett"
        cancelText="Avbryt"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={executeDelete}
        onClose={() => setConfirmDelete(false)}
      />
      <InfoDialog
        visible={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        onClose={() => {
          const ok = dialog?.onOk;
          setDialog(null);
          ok?.();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '400', color: colors.ink, marginTop: 16, marginBottom: 6 },
  hint: { color: colors.muted, fontWeight: '400', fontSize: 13, marginBottom: 10 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 14, fontSize: 16, fontWeight: '400', color: colors.ink,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipOwner: { opacity: 0.85 },
  chipDisabled: { opacity: 0.6 },
  chipTxt: { fontWeight: '400', color: colors.ink, fontSize: 13 },
  chipTxtOn: { color: '#fff' },
  statusTxt: { marginTop: 10, fontWeight: '400', color: colors.muted, fontSize: 13 },
  section: {
    fontSize: 12, fontWeight: '400', color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 24, marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
    borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.line, marginBottom: 8,
  },
  actionDanger: { borderColor: '#fecaca', backgroundColor: '#fff1f2' },
  actionTxt: { flex: 1, fontWeight: '400', color: colors.ink, fontSize: 15 },
  infoBox: {
    backgroundColor: '#fff7ed', borderRadius: radius.md, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  infoTxt: { color: '#9a3412', fontWeight: '400', fontSize: 13 },
});
