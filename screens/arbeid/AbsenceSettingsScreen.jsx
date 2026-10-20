import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { isSuperAdmin } from '../../src/utils/groups';
import AbsenceTypeSettings from '../../components/company/AbsenceTypeSettings';
import HolidaySettings from '../../components/company/HolidaySettings';
import VacationPlanPanel from '../../components/arbeid/VacationPlanPanel';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { employeeDisplayName } from '../../src/arbeid/roles.js';
import { employeeActivityTab } from '../../src/employees/model.js';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { applyVacationPlan } from '../../src/arbeid/vacationPlanApply.js';
import { loadVacationPlan, saveVacationPlan } from '../../src/arbeid/vacationPlanStorage.js';
import { publishVacationPlanNotice, sweepVacationPlan } from '../../src/arbeid/vacationPlanClient.js';
import { normalizeVacationPlan } from '../../src/arbeid/vacationPlan.js';
import { saveProjectState } from '../../src/project/storage';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';

const TABS = [
  { id: 'fravaerstyper', label: 'Fraværstyper', icon: 'sunny-outline', hint: 'Betalt fravær, timebalanse og fakturerbart arbeid' },
  { id: 'fridager', label: 'Fridager', icon: 'calendar-outline', hint: 'Helligdager og egne fridager i timelisten' },
  { id: 'ferieplan', label: 'Ferieplan', icon: 'airplane-outline', hint: 'Inngående feriedagssaldo for aktive interne ansatte' },
];

function initialTab(startTab) {
  if (startTab === 'fridager') return 'fridager';
  if (startTab === 'ferieplan') return 'ferieplan';
  return 'fravaerstyper';
}

function VacationPlanSettings({ colors, canEdit }) {
  const { familyId, family } = useApp();
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    fromDate: `${year - 1}-01-01`,
    toDate: `${year + 1}-12-31`,
    absences: { all: true },
    liveAbsences: true,
  });
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [planError, setPlanError] = useState('');

  useEffect(() => {
    let stop = false;
    if (!familyId) {
      setPlan(normalizeVacationPlan({}));
      return undefined;
    }
    loadVacationPlan(familyId).then((loaded) => {
      if (stop) return;
      setPlan(loaded);
      if (!loaded?.announcedAt) return;
      sweepVacationPlan(familyId).then((result) => {
        if (!stop && result?.plan) setPlan(normalizeVacationPlan(result.plan));
      }).catch(() => {});
    });
    return () => { stop = true; };
  }, [familyId]);

  const today = toDateKey(new Date());
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;
  const people = (workspace.employees || []).filter((row) => employeeActivityTab(row) !== 'trash');
  const names = {};
  for (const row of people) names[row.id] = employeeDisplayName(row);
  const companyName = String(family?.company?.navn || family?.name || '').trim();

  async function persist(draft, { announce }) {
    if (!canEdit) {
      setPlanError('Du har ikke tilgang til å endre ferieplanen.');
      return;
    }
    if (announce && !draft?.planDeadline) {
      setPlanError('Sett en frist for planleggingen før du sender meldingen.');
      return;
    }
    setBusy(true);
    setPlanError('');
    setNotice('');
    try {
      let next = normalizeVacationPlan(draft);
      if (announce) next = normalizeVacationPlan({ ...next, announcedAt: new Date().toISOString() });
      next = await saveVacationPlan(familyId, next);
      if (announce || next.announcedAt) {
        const applied = applyVacationPlan(workspace.state, next, people, {
          today,
          dayHours: fullDay,
          assignDates: announce,
        });
        if (!applied.ok) throw new Error(applied.error || 'Kunne ikke oppdatere startsaldo.');
        await saveProjectState(applied.state, familyId);
        workspace.setState(applied.state);
      }
      setPlan(next);
      if (!announce) {
        setNotice(next.announcedAt ? 'Ferieplanen er lagret og startsaldone er oppdatert.' : 'Ferieplanen er lagret.');
        return;
      }
      const sent = await publishVacationPlanNotice(familyId);
      if (!sent?.ok) throw new Error(sent?.error || 'Meldingen ble ikke sendt.');
      const mailNote = sent.mailConfigured === false ? ' E-post er ikke satt opp, så bare varslet i ProTop gikk ut.' : '';
      setNotice(`Melding sendt. ${sent.sent || 0} e-poster, ${sent.notified || 0} varsler i ProTop.${mailNote}`);
    } catch (err) {
      setPlanError(err?.message || 'Kunne ikke lagre ferieplanen.');
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    return (
      <View style={{ paddingVertical: 12 }}>
        <Text style={{ color: colors.muted }}>Henter ferieplan…</Text>
      </View>
    );
  }

  return (
    <VacationPlanPanel
      plan={plan}
      employees={people}
      names={names}
      absences={workspace.state.absences || []}
      dayHours={fullDay}
      today={today}
      canManage
      variant="settings"
      companyName={companyName}
      busy={busy}
      notice={notice}
      error={planError}
      onChange={setPlan}
      onSave={canEdit ? (draft) => persist(draft, { announce: false }) : undefined}
      onSend={canEdit ? (draft) => persist(draft, { announce: true }) : undefined}
    />
  );
}

