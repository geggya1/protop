import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { accessSectionTitle } from '../../src/access/companyAccess';
import { useLayout } from '../../src/theme';
import {
  employeeDisplayName,
  employeePickerEmail,
  groupEmployeesForTimesheetPicker,
} from '../../src/arbeid/roles.js';

function countLine(activeCount, inactiveCount) {
  const activeLabel = activeCount === 1 ? '1 aktiv' : `${activeCount} aktive`;
  const inactiveLabel = inactiveCount === 1 ? '1 deaktivert' : `${inactiveCount} deaktiverte`;
  return `${activeLabel} · ${inactiveLabel}`;
}

/** Aktive / Deaktiverte med antall. Brukes også på Inntjening. */
export function ActivityTabs({ value, activeCount, inactiveCount, colors, onChange, idPrefix = '' }) {
  const tabs = [
    ['active', 'Aktive', activeCount],
    ['inactive', 'Deaktiverte', inactiveCount],
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map(([id, label, count]) => {
        const on = value === id;
        return (
          <Pressable
            key={id}
            nativeID={idPrefix ? `${idPrefix}-${id}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label}, ${count}`}
            onPress={() => onChange(id)}
            style={[styles.tab, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
          >
            <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: '600', fontSize: 13 }}>{label}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionDrawer({
  nativeID,
  title,
  meta,
  open,
  colors,
  onToggle,
  style,
  children,
}) {
  return (
    <View nativeID={nativeID} style={[styles.drawer, { borderColor: colors.line, backgroundColor: colors.card }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `Lukk ${title}` : `Åpne ${title}`}
        onPress={onToggle}
        style={styles.head}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
        <View style={styles.headText}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{meta}</Text>
        </View>
      </Pressable>
      {open ? <View style={[styles.body, { borderTopColor: colors.line }]}>{children}</View> : null}
    </View>
  );
}

/**
 * Komprimert personvalg for timeliste: intern/ekstern, aktive/deaktiverte, navn + e-post.
 * På bred skjerm står ansatte og eksterne side om side, hver med halv bredde.
 */
export default function TimesheetEmployeePicker({
  colors,
  employees = [],
  selectedId = '',
  companyName = '',
  query,
  onQueryChange,
  onSelect,
  searchRef = null,
  compact = false,
  title = 'Velg medarbeider',
  subtitle = 'Velg hvem du vil føre timer for.',
}) {
  const [companyOpen, setCompanyOpen] = useState(true);
  const [externalOpen, setExternalOpen] = useState(true);
  const [companyTab, setCompanyTab] = useState('active');
  const [externalTab, setExternalTab] = useState('active');
  const { isDesktop } = useLayout();
  const split = !compact && isDesktop;

  const groups = useMemo(
    () => groupEmployeesForTimesheetPicker(employees, query),
    [employees, query],
  );

  const companyShown = companyTab === 'inactive' ? groups.company.inactive : groups.company.active;
  const externalShown = externalTab === 'inactive' ? groups.external.inactive : groups.external.active;
  const totalHits = groups.company.active.length
    + groups.company.inactive.length
    + groups.external.active.length
    + groups.external.inactive.length;

  function renderRows(nativeID, rows, emptyText) {
    if (!rows.length) {
      return <Text style={{ color: colors.muted, fontSize: 13, paddingVertical: 6 }}>{emptyText}</Text>;
    }
    return (
      <View nativeID={nativeID} style={styles.list}>
        {rows.map((row) => {
          const selected = row.id === selectedId;
          const email = employeePickerEmail(row);
          return (
            <TouchableOpacity
              key={row.id}
              onPress={() => onSelect?.(row)}
              style={[
                styles.row,
                {
                  borderColor: colors.line,
                  backgroundColor: selected ? `${colors.brand}12` : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={email ? `${employeeDisplayName(row)}, ${email}` : employeeDisplayName(row)}
              nativeID={`timesheet-pick-${row.id}`}
            >
              <Text
                style={{ color: colors.ink, fontWeight: selected ? '700' : '600', fontSize: 14 }}
                numberOfLines={1}
              >
                {employeeDisplayName(row)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                {email || 'Ingen e-post'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <View
      style={[styles.root, compact && styles.rootCompact]}
      nativeID="timesheet-employee-picker"
    >
      {compact ? null : (
        <View style={styles.intro}>
          <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
          {subtitle ? <Text style={{ color: colors.muted, fontSize: 13 }}>{subtitle}</Text> : null}
        </View>
      )}
      <View dataSet={{ focusWithin: '1' }} style={[styles.search, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          ref={searchRef}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Søk navn, e-post, rolle eller ansattnr"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, { color: colors.ink }]}
          accessibilityLabel="Søk medarbeider"
          nativeID="arbeid-employee-picker-search"
        />
        {query ? (
          <TouchableOpacity onPress={() => onQueryChange?.('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Tøm søk">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        style={compact ? styles.scrollCompact : styles.scroll}
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {!totalHits ? (
          <Text style={{ color: colors.muted, paddingVertical: 12 }}>
            {String(query || '').trim()
              ? `Ingen treff for «${String(query).trim()}».`
              : 'Ingen medarbeidere å velge.'}
          </Text>
        ) : (
          <View style={split ? styles.split : styles.stack}>
            <SectionDrawer
              nativeID="timesheet-pick-section-company"
              title={accessSectionTitle('company', companyName)}
              meta={countLine(groups.company.active.length, groups.company.inactive.length)}
              open={companyOpen}
              colors={colors}
              onToggle={() => setCompanyOpen((open) => !open)}
              style={split && styles.splitCol}
            >
              <ActivityTabs
                value={companyTab}
                activeCount={groups.company.active.length}
                inactiveCount={groups.company.inactive.length}
                colors={colors}
                onChange={setCompanyTab}
              />
              {renderRows(
                'timesheet-pick-list-company',
                companyShown,
                companyTab === 'inactive' ? 'Ingen deaktiverte ansatte.' : 'Ingen aktive ansatte.',
              )}
            </SectionDrawer>
            <SectionDrawer
              nativeID="timesheet-pick-section-external"
              title={accessSectionTitle('external', companyName)}
              meta={countLine(groups.external.active.length, groups.external.inactive.length)}
              open={externalOpen}
              colors={colors}
              onToggle={() => setExternalOpen((open) => !open)}
              style={split && styles.splitCol}
            >
              <ActivityTabs
                value={externalTab}
                activeCount={groups.external.active.length}
                inactiveCount={groups.external.inactive.length}
                colors={colors}
                onChange={setExternalTab}
              />
              {renderRows(
                'timesheet-pick-list-external',
                externalShown,
                externalTab === 'inactive' ? 'Ingen deaktiverte eksterne.' : 'Ingen aktive eksterne.',
              )}
            </SectionDrawer>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, gap: 10 },
  rootCompact: { maxHeight: 420 },
  intro: { gap: 4 },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'web' ? 8 : 6,
  },
  searchInput: { flex: 1, fontSize: 14, outlineStyle: 'none', minHeight: 22 },
  scroll: { flex: 1, minHeight: 0 },
  scrollCompact: { maxHeight: 340 },
  scrollInner: { gap: 10, paddingBottom: 12 },
  stack: { gap: 10 },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  splitCol: { flex: 1, minWidth: 0 },
  drawer: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  headText: { flex: 1, gap: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  body: { borderTopWidth: 1, padding: 10, gap: 8 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: { gap: 0 },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 2,
  },
});
