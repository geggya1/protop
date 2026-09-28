import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { deleteFormTemplate, saveFormTemplate } from '../../src/anbud/bidLibrary';

const KINDS = [
  ['text', 'Kort tekst'],
  ['long', 'Lang tekst'],
  ['check', 'Avkrysning'],
];

function blankField() {
  return { id: `ny_${Math.random().toString(36).slice(2, 7)}`, label: '', kind: 'text' };
}

export default function CompanyForms({ state, colors, commit, onPick }) {
  const templates = state?.formTemplates || [];
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState('');

  function startNew() {
    setEditing({ id: '', title: '', intro: '', fields: [blankField()] });
    setNote('');
  }

  function startEdit(template) {
    setEditing({
      id: template.id,
      title: template.title,
      intro: template.intro || '',
      fields: template.fields.map((field) => ({ ...field })),
    });
    setNote('');
  }

  async function save() {
    const result = saveFormTemplate(state, editing);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    await commit(result);
    setEditing(null);
    setNote('Malen er lagret på bedriften.');
  }

  async function remove(id) {
    const result = deleteFormTemplate(state, id);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    await commit(result);
    if (editing?.id === id) setEditing(null);
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Skjema for bedriften</Text>
      <Text style={{ color: colors.muted }}>
        Standardmalene ligger på bedriften. Hent et skjema inn i tilbudet og fyll det ut der.
      </Text>
      {templates.map((template) => (
        <View key={template.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{template.title}</Text>
          {template.intro ? <Text style={{ color: colors.muted }}>{template.intro}</Text> : null}
          <Text style={{ color: colors.muted }}>{template.fields.length} felt</Text>
          <View style={styles.row}>
            {onPick ? (
              <TouchableOpacity onPress={() => onPick(template.id)} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
                <Text style={{ color: '#fff' }}>Hent inn</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => startEdit(template)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Rediger</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => remove(template.id)} accessibilityRole="button">
              <Text style={{ color: colors.danger }}>Slett</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {!editing ? (
        <TouchableOpacity onPress={startNew} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}>
          <Text style={{ color: '#fff' }}>Ny mal</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{editing.id ? 'Rediger mal' : 'Ny mal'}</Text>
          <TextInput
            value={editing.title}
            onChangeText={(title) => setEditing({ ...editing, title })}
            placeholder="Navn på malen"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <TextInput
            value={editing.intro}
            onChangeText={(intro) => setEditing({ ...editing, intro })}
            placeholder="Kort forklaring"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          {editing.fields.map((field, index) => (
            <View key={field.id} style={{ gap: 4 }}>
              <TextInput
                value={field.label}
                onChangeText={(label) => {
                  const fields = editing.fields.map((row, i) => (i === index ? { ...row, label } : row));
                  setEditing({ ...editing, fields });
                }}
                placeholder="Feltnavn"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
              />
              <View style={styles.row}>
                {KINDS.map(([id, label]) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => {
                      const fields = editing.fields.map((row, i) => (i === index ? { ...row, kind: id } : row));
                      setEditing({ ...editing, fields });
                    }}
                    accessibilityRole="button"
                    style={[styles.chip, { backgroundColor: field.kind === id ? colors.brand : colors.sunken }]}
                  >
                    <Text style={{ color: field.kind === id ? '#fff' : colors.ink }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={() => setEditing({ ...editing, fields: [...editing.fields, blankField()] })} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Legg til felt</Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <TouchableOpacity onPress={save} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff' }}>Lagre mal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditing(null)} accessibilityRole="button">
              <Text style={{ color: colors.muted }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
});