/**
 * Fravær → Innstillinger: fraværstyper, fridager og ferieplan.
 * Gjenbruker eksisterende komponenter og lagring.
 */
export default function AbsenceSettingsScreen({ startTab = 'fravaerstyper' } = {}) {
  const colors = useColors();
  const { family, familyId, uid } = useApp();
  const access = useCompanyAccess();
  const owner = isSuperAdmin(family, uid);
  const canEdit = (owner && !access.previewLocks('companyProfile'))
    || (access.ready && access.can('companyProfile', 'write'));
  const canOpen = (owner && !access.previewLocks('companyProfile'))
    || (access.ready && access.can('companyProfile', 'read'));
  const [tab, setTab] = useState(initialTab(startTab));

  useEffect(() => {
    setTab(initialTab(startTab));
  }, [startTab]);

  if (!access.ready && !owner) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, padding: 16 }]}>
        <Text style={{ color: colors.muted }}>Henter tilgang…</Text>
      </View>
    );
  }

  if (!canOpen) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg, padding: 16 }]}>
        <CompanyAccessDenied colors={colors} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      nativeID="absence-settings"
      id="absence-settings"
    >
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        Fraværsinnstillinger
      </Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Typene, fridagene og ferieplanen styrer hvordan fravær beregnes i timeliste, lønn og fakturerbart arbeid.
      </Text>
      <View style={styles.tabs}>
        {TABS.map((row) => {
          const on = tab === row.id;
          return (
            <TouchableOpacity
              key={row.id}
              onPress={() => setTab(row.id)}
              style={[
                styles.tab,
                {
                  borderColor: on ? colors.brand : colors.line,
                  backgroundColor: on ? colors.brandSoft : colors.card,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={row.label}
              nativeID={`absence-settings-tab-${row.id}`}
            >
              <Ionicons name={row.icon} size={18} color={on ? colors.brand : colors.ink} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: '600' }}>{row.label}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>{row.hint}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {tab === 'fravaerstyper' ? (
        <AbsenceTypeSettings familyId={familyId} colors={colors} canEdit={canEdit} />
      ) : null}
      {tab === 'fridager' ? (
        <HolidaySettings familyId={familyId} colors={colors} canEdit={canEdit} />
      ) : null}
      {tab === 'ferieplan' ? (
        <VacationPlanSettings colors={colors} canEdit={canEdit} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: 16, paddingBottom: 48, maxWidth: 980, width: '100%', alignSelf: 'flex-start', gap: 14 },
  title: { fontSize: 22, fontWeight: '600' },
  lead: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: {
    flexGrow: 1,
    flexBasis: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 56,
  },
});
