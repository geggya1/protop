import React, { useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours, parseHours, roundHours } from '../../src/arbeid/hours.js';
import { PAYOUT_RATES, monthName } from '../../src/arbeid/payroll.js';
import { radius, type } from '../../src/ui/tokens';

/**
 * Ved månedsslutt: den ansatte har mertid i timebanken og kan få noe av den utbetalt som overtid.
 * offer: { month, available (timer før uttaket), existing (rad som finnes), employeeName, onBehalf }.
 * Saldoen går ned med timene som tas ut. Uttaket kommer med i lønnsoppsummeringen (HR › Lønn).
 */
export default function OvertimePayoutModal(props) {
  if (!props.offer) return null;
  return <PayoutForm key={`${props.offer.month}:${props.offer.employeeId}`} {...props} />;
}

function hoursLabel(value) {
  return String(roundHours(value)).replace('.', ',');
}

function PayoutForm({
  colors, offer, fullDayHours = 7.5, busy = false, error = '', onClose, onSubmit, onCancelExisting,
}) {
  const existingHours = offer.existing ? -parseHours(offer.existing.hours) : 0;
  const available = roundHours(Number(offer.available) || 0);
  const [mode, setMode] = useState('hours');
  const [draft, setDraft] = useState(existingHours ? hoursLabel(existingHours) : '');
  const [rate, setRate] = useState(offer.existing?.rate || 'overtime_50');
  const day = Number(fullDayHours) > 0 ? Number(fullDayHours) : 7.5;
  const typed = parseHours(draft);
  const hours = roundHours(mode === 'days' ? typed * day : typed);
  const after = roundHours(available - hours);
  const valid = hours > 0 && hours <= available + 0.001;

  function submit() {
    if (!valid || busy) return;
    onSubmit?.({ hours, rate });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
          onPress={(event) => event.stopPropagation?.()}
          nativeID="mertid-utbetaling"
        >
          <ScrollView contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">
            <View style={styles.head}>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: colors.ink }]}>Vil du ha mertid utbetalt?</Text>
                <Text style={[styles.body, { color: colors.muted }]}>
                  {offer.onBehalf
                    ? `${offer.employeeName || 'Personen'} har ${formatHours(available)} timer i timebanken ved utgangen av ${monthName(offer.month)}.`
                    : `Du har ${formatHours(available)} timer i timebanken ved utgangen av ${monthName(offer.month)}.`}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk">
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.body, { color: colors.ink }]}>
              Timene du tar ut, trekkes fra saldoen og utbetales som overtid med lønnen for måneden. Resten blir stående i timebanken.
            </Text>

            <View style={styles.row}>
              {[{ id: 'hours', label: 'Timer' }, { id: 'days', label: 'Dager' }].map((item) => {
                const on = mode === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setMode(item.id)}
                    style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : 'transparent' }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    nativeID={`mertid-enhet-${item.id}`}
                  >
                    <Text style={[styles.chipText, { color: on ? (colors.onBrand || '#fff') : colors.ink }]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>
                {mode === 'days' ? `Antall dager (1 dag = ${hoursLabel(day)} timer)` : 'Antall timer'}
              </Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                keyboardType="decimal-pad"
                placeholder={mode === 'days' ? 'For eksempel 1' : 'For eksempel 7,5'}
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                nativeID="mertid-antall"
                accessibilityLabel={mode === 'days' ? 'Antall dager' : 'Antall timer'}
              />
              <TouchableOpacity
                onPress={() => setDraft(hoursLabel(mode === 'days' ? available / day : available))}
                accessibilityRole="button"
                nativeID="mertid-alt"
              >
                <Text style={[styles.caption, { color: colors.brand }]}>Ta ut alt</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Utbetales som</Text>
              <View style={styles.row}>
                {PAYOUT_RATES.map((item) => {
                  const on = rate === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => setRate(item.id)}
                      style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : 'transparent' }]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      nativeID={`mertid-sats-${item.id}`}
                    >
                      <Text style={[styles.chipText, { color: on ? (colors.onBrand || '#fff') : colors.ink }]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.info, { backgroundColor: colors.bg, borderColor: colors.line }]} nativeID="mertid-oppsummering">
              <Text style={[styles.body, { color: colors.ink }]}>
                {hours > 0
                  ? `${formatHours(hours)} t utbetales. Saldo etter uttak: ${formatHours(after)} t.`
                  : `Saldo: ${formatHours(available)} t.`}
              </Text>
              {hours > available + 0.001 ? (
                <Text style={[styles.caption, { color: colors.danger }]}>Du kan ikke ta ut mer enn du har i timebanken.</Text>
              ) : null}
            </View>

            {error ? <Text style={[styles.caption, { color: colors.danger }]}>{error}</Text> : null}

            <View style={styles.actions}>
              <TouchableOpacity onPress={onClose} style={[styles.button, { borderColor: colors.line, borderWidth: 1 }]} accessibilityRole="button" nativeID="mertid-nei">
                <Text style={[styles.buttonText, { color: colors.ink }]}>{offer.existing ? 'Lukk' : 'Nei takk'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submit}
                disabled={!valid || busy}
                style={[styles.button, { backgroundColor: colors.brand, opacity: valid && !busy ? 1 : 0.5 }]}
                accessibilityRole="button"
                nativeID="mertid-send"
              >
                <Text style={[styles.buttonText, { color: colors.onBrand || colors.card }]}>{offer.existing ? 'Endre uttak' : 'Ta ut som overtid'}</Text>
              </TouchableOpacity>
            </View>
            {offer.existing && onCancelExisting ? (
              <TouchableOpacity onPress={() => onCancelExisting(offer.existing)} accessibilityRole="button" nativeID="mertid-angre">
                <Text style={[styles.caption, { color: colors.danger, textAlign: 'center' }]}>Angre uttaket, la timene stå i timebanken</Text>
              </TouchableOpacity>
            ) : null}
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
  info: { borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 4 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, minHeight: 36, alignItems: 'center', justifyContent: 'center',
  },
  chipText: { ...type.label },
  field: { gap: 4 },
  input: {
    ...type.body, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 10,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: {
    flex: 1, borderRadius: radius.control, minHeight: 46, alignItems: 'center', justifyContent: 'center',
  },
  buttonText: { ...type.bodyStrong },
});
