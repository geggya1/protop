import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { deleteReviewNote, notesWithDraft, upsertReviewNote } from '../../src/anbud/reviewNotes';

export default function ReviewNotes({
  notes = [],
  colors,
  onSave,
  onDelete,
  onCollect,
  heading = 'Egne notater',
  hint = 'Notatet lagres her. Det følger med hvis dere gir tilbud, og som begrunnelse hvis dere ikke gjør det.',
}) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    onCollect?.(() => notesWithDraft(notes, draft, editingId));
  }, [notes, draft, editingId, onCollect]);

  async function save() {
    const result = upsertReviewNote(notes, { id: editingId, text: draft });
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    setLocalError('');
    setDraft('');
    setEditingId('');
    await onSave?.(result.notes);
  }

  async function remove(id) {
    const result = deleteReviewNote(notes, id);
    if (!result.ok) {
      setLocalError(result.error);
      return;
    }
    if (editingId === id) {
      setDraft('');
      setEditingId('');
    }
    setLocalError('');
    await onDelete?.(result.notes);
  }

  function edit(note) {
    setEditingId(note.id);
    setDraft(note.text);
    setLocalError('');
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{heading}</Text>
      {hint ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{hint}</Text> : null}
      {notes.map((note) => (
        <View key={note.id} style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, lineHeight: 20 }}>{note.text}</Text>
          {onSave ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => edit(note)} accessibilityRole="button" accessibilityLabel="Rediger notat">
                <Text style={{ color: colors.brand }}>Rediger</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(note.id)} accessibilityRole="button" accessibilityLabel="Slett notat">
                <Text style={{ color: colors.danger }}>Slett</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ))}
      {onSave ? (
        <View style={{ gap: 6 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="Skriv det som er viktig for vurderingen"
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Egne notater"
            style={{
              color: colors.ink,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.card,
              borderRadius: 10,
              minHeight: 72,
              paddingHorizontal: 10,
              paddingVertical: 8,
              textAlignVertical: 'top',
            }}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={save} accessibilityRole="button">
              <Text style={{ color: colors.brand, fontWeight: '600' }}>{editingId ? 'Oppdater notat' : 'Lagre notat'}</Text>
            </TouchableOpacity>
            {editingId ? (
              <TouchableOpacity
                onPress={() => { setEditingId(''); setDraft(''); setLocalError(''); }}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.muted }}>Avbryt</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {localError ? <Text style={{ color: colors.danger }}>{localError}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
