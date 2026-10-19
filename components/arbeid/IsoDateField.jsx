import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addIsoDays, formatPlanDate, isIsoDate, monthGrid, osloToday } from '../../src/arbeid/vacationPlan.js';

const WEEKDAYS = ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function shiftMonth(isoMonth, delta) {
  const [year, month] = String(isoMonth || '').split('-').map(Number);
  const date = new Date(year || 2026, (month || 1) - 1 + delta, 1);
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${nextMonth}`;
}

export function MonthCalendar({ value, min, onPick, nativeID = 'ferie-kalender' }) {
  const seed = isIsoDate(value) ? value : osloToday();
  const [cursor, setCursor] = useState(seed.slice(0, 7));
  const [year, month] = cursor.split('-').map(Number);
  const cells = monthGrid(year, month);
  return (
    <View style={styles.cal} nativeID={nativeID}>
      <View style={styles.calHead}>
        <TouchableOpacity onPress={() => setCursor(shiftMonth(cursor, -1))} accessibilityRole="button" accessibilityLabel="Forrige måned" nativeID={`${nativeID}-forrige`}>
          <Ionicons name="chevron-back" size={18} color="#152033" />
        </TouchableOpacity>
        <Text style={styles.calTitle}>{`${MONTHS[month - 1] || ''} ${year}`}</Text>
        <TouchableOpacity onPress={() => setCursor(shiftMonth(cursor, 1))} accessibilityRole="button" accessibilityLabel="Neste måned" nativeID={`${nativeID}-neste`}>
          <Ionicons name="chevron-forward" size={18} color="#152033" />
        </TouchableOpacity>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((label) => <Text key={label} style={styles.weekDay}>{label}</Text>)}
      </View>
      <View style={styles.grid}>
        {cells.map((iso, index) => {
          if (!iso) return <View key={`e-${index}`} style={styles.day} />;
          const disabled = !!(min && iso < min);
          const selected = iso === value;
          const weekend = index % 7 >= 5;
          return (
            <TouchableOpacity
              key={iso}
              disabled={disabled}
              onPress={() => onPick(iso)}
              style={[styles.day, selected && styles.dayOn]}
              accessibilityRole="button"
              accessibilityLabel={formatPlanDate(iso)}
              nativeID={`${nativeID}-${iso}`}
            >
              <Text style={[styles.dayText, weekend && styles.dayEnd, selected && styles.dayTextOn, disabled && styles.dayOff]}>
                {Number(iso.slice(8, 10))}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function IsoDateField({
  value,
  onChange,
  placeholder = 'Velg dato',
  min,
  nativeID,
}) {
  const [open, setOpen] = useState(false);
  const label = isIsoDate(value) ? formatPlanDate(value) : placeholder;
  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen((current) => !current)}
        style={styles.field}
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        nativeID={nativeID}
      >
        <Ionicons name="calendar-outline" size={18} color="#1E6FEA" />
        <Text style={[styles.fieldText, !isIsoDate(value) && styles.placeholder]}>{label}</Text>
      </TouchableOpacity>
      {open ? (
        <MonthCalendar
          value={value}
          min={min}
          nativeID={nativeID ? `${nativeID}-kalender` : 'ferie-kalender'}
          onPick={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

export function shiftIso(iso, days) {
  return addIsoDays(iso, days);
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  fieldText: { flex: 1, color: '#152033', fontSize: 15 },
  placeholder: { color: '#A0A8B8' },
  cal: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    borderRadius: 16,
    padding: 10,
    backgroundColor: '#fff',
  },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calTitle: { color: '#152033', fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  week: { flexDirection: 'row', marginTop: 8 },
  weekDay: { width: '14.28%', textAlign: 'center', color: '#8B95A6', fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.28%', height: 36, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: '#1E6FEA', borderRadius: 18 },
  dayText: { color: '#152033', fontSize: 14 },
  dayEnd: { color: '#A0A8B8' },
  dayTextOn: { color: '#fff', fontWeight: '700' },
  dayOff: { color: '#D5DEEA' },
});
