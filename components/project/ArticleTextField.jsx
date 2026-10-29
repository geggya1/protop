/**
 * Tekstfelt med verktøylinje for artikler på bedriftssiden: overskrift, fet, kursiv,
 * lister, sitat og lenke. Teksten lagres som Markdown og vises med ArticleText.
 * «Forhåndsvis» viser teksten slik besøkende ser den.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { FORMAT_ACTIONS, applyFormat } from '../../src/project/articleFormat';
import { radius, space, type } from '../../src/ui/tokens';
import ArticleText from './ArticleText';

export default function ArticleTextField({
  value,
  onChange,
  colors,
  placeholder,
  maxLength,
  minHeight = 140,
  nativeID,
}) {
  const input = useRef(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [forced, setForced] = useState(null);
  const [preview, setPreview] = useState(false);
  const text = String(value ?? '');

  function format(kind) {
    const next = applyFormat(text, selection, kind);
    if (maxLength && next.text.length > maxLength) return;
    onChange(next.text);
    setSelection(next.selection);
    setForced(next.selection);
    input.current?.focus?.();
  }

  return (
    <View style={[styles.wrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={[styles.toolbar, { borderBottomColor: colors.line, backgroundColor: colors.sunken }]}>
        {FORMAT_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.id}
            onPress={() => format(action.id)}
            disabled={preview}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={[styles.tool, preview && styles.toolOff]}
          >
            <MaterialCommunityIcons name={action.icon} size={18} color={colors.ink} />
          </TouchableOpacity>
        ))}
        <View style={styles.spacer} />
        <TouchableOpacity
          onPress={() => setPreview((on) => !on)}
          accessibilityRole="button"
          accessibilityState={{ selected: preview }}
          style={[styles.previewBtn, preview && { backgroundColor: colors.card }]}
        >
          <MaterialCommunityIcons name={preview ? 'pencil-outline' : 'eye-outline'} size={16} color={colors.brandInk || colors.brand} />
          <Text style={[type.label, { color: colors.brandInk || colors.brand }]}>{preview ? 'Skriv' : 'Forhåndsvis'}</Text>
        </TouchableOpacity>
      </View>
      {preview ? (
        <View style={[styles.preview, { minHeight }]}>
          {text.trim() ? <ArticleText text={text} colors={colors} /> : (
            <Text style={[type.body, { color: colors.muted }]}>Ingen tekst ennå.</Text>
          )}
        </View>
      ) : (
        <TextInput
          ref={input}
          nativeID={nativeID}
          value={text}
          onChangeText={onChange}
          onSelectionChange={(event) => {
            setSelection(event.nativeEvent.selection);
            if (forced) setForced(null);
          }}
          selection={forced || undefined}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          maxLength={maxLength}
          multiline
          textAlignVertical="top"
          style={[styles.input, { minHeight, color: colors.ink }]}
        />
      )}
      {maxLength && text.length > maxLength * 0.8 ? (
        <Text style={[type.caption, styles.count, { color: colors.muted }]}>{text.length} / {maxLength} tegn</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: radius.control, overflow: 'hidden' },
  toolbar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xxs,
    paddingHorizontal: space.xxs, paddingVertical: space.xxs, borderBottomWidth: 1,
  },
  tool: { width: 32, height: 32, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  toolOff: { opacity: 0.35 },
  spacer: { flexGrow: 1 },
  previewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: space.xxs,
    paddingHorizontal: space.xs, height: 32, borderRadius: radius.control,
  },
  input: { padding: space.sm, fontSize: type.body.fontSize + 1, lineHeight: 22 },
  preview: { padding: space.sm },
  count: { paddingHorizontal: space.sm, paddingBottom: space.xs, textAlign: 'right' },
});
