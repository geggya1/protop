import React, { useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IsoDateField from './IsoDateField';
import { HEALTH_FREE_TEXT_NOTICE, absenceTypeById, isHealthAbsence } from '../../src/arbeid/absenceCatalog.js';
import { validateAbsenceForm } from '../../src/arbeid/absenceForm.js';
import { calendarDays, todayIso } from '../../src/arbeid/sickLeave.js';
import { radius, type } from '../../src/ui/tokens';

/**
 * Fraværsskjema for permisjon, annet fravær, legebesøk, seminar o.l. Åpnes etter at fravær er
 * ført i timelisten, fra påminnelsen «Husk fraværsskjema» og fra fraværsdialogen.
 */
export default function AbsenceFormModal(props) {
  if (!props.visible) return null;
  const { initial } = props;
  const key = [initial?.id, initial?.type, initial?.fromDate, initial?.toDate].join(':');
  return <AbsenceForm key={key} {...props} />;
}

function AbsenceForm({
  colors, catalog, employeeName = '', initial = null, onBehalf = false, busy = false, error = '', onClose, onSubmit,
}) {
  const start = initial?.fromDate || todayIso();
  const [fromDate, setFromDate] = useState(start);
  const [toDate, setToDate] = useState(initial?.toDate || start);
  const [reason, setReason] = useState(initial?.reason || '');
  const [note, setNote] = useState(initial?.note || '');
  const [tried, setTried] = useState(false);
  const typeId = initial?.type || '';
  const typeLabel = absenceTypeById(typeId, catalog).label;
  const health = isHealthAbsence(typeId, catalog);
  const days = calendarDays(fromDate, toDate || fromDate);
  const errors = validateAbsenceForm({ type: typeId, fromDate, toDate, reason });
  const shown = tried ? errors : [];

  function submit() {
    setTried(true);
    if (errors.length || busy) return;
    onSubmit?.({
      id: initial?.id || '',
      type: typeId,
      fromDate,
      toDate: toDate || fromDate,
      reason: reason.trim(),
      note: note.trim(),
    });
  }

  const fieldStyle = [styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
          onPress={(event) => event.stopPropagation?.()}
          nativeID="fravaersskjema"
        >
          <ScrollView contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">
            <View style={styles.head}>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: colors.ink }]}>Fraværsskjema</Text>
                <Text style={[styles.body, { color: colors.muted }]}>
                  {onBehalf ? `${typeLabel} for ${employeeName || 'medarbeideren'}.` : typeLabel}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk">
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.info, { backgroundColor: colors.bg, borderColor: colors.line }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
              <Text style={[styles.body, styles.flex, { color: colors.ink }]}>
                Arbeidsdagene i perioden føres i timelisten og går til leder for godkjenning.
              </Text>
            </View>

            <View style={styles.row}>
              <View style={[styles.flex, styles.field]}>
                <Text style={[styles.label, { color: colors.muted }]}>Fra</Text>
                <IsoDateField
                  value={fromDate}
                  onChange={(iso) => { setFromDate(iso); if (!toDate || toDate < iso) setToDate(iso); }}
                  nativeID="fravaersskjema-fra"
                />
              </View>
              <View style={[styles.flex, styles.field]}>
                <Text style={[styles.label, { color: colors.muted }]}>Til og med</Text>
                <IsoDateField value={toDate} min={fromDate} onChange={setToDate} nativeID="fravaersskjema-til" />
              </View>
            </View>
            <Text style={[styles.caption, { color: colors.muted }]}>{`${days} kalenderdag${days === 1 ? '' : 'er'}`}</Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Begrunnelse</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={health ? 'For eksempel: time hos fastlege' : 'For eksempel: begravelse, flytting, kurs'}
                placeholderTextColor={colors.muted}
                maxLength={300}
                multiline
                style={fieldStyle}
                accessibilityLabel="Begrunnelse"
                nativeID="fravaersskjema-begrunnelse"
              />
              {health ? <Text style={[styles.caption, { color: colors.muted }]}>{HEALTH_FREE_TEXT_NOTICE}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Merknad (valgfritt)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                maxLength={200}
                style={[fieldStyle, styles.short]}
                accessibilityLabel="Merknad"
                nativeID="fravaersskjema-merknad"
              />
            </View>

            {shown.length || error ? (
              <View accessibilityRole="alert" style={[styles.info, { borderColor: colors.dangerInk || colors.danger }]}>
                <Ionicons name="alert-circle" size={18} color={colors.dangerInk || colors.danger} />
                <Text style={[styles.body, styles.flex, { color: colors.dangerInk || colors.danger }]}>
                  {[...shown, error].filter(Boolean).join(' ')}
                </Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity onPress={onClose} style={[styles.button, { borderColor: colors.line, borderWidth: 1 }]} accessibilityRole="button">
                <Text style={[styles.buttonText, { color: colors.ink }]}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submit}
                disabled={busy}
                style={[styles.button, { backgroundColor: colors.brand, opacity: busy ? 0.5 : 1 }]}
                accessibilityRole="button"
                nativeID="fravaersskjema-send"
              >
                <Text style={[styles.buttonText, { color: colors.onBrand || '#fff' }]}>{busy ? 'Sender …' : 'Send skjema'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** «Vil du fylle ut fraværsskjema?» rett etter at fraværet er lagret. */
export function AbsenceFormPrompt({ visible, colors, typeLabel = '', onLater, onOpen }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <Pressable style={styles.backdrop} onPress={onLater}>
        <Pressable
          style={[styles.sheet, styles.prompt, { backgroundColor: colors.card, borderColor: colors.line }]}
          onPress={(event) => event.stopPropagation?.()}
          nativeID="fravaersskjema-sporsmal"
          accessibilityViewIsModal
        >
          <View style={styles.stack}>
            <Ionicons name="document-text-outline" size={28} color={colors.brand} />
            <Text style={[styles.title, { color: colors.ink }]}>Vil du registrere fraværet?</Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              {`${typeLabel || 'Fraværet'} er ført i timelisten. Fyll ut fraværsskjemaet, så får leder begrunnelsen og kan godkjenne.`}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={onLater}
                style={[styles.button, { borderColor: colors.line, borderWidth: 1 }]}
                accessibilityRole="button"
                nativeID="fravaersskjema-senere"
              >
                <Text style={[styles.buttonText, { color: colors.ink }]}>Senere</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onOpen}
                style={[styles.button, { backgroundColor: colors.brand }]}
                accessibilityRole="button"
                nativeID="fravaersskjema-apne"
              >
                <Text style={[styles.buttonText, { color: colors.onBrand || '#fff' }]}>Fyll ut skjema</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  prompt: { maxWidth: 420 },
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
  short: { minHeight: 44 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: {
    flex: 1, borderRadius: radius.control, minHeight: 46, alignItems: 'center', justifyContent: 'center',
  },
  buttonText: { ...type.bodyStrong },
});
