import React from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { fieldType } from '../../src/anbud/formBuilder';

export default function FormAnswer({ field, colors, onChange, onPickFile }) {
  if (!field || field.kind === 'title') {
    return <Text style={[styles.title, { color: colors.ink }]}>{field?.label}</Text>;
  }
  const label = `${field.label}${field.required ? ' *' : ''}`;
  if (field.kind === 'check') {
    return (
      <TouchableOpacity onPress={() => onChange(!field.value)} accessibilityRole="checkbox" accessibilityState={{ checked: !!field.value }}>
        <Text style={{ color: colors.ink }}>{field.value ? '✓' : '○'} {label}</Text>
        {field.help ? <Text style={{ color: colors.muted }}>{field.help}</Text> : null}
      </TouchableOpacity>
    );
  }
  if (field.kind === 'choice' || field.kind === 'dropdown' || field.kind === 'checks') {
    const many = field.kind === 'checks';
    const selected = many ? (field.value || []) : field.value;
    return (
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.ink }}>{label}</Text>
        {field.help ? <Text style={{ color: colors.muted }}>{field.help}</Text> : null}
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
                <Text style={{ color: colors.ink }}>{on ? '✓' : '○'} {option.label}</Text>
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
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
        ) : null}
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
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.muted }}>{label}</Text>
      {field.help ? <Text style={{ color: colors.muted }}>{field.help}</Text> : null}
      <TextInput
        value={String(field.value || '')}
        onChangeText={onChange}
        placeholder={field.kind === 'date' ? 'ÅÅÅÅ-MM-DD' : field.kind === 'time' ? 'TT:MM' : fieldType(field.kind).label}
        placeholderTextColor={colors.placeholder}
        multiline={field.kind === 'long'}
        keyboardType={field.kind === 'number' ? 'decimal-pad' : 'default'}
        style={[styles.input, field.kind === 'long' && styles.long, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  long: { minHeight: 80, textAlignVertical: 'top' },
  scale: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optionImage: { width: 36, height: 36, borderRadius: 6 },
});
