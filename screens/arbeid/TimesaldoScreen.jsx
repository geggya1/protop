import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
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
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { useColors } from '../../src/context/ThemeContext';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import TimesheetEmployeePicker from '../../components/arbeid/TimesheetEmployeePicker';
import WorkingTimeWarnings from '../../components/arbeid/WorkingTimeWarnings';
import { canManageTimesheets, employeeDisplayName } from '../../src/arbeid/roles.js';
import {
  canSwitchTimesheetPerson,
  needsTimesheetPersonStep,
} from '../../src/arbeid/timesheetIdentity.js';
import { buildTimesaldo } from '../../src/arbeid/balance.js';
import { agreedHoursForDate, resolveRedDays } from '../../src/arbeid/holidays.js';
import { resolveAbsenceTypes } from '../../src/arbeid/absenceCatalog.js';
import { scheduledHours, timeSettingsOf } from '../../src/arbeid/schedule.js';
import { formatHours, parseHours } from '../../src/arbeid/hours.js';
import { setBalanceAdjustment } from '../../src/arbeid/timesheetState.js';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';
import { useModuleHeroHosted } from '../../components/ModulePageBg';

function todayKey() {
  return toDateKey(new Date());
}

export default function TimesaldoScreen({
  lockedEmployeeId = '', companyId = '', embedded = false,
  // Rettighetstrinn: 'read' = bare se, 'edit' = justere uten å fjerne, 'admin' = alt.
  // Tomt: følger Timesaldo i tilgangsstyringen.
  rights: rightsProp = '',
} = {}) {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { family, isAdmin } = useApp();
  const access = useCompanyAccess();
  const [through, setThrough] = useState(todayKey());
  const year = Number(through.slice(0, 4)) || new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    companyId,
    lockedEmployeeId,
    fromDate: `${year}-01-01`,
    toDate: through,
  });
  const [employeeId, setEmployeeId] = useState('');
  const [chosen, setChosen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState('');
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [empPickerQuery, setEmpPickerQuery] = useState('');
  const pickerSearchRef = useRef(null);

  const rights = rightsProp || (!access.ready
    ? 'read'
    : access.canAdmin('hoursBalance') ? 'admin' : access.canEdit('hoursBalance') ? 'edit' : 'read');
  const readOnly = rights === 'read';
  const lockedId = workspace.lockedId;
  // Admin på Timesaldo kan åpne alle medarbeidere, som i timerapporten.
  const manager = workspace.manager || (!lockedId && !workspace.personal && access.ready && rights === 'admin');
  const canSwitchPerson = canSwitchTimesheetPerson({ locked: !!lockedId, manager });
  const activeId = lockedId || employeeId || '';
  const needsPersonStep = needsTimesheetPersonStep({
    locked: !!lockedId,
    manager,
    employeeId: activeId,
    chosen: canSwitchPerson ? chosen : null,
  });

  useEffect(() => {
    if (lockedId) {
      setEmployeeId(lockedId);
      return;
    }
    // Mulige ledere venter på tilgang, så de ikke får auto-valg før steg 1.
    const maybeManager = isAdmin || canManageTimesheets({ isAdmin, employee: workspace.linked });
    if (maybeManager && !access.ready) return;
    // Bedrift: leder velger person først (samme som timeliste).
    if (manager) return;
    if (employeeId) return;
    if (workspace.linked?.id) setEmployeeId(workspace.linked.id);
  }, [workspace.linked, manager, employeeId, lockedId, access.ready, isAdmin]);

  useEffect(() => {
    if (!empPickerOpen) {
      setEmpPickerQuery('');
      return undefined;
    }
    const timer = setTimeout(() => pickerSearchRef.current?.focus?.(), 60);
    return () => clearTimeout(timer);
  }, [empPickerOpen]);

  const employee = workspace.employees.find((row) => row.id === activeId)
    || (!canSwitchPerson ? workspace.linked : null);
  const selectedName = employeeDisplayName(employee) || 'Medarbeider';
  const settings = timeSettingsOf(employee);
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;
  const companyLabel = String(family?.company?.navn || family?.name || '').trim();

  const report = useMemo(() => {
    if (!activeId) {
      return { rows: [], totals: {
        agreed: 0, actual: 0, paidAbsence: 0, unpaidAbsence: 0,
        payrollIncl: 0, payrollExcl: 0, flex: 0, adjustment: 0, saldo: 0,
      } };
    }
    return buildTimesaldo({
      year,
      throughDate: through,
      employeeId: activeId,
      entries: workspace.state.timeEntries,
      absences: workspace.state.absences,
      adjustments: workspace.state.balanceAdjustments,
      flexCountsAsPay: settings.flexCountsAsPay,
      types: resolveAbsenceTypes(workspace.state),
      agreedForDate: (dateKey) => {
        const [yy, mm, dd] = String(dateKey).split('-').map(Number);
        const date = new Date(yy, (mm || 1) - 1, dd || 1);
        const schedule = scheduledHours(employee, date, fullDay);
        return agreedHoursForDate(date, {
          fullDayHours: fullDay,
          redDays: resolveRedDays(workspace.state, [yy || year]),
          scheduleHours: schedule,
        }).hours;
      },
    });
  }, [year, through, activeId, workspace.state, settings.flexCountsAsPay, employee, fullDay]);

  function saveAdjustment() {
    if (!edit || !activeId || readOnly) return;
    // Begrenset redigering: justere, men ikke fjerne en justering som finnes.
    if (rights !== 'admin' && Number(edit.adjustment || 0) !== 0 && parseHours(draft) === 0) {
      workspace.setError('Bare Admin kan fjerne en justering.');
      return;
    }
    const result = setBalanceAdjustment(workspace.state, {
      employeeId: activeId,
      month: edit.month,
      hours: parseHours(draft),
      note: 'Timebank tatt ut i lønn',
    });
    if (!result.ok) {
      workspace.setError(result.error);
      return;
    }
    workspace.setState(result.state);
    workspace.setError('');
    setEdit(null);
  }

  if (needsPersonStep) {
    return (
      <View
        style={[styles.screen, { backgroundColor: colors.bg }]}
        nativeID="timesaldo-screen"
      >
        {hostedHero || embedded ? null : (
          <Text style={[styles.crumb, { color: colors.muted, marginBottom: 8 }]}>
            Arbeid / Timesaldo
          </Text>
        )}
        <TimesheetEmployeePicker
          colors={colors}
          employees={workspace.employees}
          selectedId={employeeId}
          companyName={companyLabel}
          query={empPickerQuery}
          onQueryChange={setEmpPickerQuery}
          onSelect={(row) => {
            setEmployeeId(row.id);
            setChosen(true);
            setEmpPickerQuery('');
          }}
          title="Velg medarbeider"
          subtitle="Steg 1 · Velg intern eller ekstern medarbeider for å åpne timesaldo."
        />
        <BrandBusyOverlay
          visible={!workspace.ready}
          label="Vent…"
          detail="Henter medarbeidere."
        />
      </View>
    );
  }

  return (
    <View style={[styles.screenRoot, { backgroundColor: colors.bg }]} nativeID="timesaldo-screen">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
        {hostedHero || embedded ? null : (
          <Text style={[styles.crumb, { color: colors.muted }]}>
            {lockedId ? 'Ansatte / Timesaldo' : 'Arbeid / Timesaldo'}
          </Text>
        )}
        <View style={styles.head}>
          {embedded ? null : (
          <TouchableOpacity
            onPress={() => canSwitchPerson && setEmpPickerOpen(true)}
            style={styles.empBtn}
            disabled={!canSwitchPerson}
            activeOpacity={canSwitchPerson ? 0.7 : 1}
            accessibilityRole="button"
            accessibilityLabel={canSwitchPerson ? 'Skift person' : selectedName}
            nativeID="timesaldo-employee-name"
          >
            {employee?.person?.photoUrl ? (
              <Image
                source={{ uri: employee.person.photoUrl }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: `${colors.brand}22` }]}>
                <Ionicons name="person" size={16} color={colors.brand} />
              </View>
            )}
            <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
              {selectedName}
            </Text>
            {canSwitchPerson ? <Ionicons name="chevron-down" size={18} color={colors.muted} /> : null}
          </TouchableOpacity>
          )}
          <View style={styles.through}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Sluttdato</Text>
            <TextInput
              value={through}
              onChangeText={setThrough}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              accessibilityLabel="Sluttdato"
              nativeID="timesaldo-through"
            />
          </View>
        </View>
        {workspace.error ? <Text style={{ color: colors.danger || '#b42318', marginBottom: 8 }}>{workspace.error}</Text> : null}
        <Text style={{ color: colors.muted, marginBottom: 10, maxWidth: 640 }}>
          Saldo er timebank. Justering ned brukes når overtid tas ut i lønn.
        </Text>
        {rights === 'admin' || !access.ready ? null : (
          <Text style={{ color: colors.muted, marginBottom: 10, fontSize: 13 }} nativeID="timesaldo-rights">
            {readOnly
              ? 'Du har lesetilgang. Saldoen kan ses, men ikke justeres.'
              : 'Du kan justere saldoen, men ikke fjerne justeringer.'}
          </Text>
        )}
        <ScrollView horizontal nativeID="timesaldo-table">
          <View>
            <View style={[styles.row, { backgroundColor: colors.sunken || '#f4f4f5' }]}>
              {['Måned', 'Avtalte timer', 'Faktiske timer', 'Med lønn', 'Uten lønn', 'Inkl. overtid', 'Ekskl. overtid', 'Mertid', 'Justering', 'Saldo'].map((label) => (
                <Text key={label} style={[styles.cell, styles.headCell, { color: colors.muted }]}>{label}</Text>
              ))}
            </View>
            {report.rows.map((row) => (
              <View key={row.id} style={[styles.row, { borderBottomColor: colors.line }]}>
                <Text style={[styles.cell, { color: colors.ink, fontWeight: '600' }]}>{row.label}</Text>
                {row.kind === 'opening' ? (
                  <Text style={[styles.cell, { color: colors.muted }]} />
                ) : (
                  <Text style={[styles.cell, { color: colors.ink }]}>
                    {row.partial ? `${formatHours(row.agreed)} (av ${formatHours(row.agreedFull)})` : formatHours(row.agreed)}
                  </Text>
                )}
                <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.actual)}</Text>
                <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.paidAbsence)}</Text>
                <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.unpaidAbsence)}</Text>
                <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.payrollIncl)}</Text>
                <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.payrollExcl)}</Text>
                <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.flex, { signed: true })}</Text>
                {readOnly ? (
                  <Text style={[styles.cell, { color: colors.ink }]}>{formatHours(row.adjustment || 0)}</Text>
                ) : (
                <TouchableOpacity
                  onPress={() => { setEdit(row); setDraft(formatHours(row.adjustment || 0)); }}
                  style={styles.cell}
                  accessibilityRole="button"
                  accessibilityLabel={`Juster ${row.label}`}
                  nativeID={`timesaldo-adjust-${row.month}`}
                >
                  <Text style={{ color: colors.ink }}>{formatHours(row.adjustment || 0)}</Text>
                  <Ionicons name="pencil" size={12} color={colors.brand} />
                </TouchableOpacity>
                )}
                <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(row.saldo)}</Text>
              </View>
            ))}
            <View style={[styles.row, { backgroundColor: colors.sunken || '#f4f4f5' }]}>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>Totalt</Text>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.agreed)}</Text>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.actual)}</Text>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.paidAbsence)}</Text>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.unpaidAbsence)}</Text>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.payrollIncl)}</Text>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.payrollExcl)}</Text>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.flex, { signed: true })}</Text>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.adjustment)}</Text>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.saldo)}</Text>
            </View>
          </View>
        </ScrollView>
        {edit ? (
          <View style={[styles.editor, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="timesaldo-editor">
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Justering · {edit.label}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Negativt tall tar timer ut av timebanken og over i lønn.</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, marginTop: 8 }]}
              accessibilityLabel="Justeringstimer"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity onPress={() => setEdit(null)} style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}>
                <Text style={{ color: colors.ink }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveAdjustment} style={[styles.btn, { backgroundColor: colors.brand }]} nativeID="timesaldo-save">
                <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {/* Overtid og hviletid (AML kap. 10) for timene som er lastet: fra 1. januar til sluttdatoen. */}
        <WorkingTimeWarnings
          colors={colors}
          entries={workspace.state.timeEntries}
          employeeId={activeId}
          from={`${year}-01-01`}
          to={through}
          nativeID="timesaldo-working-time"
        />
      </ScrollView>

      <Modal transparent visible={empPickerOpen} animationType="fade" onRequestClose={() => setEmpPickerOpen(false)}>
        <View style={styles.modalBg}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setEmpPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Lukk medarbeidervelger"
          />
          <View
            style={[styles.sheet, styles.pickerSheet, { backgroundColor: colors.card, borderColor: colors.line }]}
            accessibilityViewIsModal
          >
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Bytt medarbeider</Text>
            <TimesheetEmployeePicker
              colors={colors}
              employees={workspace.employees}
              selectedId={employeeId}
              companyName={companyLabel}
              query={empPickerQuery}
              onQueryChange={setEmpPickerQuery}
              searchRef={pickerSearchRef}
              compact
              title="Bytt medarbeider"
              subtitle=""
              onSelect={(row) => {
                setEmployeeId(row.id);
                setChosen(true);
                setEmpPickerOpen(false);
                setEmpPickerQuery('');
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, minHeight: 0 },
  screen: { flex: 1, padding: 16, minHeight: 420 },
  body: { padding: 16, gap: 4, paddingBottom: 40 },
  crumb: { fontSize: 12, marginBottom: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 8 },
  empBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', flexShrink: 1, letterSpacing: -0.3 },
  through: { gap: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 140 },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  cell: { width: 120, paddingVertical: 10, paddingHorizontal: 8, fontSize: 12 },
  headCell: { fontSize: 11, fontWeight: '600' },
  editor: { marginTop: 16, borderWidth: 1, borderRadius: 12, padding: 12, maxWidth: 420, gap: 4 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
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
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  pickerSheet: { zIndex: 2, maxHeight: '80%', position: 'relative' },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
});
