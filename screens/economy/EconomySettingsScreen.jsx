import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { isSuperAdmin } from '../../src/utils/groups';
import ChartOfAccountsSettings from '../../components/company/ChartOfAccountsSettings';
import StandardAccountSettings from '../../components/company/StandardAccountSettings';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';

const TABS = [
  { id: 'kontoplan', label: 'Kontoplan', icon: 'list-outline', hint: 'Salgs- og kjøpskontoer med MVA' },
  { id: 'regnskapskontoer', label: 'Standard regnskapskontoer', icon: 'wallet-outline', hint: 'Honorar, timer, utlegg, produkter og avrunding' },
];

function initialTab(startTab) {
  if (startTab === 'regnskapskontoer') return 'regnskapskontoer';
  return 'kontoplan';
}

/**
 * Økonomi → Innstillinger: kontoplan og standardkontoer.
 * Gjenbruker eksisterende komponenter og lagring.
 */
export default function EconomySettingsScreen({ startTab = 'kontoplan' } = {}) {
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
      nativeID="economy-settings"
      id="economy-settings"
    >
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        Økonomiinnstillinger
      </Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Kontoplan og standardkontoer brukes ved fakturering og bilag. Eksisterende verdier er uendret.
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
              nativeID={`economy-settings-tab-${row.id}`}
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
      {tab === 'kontoplan' ? (
        <ChartOfAccountsSettings familyId={familyId} colors={colors} canEdit={canEdit} />
      ) : (
        <StandardAccountSettings familyId={familyId} colors={colors} canEdit={canEdit} />
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
