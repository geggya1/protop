import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { absencePickerTypes } from '../../src/arbeid/absenceCatalog.js';

/** Velg fraværskategorier som skal ligge som rader i timelisten. */
export default function AbsenceTypeModal({
  visible,
  colors,
  selected = [],
  types: catalog,
  onClose,
  onSave,
}) {
  const [picked, setPicked] = useState(selected);
  const types = absencePickerTypes(catalog);

  function toggle(id) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} onShow={() => setPicked(selected)}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.ink }]}>Legg til fravær / ferie</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {types.map((row) => {
              const on = picked.includes(row.id);
              return (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => toggle(row.id)}
                  style={[styles.row, { borderBottomColor: colors.line }]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={{ color: colors.ink, flex: 1, fontSize: 14 }}>{row.label}</Text>
                  <View style={[styles.box, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : 'transparent' }]}>
                    {on ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}>
              <Text style={{ color: colors.ink }}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSave?.(picked)}
              style={[styles.btn, { backgroundColor: colors.brand }]}
              nativeID="absence-add-confirm"
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Legg til fravær / ferie</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '700', padding: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  box: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 12 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
});
