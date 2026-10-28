import React, { useEffect, useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import IsoDateField from './IsoDateField';
import { eachWeekday } from '../../src/arbeid/absenceDashboard.js';
import { EXTRAORDINARY_NOTICE, formatPlanDate } from '../../src/arbeid/vacationPlan.js';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { HEALTH_FREE_TEXT_NOTICE } from '../../src/arbeid/absenceCatalog.js';

export default function RegisterVacationModal({
  visible,
  title = 'Registrer ferie',
  employees = [],
  employeeId = '',
  requireEmployee = false,
  locked = false,
  vacation = true,
  /** Sykdom eller legebesøk: be om at merknaden ikke inneholder helseopplysninger. */
  healthNotice = false,
  onClose,
  onSave,
}) {
  const today = toDateKey(new Date());
  const [personId, setPersonId] = useState(employeeId || '');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState('');
  useEffect(() => {
    if (!visible) return;
    setPersonId(employeeId || '');
    setFrom(today);
    setTo(today);
    setNote('');
    setLocalError('');
  }, [visible, employeeId, today]);

  const days = eachWeekday(from, to);

  function save() {
    const id = requireEmployee ? personId : (employeeId || personId);
    if (!id) {
      setLocalError('Velg ansatt.');
      return;
    }
    if (!from || !to) {
      setLocalError('Velg fra- og til-dato.');
      return;
    }
    if (!days.length) {
      setLocalError('Perioden har ingen virkedager. Lørdag og søndag telles ikke.');
      return;
    }
    setLocalError('');
    onSave?.({ personId: id, from, to, note: note.trim(), extraordinary: !!locked });
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk" />
        <View style={styles.sheet} nativeID="registrer-ferie-skjema">
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.lead}>
              {locked
                ? EXTRAORDINARY_NOTICE
                : (vacation
                  ? 'Virkedager i perioden blir planlagt ferie og sendes til godkjenning hos HR.'
                  : 'Virkedager i perioden registreres som hele dager.')}
            </Text>
            {requireEmployee ? (
              <View style={styles.field}>
                <Text style={styles.label}>Ansatt</Text>
                <ScrollView style={{ maxHeight: 140 }} nestedScrollEnabled>
                  {employees.map((row) => (
                    <TouchableOpacity key={row.id} onPress={() => setPersonId(row.id)} style={styles.choice} accessibilityRole="button">
                      <Text style={[styles.choiceText, row.id === personId && styles.choiceOn]}>{row.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <View style={styles.field}>
              <Text style={styles.label}>Fra</Text>
              <IsoDateField value={from} onChange={(iso) => { setFrom(iso); if (to && iso > to) setTo(iso); }} nativeID="ferie-fra" />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Til</Text>
              <IsoDateField value={to} min={from} onChange={setTo} nativeID="ferie-til" />
            </View>
            <Text style={styles.lead} nativeID="ferie-virkedager">
              {days.length
                ? `${days.length} virkedager${from && to ? ` · ${formatPlanDate(from)} – ${formatPlanDate(to)}` : ''}`
                : 'Ingen virkedager i perioden.'}
            </Text>
            <View style={styles.field}>
              <Text style={styles.label}>Merknad</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Valgfritt"
                placeholderTextColor="#A0A8B8"
                style={styles.input}
                nativeID="ferie-merknad"
                accessibilityLabel="Merknad"
              />
              {healthNotice ? <Text style={styles.lead}>{HEALTH_FREE_TEXT_NOTICE}</Text> : null}
            </View>
            {localError ? <Text style={styles.error}>{localError}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity onPress={onClose} style={styles.ghost} accessibilityRole="button">
                <Text style={styles.ghostText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} style={styles.cta} accessibilityRole="button" nativeID="ferie-lagre">
                <Text style={styles.ctaText}>{locked ? 'Send til godkjenning' : 'Lagre'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(16, 24, 40, 0.35)',
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web' ? { justifyContent: 'center', alignItems: 'center', padding: 16 } : null),
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    maxHeight: '92%',
    ...(Platform.OS === 'web' ? { width: '100%', maxWidth: 520, borderRadius: 24 } : null),
  },
  title: { color: '#152033', fontSize: 20, fontWeight: '800' },
  lead: { color: '#66758A', fontSize: 13, lineHeight: 18 },
  field: { gap: 6 },
  label: { color: '#8B95A6', fontSize: 12, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#E6EBF2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#152033',
    backgroundColor: '#fff',
    fontSize: 15,
  },
  choice: { paddingVertical: 8 },
  choiceText: { color: '#152033', fontSize: 15 },
  choiceOn: { color: '#1E6FEA', fontWeight: '700' },
  error: { color: '#B42318', fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  ghost: { paddingHorizontal: 14, paddingVertical: 10 },
  ghostText: { color: '#152033', fontWeight: '700' },
  cta: { backgroundColor: '#1E6FEA', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  ctaText: { color: '#fff', fontWeight: '700' },
});
