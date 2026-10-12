import React from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { fieldType } from '../../src/anbud/formBuilder';

function signatureField(field) {
  return field?.kind === 'image' && /signatur|underskrift/i.test(`${field.label || ''} ${field.review || ''}`);
}

export default function FormAnswer({ field, colors, onChange, onPickFile, variant = 'stacked' }) {
  const doc = variant === 'document';
  if (field?.kind === 'note') {
    return <Text style={[styles.note, { color: colors.ink }]}>{field.label}</Text>;
  }
  if (!field || field.kind === 'title') {
    return <Text style={[doc ? styles.docSection : styles.title, { color: colors.ink, borderBottomColor: colors.line }]}>{field?.label}</Text>;
  }
  const label = `${field.label}${field.required ? ' *' : ''}`;
  if (doc && signatureField(field)) {
    return (
      <View style={styles.signature}>
        <View style={[styles.signLine, { borderBottomColor: colors.ink }]} />
        <Text style={[styles.docLabel, { color: colors.ink }]}>{label}</Text>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
        <TouchableOpacity onPress={() => onPickFile(field)} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontSize: 13 }}>Last opp signatur</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (field.kind === 'check') {
    return (
      <TouchableOpacity onPress={() => onChange(!field.value)} accessibilityRole="checkbox" accessibilityState={{ checked: !!field.value }} style={doc ? styles.docCheck : undefined}>
        <Text style={{ color: colors.ink }}>{field.value ? '☑' : '☐'} {label}</Text>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
      </TouchableOpacity>
    );
  }
  if (field.kind === 'choice' || field.kind === 'dropdown' || field.kind === 'checks') {
    const many = field.kind === 'checks';
    const selected = many ? (field.value || []) : field.value;
    return (
      <View style={{ gap: doc ? 6 : 4 }}>
        <Text style={[doc ? styles.docLabel : null, { color: colors.ink }]}>{label}</Text>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
        <View style={doc ? styles.docOptions : { gap: 4 }}>
        {(field.options || []).map((option) => {
          const on = many ? selected.includes(option.id) : selected === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => {
                if (!many) onChange(option.id);
                else onChange(on ? selected.filter((id) => id !== option.id) : [...selected, option.id]);
              }}
              accessibilityRole={many ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: on }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.ink }}>{on ? (many ? '☑' : '◉') : (many ? '☐' : '○')} {option.label}</Text>
                {option.image ? <Image source={{ uri: option.image }} style={styles.optionImage} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
        {field.other ? (
          <TextInput
            value={many
              ? String((selected || []).find((id) => String(id).startsWith('other:')) || '').slice(6)
              : (String(selected || '').startsWith('other:') ? String(selected).slice(6) : '')}
            onChangeText={(next) => {
              if (!many) onChange(next ? `other:${next}` : '');
              else {
                const kept = (selected || []).filter((id) => !String(id).startsWith('other:'));
                onChange(next ? [...kept, `other:${next}`] : kept);
              }
            }}
            placeholder="Annet"
            placeholderTextColor={colors.placeholder}
            style={[doc ? styles.docInput : styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: doc ? 'transparent' : colors.card }]}
          />
        ) : null}
        </View>
      </View>
    );
  }
  if (field.kind === 'scale') {
    const max = field.scaleMax || 5;
    const current = String(field.value || '');
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.ink }}>{label}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: max }, (_, i) => String(i + 1)).map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => onChange(n)}
              accessibilityRole="radio"
              accessibilityState={{ checked: current === n }}
              style={[styles.scale, { borderColor: current === n ? colors.brand : colors.line, backgroundColor: current === n ? colors.brand : colors.card }]}
            >
              <Text style={{ color: current === n ? '#fff' : colors.ink }}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.muted }}>{field.lowLabel || 'Lav'}</Text>
          <Text style={{ color: colors.muted }}>{field.highLabel || 'Høy'}</Text>
        </View>
      </View>
    );
  }
  if (field.kind === 'image' || field.kind === 'file') {
    const stored = field.value?.name;
    return (
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.ink }}>{label}</Text>
        {field.help ? <Text style={{ color: colors.muted }}>{field.help}</Text> : null}
        <Text style={{ color: colors.muted }}>{stored || (field.kind === 'image' ? 'Ingen bilde er lagt inn' : 'Ingen fil er lagt inn')}</Text>
        <TouchableOpacity onPress={() => onPickFile(field)} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{field.kind === 'image' ? 'Last opp bilde' : 'Last opp fil'}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const placeholder = field.placeholder || (field.kind === 'date' ? 'ÅÅÅÅ-MM-DD' : field.kind === 'time' ? 'TT:MM' : fieldType(field.kind).label);
  if (doc && field.kind !== 'long') {
    const stacked = String(field.label || '').length > 22;
    return (
      <View style={{ gap: 2, flex: 1 }}>
        <View style={stacked ? styles.docStack : styles.docBlank}>
          <Text style={[styles.docLabel, { color: colors.ink }, stacked ? null : styles.docLabelSide]}>{label}</Text>
          <TextInput
            value={String(field.value || '')}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            keyboardType={field.kind === 'number' ? 'decimal-pad' : 'default'}
            style={[styles.docInput, { color: colors.ink, borderBottomColor: colors.ink }]}
          />
        </View>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      <Text style={[doc ? styles.docLabel : null, { color: doc ? colors.ink : colors.muted }]}>{label}</Text>
      {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
      <TextInput
        value={String(field.value || '')}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        multiline={field.kind === 'long'}
        keyboardType={field.kind === 'number' ? 'decimal-pad' : 'default'}
        style={[doc ? styles.docArea : styles.input, field.kind === 'long' && !doc && styles.long, { color: colors.ink, borderColor: colors.line, backgroundColor: doc ? 'transparent' : colors.card }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 19 },
  help: { fontSize: 12, lineHeight: 16 },
  docSection: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', borderBottomWidth: 1, paddingBottom: 4, marginTop: 16, marginBottom: 6 },
  docLabel: { fontSize: 13, lineHeight: 18 },
  docLabelSide: { maxWidth: '46%', flexShrink: 1 },
  docBlank: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingVertical: 4, minHeight: 32 },
  docStack: { gap: 2, paddingVertical: 4 },
  docCheck: { paddingVertical: 4 },
  docOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  docInput: { flex: 1, minWidth: 80, borderBottomWidth: 1, borderRadius: 0, paddingHorizontal: 2, paddingVertical: 2, fontSize: 14, backgroundColor: 'transparent' },
  docArea: { borderWidth: 1, borderRadius: 0, minHeight: 72, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, textAlignVertical: 'top' },
  signature: { marginTop: 8, maxWidth: 260, gap: 4 },
  signLine: { height: 36, borderBottomWidth: 1 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  long: { minHeight: 80, textAlignVertical: 'top' },
  scale: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optionImage: { width: 36, height: 36, borderRadius: 6 },
});
