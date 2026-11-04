import React, { useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IsoDateField from './IsoDateField';
import { calendarDays, todayIso } from '../../src/arbeid/sickLeave.js';
import { radius, type } from '../../src/ui/tokens';

/**
 * Fraværsbeskjed for innleide og eksterne: at de er borte, fra og til, og eventuelt en kort
 * melding. Ikke egenmelding eller sykmelding — det går til deres egen arbeidsgiver.
 */
export default function AbsenceNoticeModal(props) {
  if (!props.visible) return null;
  const key = [props.initial?.fromDate, props.initial?.toDate].join(':');
  return <NoticeForm key={key} {...props} />;
}

function NoticeForm({
  colors, employeeName = '', initial = null, onBehalf = false, busy = false, onClose, onSubmit,
}) {
  const start = initial?.fromDate || todayIso();
  const [fromDate, setFromDate] = useState(start);
  const [toDate, setToDate] = useState(initial?.toDate || start);
  const [note, setNote] = useState('');
  const days = calendarDays(fromDate, toDate || fromDate);
  const ok = !!fromDate && (!toDate || toDate >= fromDate);

  function submit() {
    if (!ok || busy) return;
    onSubmit?.({ fromDate, toDate: toDate || fromDate, note: note.trim() });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
          onPress={(event) => event.stopPropagation?.()}
          nativeID="fravaersbeskjed-skjema"
        >
          <ScrollView contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">
            <View style={styles.head}>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: colors.ink }]}>Meld fravær</Text>
                <Text style={[styles.body, { color: colors.muted }]}>
                  {onBehalf ? `Du melder fravær for ${employeeName || 'personen'}.` : 'Gi beskjed om når du er borte, så vet vi det.'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk">
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.info, { backgroundColor: colors.bg, borderColor: colors.line }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
              <Text style={[styles.body, styles.flex, { color: colors.ink }]}>
                Du er innleid eller ekstern. Egenmelding og sykmelding sender du til din egen arbeidsgiver. Her gir du bare beskjed om at du er borte.
              </Text>
            </View>

            <View style={styles.row}>
              <View style={[styles.flex, styles.field]}>
                <Text style={[styles.label, { color: colors.muted }]}>Fra</Text>
                <IsoDateField value={fromDate} onChange={(iso) => { setFromDate(iso); if (!toDate || toDate < iso) setToDate(iso); }} nativeID="fravaersbeskjed-fra" />
              </View>
              <View style={[styles.flex, styles.field]}>
                <Text style={[styles.label, { color: colors.muted }]}>Til og med</Text>
                <IsoDateField value={toDate} min={fromDate} onChange={setToDate} nativeID="fravaersbeskjed-til" />
              </View>
            </View>
            <Text style={[styles.caption, { color: colors.muted }]}>{`${days} kalenderdag${days === 1 ? '' : 'er'}`}</Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Melding (valgfritt)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="For eksempel: tilbake mandag"
                placeholderTextColor={colors.muted}
                maxLength={200}
                multiline
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                nativeID="fravaersbeskjed-melding"
              />
              <Text style={[styles.caption, { color: colors.muted }]}>Ikke skriv årsak eller helseopplysninger.</Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity onPress={onClose} style={[styles.button, { borderColor: colors.line, borderWidth: 1 }]} accessibilityRole="button">
                <Text style={[styles.buttonText, { color: colors.ink }]}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submit}
                disabled={!ok || busy}
                style={[styles.button, { backgroundColor: colors.brand, opacity: ok && !busy ? 1 : 0.5 }]}
                accessibilityRole="button"
                nativeID="fravaersbeskjed-send"
              >
                <Text style={[styles.buttonText, { color: colors.onBrand || colors.card }]}>{busy ? 'Sender …' : 'Send beskjed'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  sheet: {
    width: '100%', maxWidth: 480, maxHeight: '92%', borderRadius: radius.sheet, borderWidth: 1, padding: 18,
  },
  stack: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  title: { ...type.title },
  body: { ...type.body },
  caption: { ...type.caption },
  label: { ...type.caption, fontWeight: '600' },
  info: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.card, padding: 12,
  },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  field: { gap: 4, minWidth: 140 },
  input: {
    ...type.body, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 10, minHeight: 64, textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: {
    flex: 1, borderRadius: radius.control, minHeight: 46, alignItems: 'center', justifyContent: 'center',
  },
  buttonText: { ...type.bodyStrong },
});
