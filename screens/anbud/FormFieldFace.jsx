import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fieldType } from '../../src/anbud/formBuilder';

const ICONS = {
  title: 'reader-outline',
  text: 'create-outline',
  long: 'document-text-outline',
  date: 'calendar-outline',
  number: 'calculator-outline',
  check: 'checkbox-outline',
  choice: 'radio-button-on-outline',
  checks: 'checkmark-done-outline',
  dropdown: 'chevron-down-circle-outline',
  image: 'image-outline',
  file: 'document-attach-outline',
};

function Box({ colors, children, tall = false }) {
  return (
    <View style={[styles.box, tall && styles.tall, { borderColor: colors.line, backgroundColor: colors.bg }]}>
      {children}
    </View>
  );
}

export default function FormFieldFace({ field, colors }) {
  if (!field) return null;
  const meta = fieldType(field.kind);
  const label = field.label || meta.label;
  const mark = field.required ? ' *' : '';

  if (field.kind === 'title') {
    return (
      <View style={styles.stack}>
        <Text style={[styles.caption, { color: colors.muted }]}>{meta.label}</Text>
        <Text style={[styles.heading, { color: colors.ink }]}>{label}</Text>
      </View>
    );
  }

  if (field.kind === 'check') {
    return (
      <View style={styles.stack}>
        <View style={styles.choiceRow}>
          <Ionicons name="square-outline" size={18} color={colors.ink} />
          <Text style={{ color: colors.ink }}>{label}{mark}</Text>
        </View>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
      </View>
    );
  }

  if (field.kind === 'choice' || field.kind === 'checks') {
    const many = field.kind === 'checks';
    return (
      <View style={styles.stack}>
        <Text style={{ color: colors.ink }}>{label}{mark}</Text>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
        {(field.options || []).map((option) => (
          <View key={option.id} style={styles.choiceRow}>
            <Ionicons name={many ? 'square-outline' : 'ellipse-outline'} size={16} color={colors.ink} />
            <Text style={{ color: colors.ink }}>{option.label || 'Alternativ'}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (field.kind === 'dropdown') {
    return (
      <View style={styles.stack}>
        <Text style={{ color: colors.ink }}>{label}{mark}</Text>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
        <Box colors={colors}>
          <Text style={{ color: colors.placeholder, flex: 1 }}>Velg</Text>
          <Ionicons name="chevron-down" size={16} color={colors.muted} />
        </Box>
      </View>
    );
  }

  if (field.kind === 'image' || field.kind === 'file') {
    const image = field.kind === 'image';
    return (
      <View style={styles.stack}>
        <Text style={{ color: colors.ink }}>{label}{mark}</Text>
        {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
        <View style={[styles.media, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
          <Ionicons name={ICONS[field.kind]} size={28} color={colors.muted} />
          <Text style={{ color: colors.muted }}>{image ? 'Bilde vises her' : 'Fil vises her'}</Text>
        </View>
      </View>
    );
  }

  const placeholder = field.kind === 'date' ? 'ÅÅÅÅ-MM-DD' : field.kind === 'number' ? '0' : 'Svar';
  return (
    <View style={styles.stack}>
      <Text style={[styles.caption, { color: colors.muted }]}>{label}{mark}</Text>
      {field.help ? <Text style={[styles.help, { color: colors.muted }]}>{field.help}</Text> : null}
      <Box colors={colors} tall={field.kind === 'long'}>
        <Text style={{ color: colors.placeholder }}>{placeholder}</Text>
      </Box>
    </View>
  );
}

export function fieldIcon(kind) {
  return ICONS[kind] || 'ellipse-outline';
}

const styles = StyleSheet.create({
  stack: { gap: 6 },
  caption: { fontSize: 13 },
  heading: { fontSize: 20, fontWeight: '600' },
  help: { fontSize: 13 },
  box: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tall: { minHeight: 88, alignItems: 'flex-start' },
  media: {
    minHeight: 96,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
