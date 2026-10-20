import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { isSuperAdmin } from '../../src/utils/groups';
import AbsenceTypeSettings from '../../components/company/AbsenceTypeSettings';
import HolidaySettings from '../../components/company/HolidaySettings';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';

const TABS = [
  { id: 'fravaerstyper', label: 'Fraværstyper', icon: 'sunny-outline', hint: 'Betalt fravær, timebalanse og fakturerbart arbeid' },
  { id: 'fridager', label: 'Fridager', icon: 'calendar-outline', hint: 'Helligdager og egne fridager i timelisten' },
];

function initialTab(startTab) {
  if (startTab === 'fridager') return 'fridager';
  return 'fravaerstyper';
}

/**
 * Fravær → Innstillinger: fraværstyper og fridager.
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
        Typene og fridagene styrer hvordan fravær beregnes i timeliste, lønn og fakturerbart arbeid.
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
      ) : (
        <HolidaySettings familyId={familyId} colors={colors} canEdit={canEdit} />
      )}
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
