import React, { useState } from 'react';
import {
  Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { EXPENSE_CATEGORIES } from '../../src/economy/expenses.js';

/**
 * Kort registrering fra timeføringsmenyen: utlegg, produktsalg eller bilgodtgjørelse.
 */
export default function TimesheetSideForm({
  kind,
  colors,
  date = '',
  onClose,
  onSave,
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [km, setKm] = useState('');
  const [category, setCategory] = useState('other');
  const [error, setError] = useState('');
  if (!kind) return null;
  const title = kind === 'expense' ? 'Legg til utlegg' : (kind === 'sale' ? 'Legg til produktsalg' : 'Legg til bilgodtgjørelse');

  function submit() {
    if (kind === 'mileage') {
      if (!from.trim() || !to.trim() || !(Number(String(km).replace(',', '.')) > 0)) {
        setError('Fra, til og kilometer må fylles ut.');
        return;
      }
      onSave?.({ from: from.trim(), to: to.trim(), km: Number(String(km).replace(',', '.')), notes: description.trim(), date });
      return;
    }
    if (!description.trim()) {
      setError(kind === 'sale' ? 'Produktnavn mangler.' : 'Beskrivelse mangler.');
      return;
    }
    const value = Number(String(amount).replace(',', '.'));
    if (!(value > 0)) {
      setError('Beløp eller pris mangler.');
      return;
    }
    onSave?.({
      description: description.trim(),
      name: description.trim(),
      amount,
      category,
      date,
      quantity: 1,
      unitPrice: value,
    });
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
          <Text style={{ color: colors.muted, marginBottom: 8 }}>{date}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={kind === 'sale' ? 'Produkt' : (kind === 'mileage' ? 'Formål' : 'Beskrivelse')}
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
          />
          {kind === 'mileage' ? (
            <>
              <TextInput value={from} onChangeText={setFrom} placeholder="Fra" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line }]} />
              <TextInput value={to} onChangeText={setTo} placeholder="Til" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line }]} />
              <TextInput value={km} onChangeText={setKm} placeholder="Kilometer" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line }]} />
            </>
          ) : (
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder={kind === 'sale' ? 'Pris eks. mva' : 'Beløp inkl. mva'}
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            />
          )}
          {kind === 'expense' ? (
            <View style={styles.chips}>
              {EXPENSE_CATEGORIES.slice(0, 4).map((row) => (
                <TouchableOpacity key={row.id} onPress={() => setCategory(row.id)} style={[styles.chip, { borderColor: category === row.id ? colors.brand : colors.line }]}>
                  <Text style={{ color: colors.ink, fontSize: 12 }}>{row.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {error ? <Text style={{ color: '#b42318', marginBottom: 8 }}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={[styles.btn, { borderWidth: 1, borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={submit} style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 12, padding: 16 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
});
