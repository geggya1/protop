import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  cardSubtitle,
  displayName,
  employmentState,
  statusLabel,
} from '../../src/employees/model';
import { EMPLOYEE_DETAIL_TABS, employeeViewToTab } from '../../src/employees/personTabs.js';
import { useLayout } from '../../src/theme';
import BackLink from '../../src/ui/BackLink';
import { SHELL_DETAILS } from '../../src/navigation/shellPaths';
import { radius, space, type } from '../../src/ui/tokens';
import PageTabs from '../../components/PageTabs';
import TimesheetEmployeePicker from '../../components/arbeid/TimesheetEmployeePicker';

export { EMPLOYEE_DETAIL_TABS, employeeViewToTab };

/** Tekst på banneret når ansettelsen er avsluttet. */
function closedNote(state) {
  if (state === 'deleted') return 'Kontoen er deaktivert og ligger i papirkurven.';
  if (state === 'ended') return 'Sluttdatoen («Ansatt til») er passert. Personen har ingen tilgang.';
  return 'Kontoen er deaktivert. Personen har ikke vanlig tilgang.';
}

/** Kortnavn på fanen på telefon, så flere faner får plass. */
const SHORT = { expenses: 'Utlegg' };

/**
 * Fast person-chrome, likt HR og de andre modulene: fanene rett under båndet,
 * så én rad med tilbake, navnet og Forrige/Neste. Navnet åpner personvelgeren (som i Timeliste).
 */
export default function EmployeePersonChrome({
  employee,
  colors,
  companyName = '',
  siblings = [],
  // Egen side (Bedrift › Ansatt): bare deg selv, uten vei til registeret eller andre ansatte.
  own = false,
  people = null,
  activeTab = 'home',
  onBack,
  onTab,
  onSelect,
  tabs = EMPLOYEE_DETAIL_TABS,
  children,
}) {
  const { isPhone } = useLayout();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const index = siblings.findIndex((row) => row.id === employee?.id);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const name = displayName(employee);
  const status = statusLabel(employee?.company?.status);
  const state = employmentState(employee);
  const deactivated = state !== 'active' && state !== 'leave';
  const subtitle = cardSubtitle(employee, companyName);
  const pickable = people || siblings;
  const canSwitch = !own && !!onSelect && pickable.length > 1;

  const pageTabs = useMemo(() => tabs.map((tab) => ({ ...tab, short: SHORT[tab.id] })), [tabs]);

  useEffect(() => {
    if (!pickerOpen || Platform.OS !== 'web') return undefined;
    const timer = setTimeout(() => searchRef.current?.focus?.(), 60);
    return () => clearTimeout(timer);
  }, [pickerOpen]);

  const closePicker = () => {
    setPickerOpen(false);
    setQuery('');
  };

  return (
    <View nativeID="employee-person-chrome" style={styles.root}>
      <PageTabs id="employee" label={name || 'Medarbeider'} tabs={pageTabs} value={activeTab} onChange={onTab} />

      <View style={[styles.body, isPhone && styles.bodyPhone]}>
        <View style={styles.identity}>
          {own ? null : (
            <>
              <BackLink label={SHELL_DETAILS.employee.list} onPress={onBack} nativeID="employee-back" />
              <View style={[styles.divider, { backgroundColor: colors.line }]} />
            </>
          )}
          {/* Navn og status på én linje: navnet tar lite høyde, og siden under får plassen. */}
          <View style={[styles.titleBlock, !isPhone && styles.titleRow]}>
            <Pressable
              onPress={() => canSwitch && setPickerOpen(true)}
              disabled={!canSwitch}
              accessibilityRole="button"
              accessibilityLabel={canSwitch ? `${name}. Skift person` : name}
              nativeID="employee-name"
              style={({ hovered }) => [styles.nameBtn, hovered && canSwitch ? { opacity: 0.75 } : null]}
            >
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={[styles.name, isPhone && styles.namePhone, styles.nameText, { color: colors.ink }]}
              >
                {name}
              </Text>
              {canSwitch ? <Ionicons name="chevron-down" size={16} color={colors.muted} /> : null}
            </Pressable>
            <Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>
              {deactivated ? (
                <Text style={{ color: colors.danger || '#dc2626' }}>{state === 'ended' ? 'Sluttet' : 'Deaktivert'}</Text>
              ) : (
                <Text style={{ color: colors.muted }}>{status}</Text>
              )}
              {subtitle ? ` · ${subtitle}` : ''}
            </Text>
          </View>
          {own ? null : <View style={styles.navActions}>
            <TouchableOpacity
              onPress={() => prev && onSelect?.(prev)}
              disabled={!prev}
              accessibilityRole="button"
              accessibilityLabel="Forrige medarbeider"
              hitSlop={4}
              style={[styles.navIcon, { borderColor: colors.line, backgroundColor: colors.card, opacity: prev ? 1 : 0.45 }]}
            >
              <Ionicons name="chevron-back" size={16} color={colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => next && onSelect?.(next)}
              disabled={!next}
              accessibilityRole="button"
              accessibilityLabel="Neste medarbeider"
              hitSlop={4}
              style={[styles.navIcon, { borderColor: colors.line, backgroundColor: colors.card, opacity: next ? 1 : 0.45 }]}
            >
              <Ionicons name="chevron-forward" size={16} color={colors.ink} />
            </TouchableOpacity>
          </View>}
        </View>

        {deactivated ? (
          <View
            nativeID="employee-deactivated"
            style={[styles.deactivatedBanner, { backgroundColor: '#fde8e8', borderColor: colors.danger || '#dc2626' }]}
          >
            <Ionicons name="remove-circle" size={18} color={colors.danger || '#dc2626'} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.danger || '#dc2626', fontWeight: '600' }}>{state === 'ended' ? 'Sluttet' : 'Deaktivert'}</Text>
              <Text style={{ color: colors.danger || '#dc2626', fontSize: 13, lineHeight: 18 }}>
                {closedNote(state)}
              </Text>
            </View>
          </View>
        ) : null}

        {children}
      </View>

      {/* Personvelger: samme som «Bytt medarbeider» i Timeliste. Fanen du står på, beholdes. */}
      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={closePicker}>
        <View style={styles.modalBg}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closePicker}
            accessibilityRole="button"
            accessibilityLabel="Lukk medarbeidervelger"
          />
          <View
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
            accessibilityViewIsModal
            nativeID="employee-person-picker"
          >
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Bytt medarbeider</Text>
            <TimesheetEmployeePicker
              colors={colors}
              employees={pickable}
              selectedId={employee?.id || ''}
              companyName={companyName}
              query={query}
              onQueryChange={setQuery}
              searchRef={searchRef}
              compact
              title="Bytt medarbeider"
              subtitle=""
              onSelect={(row) => {
                closePicker();
                if (row.id !== employee?.id) onSelect?.(row);
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', flexShrink: 0 },
  body: { paddingHorizontal: space.md, paddingVertical: 6, gap: 8 },
  bodyPhone: { paddingHorizontal: space.sm, paddingVertical: 4, gap: 6 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  divider: { width: 1, alignSelf: 'stretch', marginVertical: 6 },
  titleBlock: { flex: 1, minWidth: 0, gap: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  meta: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  nameBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  name: { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.2 },
  namePhone: { fontSize: 16, lineHeight: 22 },
  nameText: { flexShrink: 1 },
  navIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  navActions: { flexDirection: 'row', gap: 6 },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deactivatedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    zIndex: 2,
    position: 'relative',
  },
  sheetTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12 },
});
