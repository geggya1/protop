import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  FIELD_TYPES,
  applyDrag,
  blankForm,
  duplicateField,
  fieldType,
  formFromPlainText,
  insertField,
  moveField,
} from '../../src/anbud/formBuilder';
import { deleteFormTemplate, saveFormTemplate } from '../../src/anbud/bidLibrary';
import { fileToDataUrl, generateCompanyForm } from '../../src/anbud/intakeClient';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { pickDocument } from '../../src/utils/media';
import { useColors } from '../../src/context/ThemeContext';

function DragWrap({ payload, index, onDrop, source = true, children }) {
  if (Platform.OS !== 'web') return <View>{children}</View>;
  return React.createElement('div', {
    draggable: source,
    onDragStart: (event) => {
      if (!source) return;
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('text/plain', payload);
    },
    onDragOver: (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      onDrop(event.dataTransfer.getData('text/plain'), index);
    },
    style: { display: 'block' },
  }, children);
}

function plainTextFromDataUrl(dataUrl, mimeType) {
  if (!/^text\//i.test(mimeType || '') && !/text\/plain/i.test(dataUrl || '')) return '';
  try {
    const cleaned = String(dataUrl || '').replace(/^data:[^;]+;base64,/, '');
    const binary = atob(cleaned);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

export default function FormBuilderScreen({ colors: colorsProp, state: externalState, commit: externalCommit, onPick }) {
  const themeColors = useColors();
  const colors = colorsProp || themeColors;
  const [localState, setLocalState] = useState(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (externalState) return undefined;
    let live = true;
    loadAnbudState().then((loaded) => {
      if (live) setLocalState(loaded);
    });
    return () => { live = false; };
  }, [externalState]);

  const state = externalState || localState;
  const templates = state?.formTemplates || [];
  const visible = templates.filter((row) => row.title.toLocaleLowerCase('nb-NO').includes(query.trim().toLocaleLowerCase('nb-NO')));

  async function commit(result) {
    if (!result?.ok) {
      setNote(result?.error || 'Kunne ikke lagre skjemaet.');
      return;
    }
    if (externalCommit) await externalCommit(result);
    else {
      await saveAnbudState(result.state);
      setLocalState(result.state);
    }
  }

  function openTemplate(template) {
    setDraft({
      id: template.id,
      title: template.title,
      intro: template.intro || '',
      fields: template.fields.map((field) => ({ ...field, options: (field.options || []).map((row) => ({ ...row })) })),
    });
    setSelected(0);
    setNote('');
  }

  function patchField(index, patch) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    }));
  }

  function dropOn(payload, index) {
    setDraft((current) => ({ ...current, fields: applyDrag(current.fields, payload, index) }));
    if (String(payload).startsWith('kind:')) setSelected(index);
  }

  async function save() {
    const known = new Set((state.formTemplates || []).map((row) => row.id));
    const result = saveFormTemplate(state, draft);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    await commit(result);
    const saved = draft.id
      ? result.state.formTemplates.find((row) => row.id === draft.id)
      : result.state.formTemplates.find((row) => row.title === draft.title && !known.has(row.id));
    setNote('Skjemaet er lagret på bedriften.');
    if (saved) setDraft({ ...saved, fields: saved.fields.map((field) => ({ ...field, options: (field.options || []).map((row) => ({ ...row })) })) });
  }

  async function readDocument() {
    setBusy(true);
    setNote('');
    try {
      const picked = await pickDocument({ accept: 'image/*,.pdf,.txt,.docx,application/pdf,text/plain' });
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file) {
        setBusy(false);
        return;
      }
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) {
        setNote('Kunne ikke lese filen.');
        setBusy(false);
        return;
      }
      const plain = plainTextFromDataUrl(dataUrl, file.mimeType);
      try {
        const data = await generateCompanyForm(dataUrl, file.name);
        if (data?.form?.fields?.length) {
          setDraft(data.form);
          setSelected(0);
          setNote('Skjemaet er lest fra dokumentet. Se over feltene og lagre.');
          setBusy(false);
          return;
        }
        setNote(data?.error || 'AI fant ikke et skjema.');
      } catch (err) {
        setNote(err?.message || 'AI svarte ikke.');
      }
      if (plain) {
        const local = formFromPlainText(plain, file.name?.replace(/\.[^.]+$/, '') || '');
        if (local.ok) {
          setDraft(local.form);
          setSelected(0);
          setNote('AI svarte ikke. Feltene er lest rett fra teksten. Se over dem og lagre.');
        }
      }
    } catch (err) {
      setNote(err?.message || 'Kunne ikke lese dokumentet.');
    }
    setBusy(false);
  }

  if (!state) return <Text style={{ color: colors.muted }}>Henter skjemaene …</Text>;

  if (!draft) {
    return (
      <View style={{ gap: 12 }}>
        <Text style={[styles.h, { color: colors.ink }]}>Skjema</Text>
        <Text style={{ color: colors.muted }}>
          Bygg skjemaene bedriften bruker. Dra felt inn, eller last opp et dokument så leses feltene inn.
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Søk i skjemaene"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
        <View style={styles.row}>
          <TouchableOpacity onPress={() => { setDraft(blankForm()); setSelected(0); setNote(''); }} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Nytt skjema</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={readDocument} disabled={busy} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>{busy ? 'Leser dokument …' : 'Les fra fil'}</Text>
          </TouchableOpacity>
        </View>
        {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
        {visible.map((template) => (
          <View key={template.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => openTemplate(template)} accessibilityRole="button">
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{template.title}</Text>
              <Text style={{ color: colors.muted }}>{template.fields.length} felt{template.intro ? ` · ${template.intro}` : ''}</Text>
            </TouchableOpacity>
            <View style={styles.row}>
              {onPick ? (
                <TouchableOpacity onPress={() => onPick(template.id)} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Hent inn</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => openTemplate(template)} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Bygg</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => commit(deleteFormTemplate(state, template.id))} accessibilityRole="button">
                <Text style={{ color: colors.danger }}>Slett</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {!visible.length ? <Text style={{ color: colors.muted }}>Ingen skjema treffer søket.</Text> : null}
      </View>
    );
  }

  const active = draft.fields[selected] || null;
  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity onPress={() => setDraft(null)} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>Alle skjema</Text>
      </TouchableOpacity>
      <TextInput
        value={draft.title}
        onChangeText={(title) => setDraft({ ...draft, title })}
        placeholder="Navn på skjemaet"
        placeholderTextColor={colors.placeholder}
        style={[styles.titleInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      <TextInput
        value={draft.intro}
        onChangeText={(intro) => setDraft({ ...draft, intro })}
        placeholder="Kort forklaring"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Dra et felt inn i skjemaet</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {FIELD_TYPES.map((type) => (
          <DragWrap key={type.id} payload={`kind:${type.id}`} index={draft.fields.length} onDrop={dropOn}>
            <TouchableOpacity
              onPress={() => {
                setDraft({ ...draft, fields: insertField(draft.fields, draft.fields.length, type.id) });
                setSelected(draft.fields.length);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Legg til ${type.label}`}
              style={[styles.chip, { backgroundColor: colors.sunken, borderColor: colors.line }]}
            >
              <Text style={{ color: colors.ink }}>{type.label}</Text>
            </TouchableOpacity>
          </DragWrap>
        ))}
      </ScrollView>
      {draft.fields.map((field, index) => {
        const on = index === selected;
        return (
          <DragWrap key={field.id} payload={`move:${index}`} index={index} onDrop={dropOn}>
            <TouchableOpacity
              onPress={() => setSelected(index)}
              accessibilityRole="button"
              style={[styles.card, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: colors.muted }}>{fieldType(field.kind).label}{field.required ? ' · påkrevd' : ''}</Text>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{field.label || 'Uten navn'}</Text>
              {field.help ? <Text style={{ color: colors.muted }}>{field.help}</Text> : null}
              <View style={styles.row}>
                <TouchableOpacity onPress={() => { setDraft({ ...draft, fields: moveField(draft.fields, index, index - 1) }); setSelected(Math.max(0, index - 1)); }} accessibilityRole="button" accessibilityLabel="Flytt felt opp">
                  <Text style={{ color: colors.brand }}>Opp</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setDraft({ ...draft, fields: moveField(draft.fields, index, index + 1) }); setSelected(Math.min(draft.fields.length - 1, index + 1)); }} accessibilityRole="button" accessibilityLabel="Flytt felt ned">
                  <Text style={{ color: colors.brand }}>Ned</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.muted }}>Dra kortet for å flytte</Text>
              </View>
            </TouchableOpacity>
          </DragWrap>
        );
      })}
      <DragWrap payload="" index={draft.fields.length} onDrop={dropOn} source={false}>
        <View style={[styles.drop, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
          <Text style={{ color: colors.muted }}>Slipp et felt her</Text>
        </View>
      </DragWrap>
      {active ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Feltet</Text>
          <TextInput
            value={active.label}
            onChangeText={(label) => patchField(selected, { label })}
            placeholder="Tekst på feltet"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <TextInput
            value={active.help || ''}
            onChangeText={(help) => patchField(selected, { help })}
            placeholder="Hjelpetekst"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <View style={styles.row}>
            {FIELD_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                onPress={() => patchField(selected, {
                  kind: type.id,
                  options: ['choice', 'checks', 'dropdown'].includes(type.id) && !(active.options || []).length
                    ? [{ id: `${active.id}_a`, label: 'Alternativ 1' }, { id: `${active.id}_b`, label: 'Alternativ 2' }]
                    : active.options,
                })}
                accessibilityRole="button"
                style={[styles.chip, { backgroundColor: active.kind === type.id ? colors.brand : colors.sunken }]}
              >
                <Text style={{ color: active.kind === type.id ? '#fff' : colors.ink }}>{type.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {active.kind !== 'title' ? (
            <TouchableOpacity onPress={() => patchField(selected, { required: !active.required })} accessibilityRole="checkbox" accessibilityState={{ checked: !!active.required }}>
              <Text style={{ color: colors.ink }}>{active.required ? '✓' : '○'} Påkrevd</Text>
            </TouchableOpacity>
          ) : null}
          {['choice', 'checks', 'dropdown'].includes(active.kind) ? (active.options || []).map((option, optionIndex) => (
            <TextInput
              key={option.id}
              value={option.label}
              onChangeText={(label) => {
                const options = active.options.map((row, i) => (i === optionIndex ? { ...row, label } : row));
                patchField(selected, { options });
              }}
              placeholder={`Alternativ ${optionIndex + 1}`}
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
          )) : null}
          {['choice', 'checks', 'dropdown'].includes(active.kind) ? (
            <TouchableOpacity
              onPress={() => patchField(selected, { options: [...(active.options || []), { id: `${active.id}_${active.options.length}`, label: '' }] })}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.brand }}>Legg til alternativ</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.row}>
            <TouchableOpacity onPress={() => { setDraft({ ...draft, fields: duplicateField(draft.fields, selected) }); setSelected(selected + 1); }} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Dupliser</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const fields = draft.fields.filter((_, i) => i !== selected);
                setDraft({ ...draft, fields });
                setSelected(Math.max(0, selected - 1));
              }}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.danger }}>Slett felt</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <View style={styles.row}>
        <TouchableOpacity onPress={save} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
          <Text style={{ color: '#fff' }}>Lagre skjema</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={readDocument} disabled={busy} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{busy ? 'Leser dokument …' : 'Les fra fil'}</Text>
        </TouchableOpacity>
      </View>
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 22, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  drop: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 14, alignItems: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  titleInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 22, fontWeight: '600' },
});
