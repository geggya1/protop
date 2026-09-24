import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import DateField from './DateField';
import {
  REPEAT_PRESETS, CUSTOM_FREQS, repeatSummaryLabel, repeatDescriptionText,
} from '../src/utils/events';
import { isWeeklyRepeatPreset } from '../src/utils/todoRecurrence';
import {
  dateKey, startOfWeekMonday, WEEKDAYS_SHORT, parseDateKey,
} from '../src/utils/dates';

const INTERVAL_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);
const STOP_PRESETS = [
  { id: 'never', label: 'Aldri' },
  { id: 'date', label: 'På en dato' },
];

export function emptyRecurrenceValue(startDateKey = dateKey(new Date())) {
  return {
    preset: 'weekly',
    customType: 'weekly',
    customInterval: 1,
    recurrenceByDays: [1, 2, 3, 4, 5],
    recurrenceUntilKey: '',
    dateKey: startDateKey,
  };
}

export default function RecurrenceEditor({
  value,
  onChange,
  subjectLabel = 'Planen',
}) {
  const {
    preset = 'never',
    customType = 'weekly',
    customInterval = 1,
    recurrenceByDays = [],
    recurrenceUntilKey = '',
    dateKey: startDateKey = dateKey(new Date()),
  } = value || {};

  const patch = useCallback((next) => {
    onChange?.({ ...value, ...next });
  }, [onChange, value]);

  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [showStopPicker, setShowStopPicker] = useState(false);
  const [showCustomFreqPicker, setShowCustomFreqPicker] = useState(false);

  const startDate = useMemo(
    () => (startDateKey ? parseDateKey(startDateKey) : new Date()),
    [startDateKey],
  );

  // Snap to Monday only when entering a weekly preset — not on every date pick.
  useEffect(() => {
    if (!isWeeklyRepeatPreset(preset, customType)) return;
    const mon = startOfWeekMonday(startDate);
    if (dateKey(mon) !== dateKey(startDate)) {
      patch({ dateKey: dateKey(mon) });
    }
    // intentionally only when preset / frequency changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customType]);

  const repeatLabel = useMemo(() => repeatSummaryLabel({
    preset, customType, customInterval, recurrenceByDays, recurrenceUntilKey,
  }), [preset, customType, customInterval, recurrenceByDays, recurrenceUntilKey]);

  const repeatHint = useMemo(() => {
    const text = repeatDescriptionText({ preset, customType, customInterval, recurrenceByDays });
    return text ? text.replace(/Hendelsen/g, subjectLabel) : '';
  }, [preset, customType, customInterval, recurrenceByDays, subjectLabel]);

  const stopLabel = recurrenceUntilKey ? 'På en dato' : 'Aldri';
  const customFreqLabel = CUSTOM_FREQS.find((f) => f.id === customType)?.label || 'Ukentlig';
  const customUnit = CUSTOM_FREQS.find((f) => f.id === customType)?.unit || 'uke';

  const weeklyPatternMondayLabel = useMemo(() => {
    if (!isWeeklyRepeatPreset(preset, customType) || !startDate) return '';
    const mon = startOfWeekMonday(startDate);
    if (dateKey(mon) === dateKey(startDate)) return '';
    return mon.toLocaleDateString('nb-NO', { weekday: 'short', day: '2-digit', month: 'short' });
  }, [preset, customType, startDate]);

  const toggleRecurrenceDay = (day) => {
    const next = recurrenceByDays.includes(day)
      ? recurrenceByDays.filter((x) => x !== day)
      : [...recurrenceByDays, day];
    patch({ recurrenceByDays: next });
  };

  const selectPreset = (id) => {
    if (id === 'custom') {
      setShowRepeatPicker(false);
      setShowCustomPicker(true);
      return;
    }
    const next = { preset: id };
    if (id !== 'never') {
      if (id === 'weekly' || id === 'biweekly') {
        next.dateKey = dateKey(startOfWeekMonday(startDate));
      }
      if (id === 'daily') next.customType = 'daily';
      if (id === 'weekly' || id === 'biweekly') next.customType = 'weekly';
      if (id === 'monthly') next.customType = 'monthly';
      if (id === 'yearly') next.customType = 'yearly';
      if (id === 'biweekly') next.customInterval = 2;
      if (id === 'weekly' || id === 'daily') next.customInterval = 1;
    }
    patch(next);
    setShowRepeatPicker(false);
  };

  // Keep the picked day in the UI. Weekly patterns normalize to Monday on save.
  const applyStartDate = (selected) => {
    const d = selected || new Date();
    patch({ dateKey: dateKey(d) });
  };

  const renderStartField = () => (
    <DateField
      value={startDateKey}
      onChange={applyStartDate}
      prefix="Fra: "
      placeholder="Velg startdato"
    />
  );

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.formRow} onPress={() => setShowRepeatPicker(true)}>
        <Text style={styles.formRowLabel}>Gjenta</Text>
        <View style={styles.formRowRight}>
          <Text style={styles.formRowValue}>{repeatLabel}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </View>
      </TouchableOpacity>

      {preset !== 'never' ? (
        <>
          <Text style={styles.subLabel}>Startdato</Text>
          {renderStartField()}
          <Text style={styles.hint}>
            {weeklyPatternMondayLabel
              ? `Valgt dato beholdes i skjemaet; mønsteret teller fra mandag ${weeklyPatternMondayLabel}.`
              : 'Fra mandag i valgt uke telles mønsteret (f.eks. annenhver uke man–søn).'}
          </Text>

          <TouchableOpacity style={styles.formRow} onPress={() => setShowStopPicker(true)}>
            <Text style={styles.formRowLabel}>Stopp gjenta</Text>
            <View style={styles.formRowRight}>
              <Text style={styles.formRowValue}>{stopLabel}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </View>
          </TouchableOpacity>

          {recurrenceUntilKey ? (
            <DateField
              value={recurrenceUntilKey}
              onChange={(d) => patch({ recurrenceUntilKey: d ? dateKey(d) : '' })}
              prefix="Slutt: "
              placeholder="Velg sluttdato"
              icon="stop-circle-outline"
              min={startDateKey}
            />
          ) : null}

          {isWeeklyRepeatPreset(preset, customType) ? (
            <>
              <Text style={styles.subLabel}>Ukedager</Text>
              <View style={styles.weekChipRow}>
                {WEEKDAYS_SHORT.map((label, idx) => {
                  const day = (idx + 1) % 7;
                  const on = recurrenceByDays.includes(day);
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[styles.weekChip, on && styles.weekChipOn]}
                      onPress={() => toggleRecurrenceDay(day)}
                    >
                      <Text style={[styles.weekChipTxt, on && styles.weekChipTxtOn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          {repeatHint ? <Text style={styles.repeatHint}>{repeatHint}</Text> : null}
        </>
      ) : null}

      <Modal visible={showRepeatPicker} transparent animationType="fade" onRequestClose={() => setShowRepeatPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowRepeatPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Gjenta</Text>
            {REPEAT_PRESETS.map((row, idx) => (
              <TouchableOpacity
                key={row.id}
                style={[styles.sheetRow, idx === REPEAT_PRESETS.length - 1 && styles.sheetRowLast]}
                onPress={() => selectPreset(row.id)}
              >
                <Text style={styles.sheetRowTxt}>{row.label}</Text>
                {preset === row.id ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowRepeatPicker(false)}>
              <Text style={styles.sheetCancelTxt}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCustomPicker} animationType="slide" onRequestClose={() => setShowCustomPicker(false)}>
        <View style={styles.customWrap}>
          <View style={styles.customScreen}>
            <View style={styles.customHeader}>
              <TouchableOpacity onPress={() => setShowCustomPicker(false)}>
                <Ionicons name="chevron-back" size={22} color={colors.brand} />
              </TouchableOpacity>
              <Text style={styles.customTitle}>Tilpasset</Text>
              <TouchableOpacity onPress={() => { patch({ preset: 'custom' }); setShowCustomPicker(false); }}>
                <Text style={styles.customDone}>Ferdig</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.customCard}>
              <TouchableOpacity style={styles.customRow} onPress={() => setShowCustomFreqPicker(true)}>
                <Text style={styles.customRowLabel}>Hyppighet</Text>
                <View style={styles.formRowRight}>
                  <Text style={styles.formRowValue}>{customFreqLabel}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </View>
              </TouchableOpacity>
              <View style={styles.customDivider} />
              <Text style={styles.customRowLabel}>Hver</Text>
              <View style={styles.intervalRow}>
                <ScrollView style={styles.intervalScroll} contentContainerStyle={styles.intervalCol}>
                  {INTERVAL_OPTIONS.map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.intervalPill, customInterval === n && styles.intervalPillOn]}
                      onPress={() => patch({ customInterval: n })}
                    >
                      <Text style={[styles.intervalPillTxt, customInterval === n && styles.intervalPillTxtOn]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.intervalUnit}>{customUnit}</Text>
              </View>
            </View>
            <View style={[styles.customCard, { marginTop: 12 }]}>
              <Text style={styles.customRowLabel}>Startdato</Text>
              {renderStartField()}
            </View>
            {customType === 'weekly' ? (
              <>
                <Text style={styles.subLabel}>Ukedager</Text>
                <View style={styles.weekChipRow}>
                  {WEEKDAYS_SHORT.map((label, idx) => {
                    const day = (idx + 1) % 7;
                    const on = recurrenceByDays.includes(day);
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[styles.weekChip, on && styles.weekChipOn]}
                        onPress={() => toggleRecurrenceDay(day)}
                      >
                        <Text style={[styles.weekChipTxt, on && styles.weekChipTxtOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={showCustomFreqPicker} transparent animationType="fade" onRequestClose={() => setShowCustomFreqPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowCustomFreqPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Hyppighet</Text>
            {CUSTOM_FREQS.map((row, idx) => (
              <TouchableOpacity
                key={row.id}
                style={[styles.sheetRow, idx === CUSTOM_FREQS.length - 1 && styles.sheetRowLast]}
                onPress={() => { patch({ customType: row.id }); setShowCustomFreqPicker(false); }}
              >
                <Text style={styles.sheetRowTxt}>{row.label}</Text>
                {customType === row.id ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showStopPicker} transparent animationType="fade" onRequestClose={() => setShowStopPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowStopPicker(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Stopp gjenta</Text>
            {STOP_PRESETS.map((row, idx) => {
              const selected = row.id === 'date' ? !!recurrenceUntilKey : !recurrenceUntilKey;
              return (
                <TouchableOpacity
                  key={row.id}
                  style={[styles.sheetRow, idx === STOP_PRESETS.length - 1 && styles.sheetRowLast]}
                  onPress={() => {
                    patch({ recurrenceUntilKey: row.id === 'never' ? '' : (recurrenceUntilKey || startDateKey) });
                    setShowStopPicker(false);
                  }}
                >
                  <Text style={styles.sheetRowTxt}>{row.label}</Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  formRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  formRowLabel: { fontWeight: '700', fontSize: 14, color: colors.ink },
  formRowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  formRowValue: { fontWeight: '600', fontSize: 14, color: colors.muted },
  subLabel: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', marginTop: 4 },
  hint: { color: colors.muted, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  weekChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  weekChip: {
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  weekChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  weekChipTxt: { fontWeight: '700', fontSize: 12, color: colors.ink },
  weekChipTxtOn: { color: colors.brand },
  repeatHint: { color: colors.muted, fontSize: 13, fontWeight: '400', lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingBottom: 24, paddingTop: 8,
  },
  sheetTitle: { fontWeight: '800', fontSize: 16, textAlign: 'center', paddingVertical: 12, color: colors.ink },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  sheetRowLast: { borderBottomWidth: 0 },
  sheetRowTxt: { fontSize: 16, fontWeight: '600', color: colors.ink },
  sheetCancel: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  sheetCancelTxt: { fontWeight: '700', fontSize: 16, color: colors.brand },
  customWrap: { flex: 1, backgroundColor: colors.bg },
  customScreen: { flex: 1, padding: 16 },
  customHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  customTitle: { fontWeight: '800', fontSize: 17, color: colors.ink },
  customDone: { fontWeight: '800', fontSize: 16, color: colors.brand },
  customCard: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.line, padding: 12,
  },
  customRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  customRowLabel: { fontWeight: '700', fontSize: 14, color: colors.ink },
  customDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 8 },
  intervalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  intervalScroll: { maxHeight: 120, flex: 1 },
  intervalCol: { gap: 4 },
  intervalPill: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: colors.line,
  },
  intervalPillOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  intervalPillTxt: { fontWeight: '700', fontSize: 14, color: colors.ink },
  intervalPillTxtOn: { color: colors.brand },
  intervalUnit: { fontWeight: '700', fontSize: 14, color: colors.muted, marginTop: 8 },
});
