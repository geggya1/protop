import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptionPicker from '../OptionPicker';
import { absencePickerTypes, absenceTypeById } from '../../src/arbeid/absenceCatalog.js';
import { formatNbDate } from '../../src/arbeid/absenceDashboard.js';
import { hoursToDays } from '../../src/arbeid/balance.js';
import { formatHours } from '../../src/arbeid/hours.js';

const STATUS_LABEL = {
  registrert: 'Til behandling',
  godkjent: 'Godkjent',
  låst: 'Låst',
};

export default function AbsencePeriodModal({
  visible,
  period,
  dayRows = [],
  fullDayHours = 7.5,
  canManage = false,
  colors,
  onClose,
  onApprove,
  onReopen,
  onSaveDay,
  onDeletePeriod,
  types: catalog,
}) {
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState({ hours: '', description: '', type: '' });
  const dayHours = Number(fullDayHours) > 0 ? Number(fullDayHours) : 7.5;

  const approval = useMemo(() => {
    const statuses = dayRows.map((row) => row.status || 'registrert');
    if (!statuses.length) return 'registrert';
    if (statuses.every((s) => s === 'låst')) return 'låst';
    if (statuses.every((s) => s === 'godkjent' || s === 'låst')) return 'godkjent';
    return 'registrert';
  }, [dayRows]);

  if (!visible || !period) return null;

  const typeMeta = absenceTypeById(period.type, catalog);
  const range = period.start === period.end
    ? formatNbDate(period.start)
    : `${formatNbDate(period.start)} – ${formatNbDate(period.end)}`;

  function startEdit(row) {
    setEditingId(row.id);
    setDraft({
      hours: formatHours(row.hours),
      description: row.description || '',
      type: row.type || period.type || 'ferie',
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
          onPress={(event) => event.stopPropagation?.()}
          nativeID="absence-period-modal"
        >
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.title, { color: colors.ink }]}>{period.employeeName || 'Fravær'}</Text>
              <Text style={{ color: colors.muted }}>
                {typeMeta.label} · {range} · {hoursToDays(period.hours, dayHours)} dager
              </Text>
              <Text style={{ color: colors.muted }}>
                Status: {STATUS_LABEL[approval] || approval}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk">
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {canManage ? (
            <View style={styles.actions}>
              {approval === 'registrert' ? (
                <TouchableOpacity
                  onPress={onApprove}
                  style={[styles.btn, { backgroundColor: colors.brand }]}
                  accessibilityRole="button"
                  nativeID="absence-period-approve"
                >
                  <Text style={styles.btnTxt}>Godkjenn periode</Text>
                </TouchableOpacity>
              ) : approval === 'godkjent' ? (
                <TouchableOpacity
                  onPress={onReopen}
                  style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>Sett tilbake til behandling</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={onDeletePeriod}
                style={[styles.btn, { borderColor: colors.danger || '#b42318', borderWidth: 1 }]}
                accessibilityRole="button"
                nativeID="absence-period-delete"
              >
                <Text style={{ color: colors.danger || '#b42318', fontWeight: '700' }}>Slett periode</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Dager i perioden</Text>
            {dayRows.map((row) => {
              const editing = editingId === row.id;
              return (
                <View
                  key={row.id}
                  style={[styles.day, { borderColor: colors.line, backgroundColor: colors.bg }]}
                >
                  {editing ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ color: colors.ink, fontWeight: '600' }}>{formatNbDate(row.date)}</Text>
                      <TextInput
                        value={draft.hours}
                        onChangeText={(value) => setDraft((current) => ({ ...current, hours: value }))}
                        placeholder="Timer"
                        placeholderTextColor={colors.muted}
                        style={[styles.input, { borderColor: colors.line, color: colors.ink }]}
                      />
                      <TextInput
                        value={draft.description}
                        onChangeText={(value) => setDraft((current) => ({ ...current, description: value }))}
                        placeholder="Beskrivelse"
                        placeholderTextColor={colors.muted}
                        style={[styles.input, { borderColor: colors.line, color: colors.ink }]}
                      />
                      <OptionPicker
                        options={absencePickerTypes(catalog).map((type) => ({ id: type.id, label: type.label }))}
                        value={draft.type}
                        onChange={(id) => { if (id) setDraft((current) => ({ ...current, type: id })); }}
                        title="Type"
                        clearable={false}
                        small
                      />
                      <View style={styles.actions}>
                        <TouchableOpacity
                          onPress={() => {
                            onSaveDay?.(row.id, draft);
                            setEditingId('');
                          }}
                          style={[styles.btn, { backgroundColor: colors.brand }]}
                        >
                          <Text style={styles.btnTxt}>Lagre</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEditingId('')} style={[styles.btn, { borderWidth: 1, borderColor: colors.line }]}>
                          <Text style={{ color: colors.ink }}>Avbryt</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => canManage && startEdit(row)}
                      disabled={!canManage}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: colors.ink, fontWeight: '600' }}>
                        {formatNbDate(row.date)} · {absenceTypeById(row.type, catalog).label}
                      </Text>
                      <Text style={{ color: colors.muted, marginTop: 2 }}>
                        {formatHours(row.hours)} · {STATUS_LABEL[row.status] || 'Registrert'}
                        {row.description ? ` · ${row.description}` : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {!dayRows.length ? (
              <Text style={{ color: colors.muted }}>Ingen dagsrader funnet for perioden.</Text>
            ) : null}
          </ScrollView>
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
    padding: 20,
  },
  sheet: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '90%',
  },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { fontSize: 18, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  btnTxt: { color: '#fff', fontWeight: '700' },
  day: { borderWidth: 1, borderRadius: 12, padding: 10 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
