import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ABSENCE_REPORT_COLUMNS,
  ABSENCE_REPORT_PERIODS,
  ABSENCE_REPORT_SORT_OPTIONS,
  ABSENCE_REPORT_STATUS_FILTERS,
  ABSENCE_REPORT_TYPE_FILTERS,
  DEFAULT_ABSENCE_REPORT_COLUMNS,
  formatHours,
} from '../../src/arbeid/absenceReport.js';

function Section({ title, colors, children }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function Choice({ label, on, onPress, colors, testID }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      nativeID={testID}
      style={[
        styles.choice,
        { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : colors.card },
      ]}
    >
      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12 }} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AbsenceOrganizePanel({
  colors,
  query,
  onQuery,
  period,
  onPeriod,
  fromDate,
  toDate,
  onFromDate,
  onToDate,
  onFromDateBlur,
  onToDateBlur,
  sort,
  onSort,
  category,
  onCategory,
  status,
  onStatus,
  visibleColumns,
  onToggleColumn,
  onResetColumns,
  employeeId,
  onEmployee,
  employees = [],
  onReset,
  onClose,
}) {
  const visible = new Set(visibleColumns?.length ? visibleColumns : DEFAULT_ABSENCE_REPORT_COLUMNS);

  return (
    <View
      style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}
      nativeID="absence-organize-panel"
    >
      <View style={styles.panelHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>Filter</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Periode, type, status, sortering og kolonner for fraværsrapporten.
          </Text>
        </View>
        {onClose ? (
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk filter">
            <Ionicons name="close" size={20} color={colors.ink} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
        <Section title="Finn fravær / ferie" colors={colors}>
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Ansatt, type, beskrivelse…"
            placeholderTextColor={colors.placeholder}
            nativeID="absence-organize-search"
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
        </Section>

        <Section title="Vis for periode" colors={colors}>
          <View style={styles.wrap}>
            {ABSENCE_REPORT_PERIODS.map((item) => (
              <Choice
                key={item.id}
                label={item.label}
                on={period === item.id}
                onPress={() => onPeriod(item.id)}
                colors={colors}
                testID={`absence-period-${item.id}`}
              />
            ))}
          </View>
          {period === 'custom' ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <TextInput
                value={fromDate}
                onChangeText={onFromDate}
                onBlur={onFromDateBlur}
                placeholder="Fra dato"
                placeholderTextColor={colors.placeholder}
                nativeID="absence-from-date"
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
              <TextInput
                value={toDate}
                onChangeText={onToDate}
                onBlur={onToDateBlur}
                placeholder="Til dato"
                placeholderTextColor={colors.placeholder}
                nativeID="absence-to-date"
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
            </View>
          ) : null}
        </Section>

        <Section title="Fraværstyper" colors={colors}>
          <View style={styles.wrap}>
            {ABSENCE_REPORT_TYPE_FILTERS.map((item) => (
              <Choice
                key={item.id || 'all'}
                label={item.label}
                on={category === item.id}
                onPress={() => onCategory(item.id)}
                colors={colors}
                testID={`absence-category-${item.id || 'all'}`}
              />
            ))}
          </View>
        </Section>

        <Section title="Status" colors={colors}>
          <View style={styles.wrap}>
            {ABSENCE_REPORT_STATUS_FILTERS.map((item) => (
              <Choice
                key={item.id || 'all'}
                label={item.label}
                on={status === item.id}
                onPress={() => onStatus(item.id)}
                colors={colors}
                testID={`absence-status-${item.id || 'all'}`}
              />
            ))}
          </View>
        </Section>

        <Section title="Sortering" colors={colors}>
          <View style={styles.wrap}>
            {ABSENCE_REPORT_SORT_OPTIONS.map((item) => (
              <Choice
                key={item.id}
                label={item.label}
                on={sort === item.id}
                onPress={() => onSort(item.id)}
                colors={colors}
                testID={`absence-sort-${item.id}`}
              />
            ))}
          </View>
        </Section>

        <Section title="Medarbeidere" colors={colors}>
          <View style={styles.wrap}>
            <Choice
              label="Alle"
              on={!employeeId}
              onPress={() => onEmployee('')}
              colors={colors}
              testID="absence-employee-all"
            />
            {employees.map((item) => (
              <Choice
                key={item.id}
                label={item.hours != null ? `${item.name} · ${formatHours(item.hours)}` : item.name}
                on={employeeId === item.id}
                onPress={() => onEmployee(item.id)}
                colors={colors}
                testID={`absence-employee-${item.id}`}
              />
            ))}
          </View>
          {!employees.length ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen medarbeidere i dette utvalget.</Text>
          ) : null}
        </Section>

        <Section title="Vis kolonner" colors={colors}>
          <View style={{ gap: 6 }}>
            {ABSENCE_REPORT_COLUMNS.map((column) => {
              const on = visible.has(column.key);
              return (
                <TouchableOpacity
                  key={column.key}
                  onPress={() => onToggleColumn(column.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  nativeID={`absence-column-${column.key}`}
                  style={styles.checkRow}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={on ? colors.brand : colors.muted}
                  />
                  <Text style={{ color: colors.ink, fontSize: 13 }}>{column.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {onResetColumns ? (
            <TouchableOpacity onPress={onResetColumns} accessibilityRole="button" style={{ marginTop: 8 }}>
              <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 13 }}>Tilbakestill kolonner</Text>
            </TouchableOpacity>
          ) : null}
        </Section>
      </ScrollView>

      {onReset ? (
        <TouchableOpacity
          onPress={onReset}
          accessibilityRole="button"
          nativeID="absence-organize-reset"
          style={[styles.reset, { borderTopColor: colors.line }]}
        >
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Nullstill filter</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 300,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  panelTitle: { fontSize: 16, fontWeight: '700' },
  scroll: { maxHeight: 720 },
  scrollInner: { paddingHorizontal: 14, paddingBottom: 16, gap: 16 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minHeight: 40 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  reset: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center' },
});
