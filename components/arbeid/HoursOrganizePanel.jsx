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
  DEFAULT_HOUR_COLUMNS,
  HOUR_COLUMNS,
  HOUR_GROUP_OPTIONS,
  HOUR_PERIODS,
  HOUR_SORT_OPTIONS,
  formatHours,
} from '../../src/economy/hoursList.js';

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

export default function HoursOrganizePanel({
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
  groupBy,
  onGroupBy,
  sort,
  onSort,
  visibleColumns,
  onToggleColumn,
  onResetColumns,
  employeeId,
  onEmployee,
  employees = [],
  customerId,
  onCustomer,
  customers = [],
  projectId,
  onProject,
  projects = [],
  activityName,
  onActivity,
  activities = [],
  billable,
  onBillable,
  onReset,
  onClose,
}) {
  const visible = new Set(visibleColumns?.length ? visibleColumns : DEFAULT_HOUR_COLUMNS);

  return (
    <View
      style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}
      nativeID="hours-organize-panel"
    >
      <View style={styles.panelHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>Filtrer</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Periode laster flere timer. Søk, sorter og kolonner gjelder utvalget.
          </Text>
        </View>
        {onClose ? (
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk organisering">
            <Ionicons name="close" size={20} color={colors.ink} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
        <Section title="Søk" colors={colors}>
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Ansatt, kunde, prosjekt…"
            placeholderTextColor={colors.placeholder}
            nativeID="hours-organize-search"
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
        </Section>

        <Section title="Periode" colors={colors}>
          <View style={styles.wrap}>
            {HOUR_PERIODS.map((item) => (
              <Choice
                key={item.id}
                label={item.label}
                on={period === item.id}
                onPress={() => onPeriod(item.id)}
                colors={colors}
                testID={`hours-period-${item.id}`}
              />
            ))}
          </View>
          {period === 'custom' ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <TextInput
                value={fromDate}
                onChangeText={onFromDate}
                onBlur={onFromDateBlur}
                placeholder="Fra (dd.mm.åååå)"
                placeholderTextColor={colors.placeholder}
                nativeID="hours-from-date"
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
              <TextInput
                value={toDate}
                onChangeText={onToDate}
                onBlur={onToDateBlur}
                placeholder="Til (dd.mm.åååå)"
                placeholderTextColor={colors.placeholder}
                nativeID="hours-to-date"
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
            </View>
          ) : null}
        </Section>

        <Section title="Gruppering" colors={colors}>
          <View style={styles.wrap}>
            {HOUR_GROUP_OPTIONS.map((item) => (
              <Choice
                key={item.id}
                label={item.label}
                on={groupBy === item.id}
                onPress={() => onGroupBy(item.id)}
                colors={colors}
                testID={`hours-group-${item.id}`}
              />
            ))}
          </View>
        </Section>

        <Section title="Sortering" colors={colors}>
          <View style={styles.wrap}>
            {HOUR_SORT_OPTIONS.map((item) => (
              <Choice
                key={item.id}
                label={item.label}
                on={sort === item.id}
                onPress={() => onSort(item.id)}
                colors={colors}
                testID={`hours-sort-${item.id}`}
              />
            ))}
          </View>
        </Section>

        <Section title="Medarbeidere med timer" colors={colors}>
          <View style={styles.wrap}>
            <Choice
              label="Alle"
              on={!employeeId}
              onPress={() => onEmployee('')}
              colors={colors}
              testID="hours-employee-all"
            />
            {employees.map((item) => (
              <Choice
                key={item.id}
                label={`${item.name} · ${formatHours(item.hours)}`}
                on={employeeId === item.id}
                onPress={() => onEmployee(item.id)}
                colors={colors}
                testID={`hours-employee-${item.id}`}
              />
            ))}
          </View>
          {!employees.length ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen medarbeidere har timer i dette utvalget.</Text>
          ) : null}
        </Section>

        <Section title="Fakturering" colors={colors}>
          <View style={styles.wrap}>
            {[
              { id: '', label: 'Alle' },
              { id: 'billable', label: 'Fakturerbart' },
              { id: 'nonbillable', label: 'Ikke fakturerbart' },
            ].map((item) => (
              <Choice
                key={item.id || 'all'}
                label={item.label}
                on={billable === item.id}
                onPress={() => onBillable(item.id)}
                colors={colors}
              />
            ))}
          </View>
        </Section>

        {customers.length ? (
          <Section title="Kunde" colors={colors}>
            <View style={styles.wrap}>
              <Choice label="Alle" on={!customerId} onPress={() => onCustomer('')} colors={colors} />
              {customers.map((item) => (
                <Choice
                  key={item.id || item.name}
                  label={item.name}
                  on={customerId === item.id}
                  onPress={() => onCustomer(item.id)}
                  colors={colors}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {projects.length ? (
          <Section title="Prosjekt" colors={colors}>
            <View style={styles.wrap}>
              <Choice label="Alle" on={!projectId} onPress={() => onProject('')} colors={colors} />
              {projects.map((item) => (
                <Choice
                  key={item.id || item.name}
                  label={item.name}
                  on={projectId === item.id}
                  onPress={() => onProject(item.id)}
                  colors={colors}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {activities.length ? (
          <Section title="Aktivitet" colors={colors}>
            <View style={styles.wrap}>
              <Choice label="Alle" on={!activityName} onPress={() => onActivity('')} colors={colors} />
              {activities.map((item) => (
                <Choice
                  key={item.id}
                  label={item.name}
                  on={activityName === item.id}
                  onPress={() => onActivity(item.id)}
                  colors={colors}
                />
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="Kolonner" colors={colors}>
          <View style={{ gap: 6 }}>
            {HOUR_COLUMNS.map((column) => {
              const on = visible.has(column.key);
              return (
                <TouchableOpacity
                  key={column.key}
                  onPress={() => onToggleColumn(column.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  nativeID={`hours-column-${column.key}`}
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
          nativeID="hours-organize-reset"
          style={[styles.reset, { borderTopColor: colors.line }]}
        >
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Nullstill utvalg</Text>
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
