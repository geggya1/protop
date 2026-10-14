import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { absencePickerTypes, absenceTypeById } from '../../src/arbeid/absenceCatalog.js';
import { buildCompanyAbsenceLedger } from '../../src/arbeid/absenceDashboard.js';

function formatCount(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

const SUMMARY_LINES = [
  ['earned', 'Startsaldo og justeringer'],
  ['used', 'Brukte dager totalt'],
  ['remaining', 'Dager til gode'],
  ['planned', 'Planlagte fraværsdager'],
  ['unplanned', 'Dager som ikke er planlagt'],
];

/**
 * Skrivebordsvisning. Samme registrerte fravær og startsaldo som timeliste
 * og ansattkort, i tabellen som lå her før mobiloppsettet.
 */
export function CompanyAbsenceDesktop({
  employees = [],
  names = {},
  employeeId = '',
  canChooseEmployee = false,
  onSelectEmployee,
  typeId = 'ferie',
  onSelectType,
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  error = '',
  opening = '',
  onOpeningChange,
  onSaveOpening,
}) {
  const colors = useColors();
  const types = absencePickerTypes();
  const ledger = useMemo(() => buildCompanyAbsenceLedger({
    employees,
    employeeId,
    typeId,
    absences,
    adjustments,
    fullDayHours,
    today,
    names,
  }), [employees, employeeId, typeId, absences, adjustments, fullDayHours, today, names]);
  const typeLabel = absenceTypeById(typeId).label;
  const selectedName = employeeId ? (names[employeeId] || 'Ansatt') : 'Alle ansatte';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.body}
      nativeID="fravaer-oversikt-web"
    >
      <Text style={{ color: colors.muted, marginBottom: 4 }}>{selectedName}</Text>
      {canChooseEmployee ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip
            label="Alle ansatte"
            on={!employeeId}
            colors={colors}
            onPress={() => onSelectEmployee?.('')}
          />
          {employees.map((row) => (
            <Chip
              key={row.id}
              label={names[row.id] || 'Ansatt'}
              on={row.id === employeeId}
              colors={colors}
              onPress={() => onSelectEmployee?.(row.id)}
            />
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.chips}>
        {types.map((row) => (
          <Chip
            key={row.id}
            label={row.label}
            on={row.id === typeId}
            colors={colors}
            onPress={() => onSelectType?.(row.id)}
          />
        ))}
      </View>
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
      <View style={styles.split}>
        <View style={styles.table} nativeID="fravaer-tabell">
          <View style={[styles.row, { backgroundColor: colors.sunken }]}>
            {['Ansatt', 'Dato', 'Opptjente', 'Arbeidstid', 'Registrerte dager', 'Brukte dager'].map((label) => (
              <Text key={label} style={[styles.cell, styles.head, { color: colors.muted }]}>{label}</Text>
            ))}
          </View>
          {ledger.rows.map((row) => (
            <View key={row.id} style={[styles.row, { borderBottomColor: colors.line }]}>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.employeeName}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.label}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'absence' ? '' : formatCount(row.adjustment)}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.hours ? formatCount(row.hours) : ''}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'absence' ? formatCount(row.days) : ''}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'absence' ? formatCount(row.days) : ''}</Text>
            </View>
          ))}
          {!ledger.rows.length ? (
            <Text style={{ color: colors.muted, padding: 12 }}>
              {`Ingen registrert ${typeLabel.toLowerCase()} ennå.`}
            </Text>
          ) : null}
        </View>
        <View style={[styles.summary, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="fravaer-summary">
          <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 8 }}>{typeLabel}</Text>
          {SUMMARY_LINES.map(([key, label]) => (
            <View key={key} style={styles.line}>
              <Text style={{ color: colors.muted, flex: 1 }}>{label}</Text>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{formatCount(ledger.summary[key])}</Text>
            </View>
          ))}
          {employeeId ? (
            <>
              <Text style={{ color: colors.muted, marginTop: 12, fontSize: 12 }}>{`Startsaldo ${typeLabel.toLowerCase()}`}</Text>
              <TextInput
                value={opening}
                onChangeText={onOpeningChange}
                placeholder={formatCount(ledger.summary.opening || 0)}
                placeholderTextColor={colors.placeholder}
                keyboardType="decimal-pad"
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                accessibilityLabel={`Startsaldo ${typeLabel.toLowerCase()}`}
                nativeID="ferie-startsaldo"
              />
              <TouchableOpacity
                onPress={() => onSaveOpening?.(typeId)}
                style={[styles.btn, { backgroundColor: colors.brand }]}
                nativeID="ferie-startsaldo-save"
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre startsaldo</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ color: colors.muted, marginTop: 12, fontSize: 12 }}>
              Velg én ansatt for å sette startsaldo. Summen leser registrert fravær og lagret startsaldo.
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function Chip({ label, on, colors, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, {
        borderColor: on ? colors.brand : colors.line,
        backgroundColor: on ? colors.brand : colors.card,
      }]}
    >
      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 10, paddingBottom: 48 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginTop: 4 },
  table: { flex: 1.6, minWidth: 420 },
  summary: { flex: 1, minWidth: 260, borderWidth: 1, borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  cell: { flex: 1, fontSize: 13, paddingVertical: 8, paddingHorizontal: 6 },
  head: { fontWeight: '600', fontSize: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6 },
  btn: { marginTop: 8, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
});
