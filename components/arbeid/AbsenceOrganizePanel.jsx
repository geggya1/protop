import React, { useState } from 'react';
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

function RowLabel({ children, color }) {
  return <Text style={[styles.rowLabel, { color }]}>{children}</Text>;
}

function Chip({ label, on, onPress, colors, testID, count }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      nativeID={testID}
      style={[
        styles.chip,
        {
          borderColor: on ? colors.brand : colors.line,
          backgroundColor: on ? '#E8F1FF' : '#fff',
        },
      ]}
    >
      <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 13, fontWeight: '400' }} numberOfLines={1}>
        {label}
      </Text>
      {count != null ? (
        <Text style={[styles.count, { color: on ? colors.brand : colors.muted }]}>{count}</Text>
      ) : null}
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
  counts = null,
  onReset,
  onClose,
}) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const visible = new Set(visibleColumns?.length ? visibleColumns : DEFAULT_ABSENCE_REPORT_COLUMNS);
  const countFor = (id) => {
    if (!counts || !id) return null;
    if (id === 'ferie' || id === 'sykdom' || id === 'annet') return counts[id];
    return null;
  };

  return (
    <View
      style={[styles.deck, { borderColor: colors.line, backgroundColor: colors.card }]}
      nativeID="absence-organize-panel"
    >
      {onClose ? (
        <View style={styles.headRow}>
          <Text style={[styles.headTitle, { color: colors.ink }]}>Filtrer og sorter</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Lukk filter"
            nativeID="absence-organize-close"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.top}>
        <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.bg }]}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Søk ansatt, type eller beskrivelse"
            placeholderTextColor={colors.placeholder}
            nativeID="absence-organize-search"
            style={[styles.searchInput, { color: colors.ink }]}
          />
        </View>
        {onReset ? (
          <TouchableOpacity
            onPress={onReset}
            accessibilityRole="button"
            nativeID="absence-organize-reset"
            style={[styles.reset, { borderColor: colors.line }]}
          >
            <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '400' }}>Nullstill</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.block}>
        <RowLabel color={colors.muted}>Periode</RowLabel>
        <View style={styles.wrap}>
          {ABSENCE_REPORT_PERIODS.map((item) => (
            <Chip
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
          <View style={styles.dates}>
            <TextInput
              value={fromDate}
              onChangeText={onFromDate}
              onBlur={onFromDateBlur}
              placeholder="Fra dato"
              placeholderTextColor={colors.placeholder}
              nativeID="absence-from-date"
              style={[styles.dateInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <Text style={{ color: colors.muted }}>–</Text>
            <TextInput
              value={toDate}
              onChangeText={onToDate}
              onBlur={onToDateBlur}
              placeholder="Til dato"
              placeholderTextColor={colors.placeholder}
              nativeID="absence-to-date"
              style={[styles.dateInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.split}>
        <View style={styles.block}>
          <RowLabel color={colors.muted}>Type</RowLabel>
          <View style={styles.wrap}>
            {ABSENCE_REPORT_TYPE_FILTERS.map((item) => (
              <Chip
                key={item.id || 'all'}
                label={item.label}
                count={countFor(item.id)}
                on={category === item.id}
                onPress={() => onCategory(item.id)}
                colors={colors}
                testID={`absence-category-${item.id || 'all'}`}
              />
            ))}
          </View>
        </View>
        <View style={styles.block}>
          <RowLabel color={colors.muted}>Status</RowLabel>
          <View style={styles.wrap}>
            {ABSENCE_REPORT_STATUS_FILTERS.map((item) => (
              <Chip
                key={item.id || 'all'}
                label={item.label}
                on={status === item.id}
                onPress={() => onStatus(item.id)}
                colors={colors}
                testID={`absence-status-${item.id || 'all'}`}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.block}>
        <RowLabel color={colors.muted}>Sortering</RowLabel>
        <View style={styles.wrap}>
          {ABSENCE_REPORT_SORT_OPTIONS.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              on={sort === item.id}
              onPress={() => onSort(item.id)}
              colors={colors}
              testID={`absence-sort-${item.id}`}
            />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <RowLabel color={colors.muted}>Medarbeider</RowLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
          <Chip
            label="Alle"
            on={!employeeId}
            onPress={() => onEmployee('')}
            colors={colors}
            testID="absence-employee-all"
          />
          {employees.map((item) => (
            <Chip
              key={item.id}
              label={item.hours != null ? `${item.name} · ${formatHours(item.hours)}` : item.name}
              on={employeeId === item.id}
              onPress={() => onEmployee(item.id)}
              colors={colors}
              testID={`absence-employee-${item.id}`}
            />
          ))}
        </ScrollView>
        {!employees.length ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen medarbeidere i dette utvalget.</Text>
        ) : null}
      </View>

      <View style={styles.block}>
        <TouchableOpacity
          onPress={() => setColumnsOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: columnsOpen }}
          nativeID="absence-columns-toggle"
          style={styles.columnsToggle}
        >
          <Ionicons name={columnsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink} />
          <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '400' }}>Kolonner i tabellen</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{visible.size} synlige</Text>
        </TouchableOpacity>
        {columnsOpen ? (
          <View style={styles.wrap}>
            {ABSENCE_REPORT_COLUMNS.map((column) => {
              const on = visible.has(column.key);
              return (
                <TouchableOpacity
                  key={column.key}
                  onPress={() => onToggleColumn(column.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  nativeID={`absence-column-${column.key}`}
                  style={[
                    styles.chip,
                    { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? '#E8F1FF' : '#fff' },
                  ]}
                >
                  <Ionicons
                    name={on ? 'checkmark' : 'add'}
                    size={14}
                    color={on ? colors.brand : colors.muted}
                  />
                  <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 13 }}>{column.label}</Text>
                </TouchableOpacity>
              );
            })}
            {onResetColumns ? (
              <TouchableOpacity onPress={onResetColumns} accessibilityRole="button" style={styles.columnReset}>
                <Text style={{ color: colors.brand, fontSize: 13 }}>Tilbakestill</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    width: '100%',
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 14,
    alignSelf: 'stretch',
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headTitle: { fontSize: 16, fontWeight: '400', flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 42,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  reset: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, width: '100%' },
  block: { gap: 8, flexGrow: 1, flexBasis: 220, minWidth: 0, maxWidth: '100%' },
  rowLabel: { fontSize: 11, fontWeight: '400', letterSpacing: 0.6, textTransform: 'uppercase' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  people: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  count: { fontSize: 12, fontWeight: '400' },
  dates: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dateInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
    minWidth: 140,
  },
  columnsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  columnReset: { justifyContent: 'center', paddingHorizontal: 4 },
});
