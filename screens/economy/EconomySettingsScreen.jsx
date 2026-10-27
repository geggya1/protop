import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { isSuperAdmin } from '../../src/utils/groups';
import ChartOfAccountsSettings from '../../components/company/ChartOfAccountsSettings';
import StandardAccountSettings from '../../components/company/StandardAccountSettings';
import CompanyInvoiceDefaultsSettings from '../../components/company/CompanyInvoiceDefaultsSettings';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import PowerOfficeSettings from './PowerOfficeSettings';

const TABS = [
  { id: 'kontoplan', label: 'Kontoplan', icon: 'list-outline', hint: 'Salgs- og kjøpskontoer med MVA' },
  { id: 'regnskapskontoer', label: 'Standard regnskapskontoer', icon: 'wallet-outline', hint: 'Honorar, timer, utlegg, produkter og avrunding' },
  { id: 'fakturastandarder', label: 'Fakturastandarder', icon: 'receipt-outline', hint: 'Kredittid, tekster, påslag og EHF — arves av alle prosjekter' },
  { id: 'regnskapssystem', label: 'Regnskapssystem', icon: 'swap-horizontal-outline', hint: 'PowerOffice Go: fakturautkast ut, faktura og betaling inn' },
];

function initialTab(startTab) {
  if (startTab === 'regnskapskontoer') return 'regnskapskontoer';
  if (startTab === 'fakturastandarder') return 'fakturastandarder';
  if (startTab === 'regnskapssystem') return 'regnskapssystem';
  return 'kontoplan';
}

/**
 * Økonomi → Innstillinger: kontoplan, standardkontoer, fakturastandarder og regnskapssystem.
 * Prosjekter arver faktura-/økonomiverdier herfra under Faktureringsvalg.
 */
export default function EconomySettingsScreen({ startTab = 'kontoplan' } = {}) {
  const colors = useColors();
  const { family, familyId, uid } = useApp();
  const access = useCompanyAccess();
  const owner = isSuperAdmin(family, uid);
  const canEdit = (owner && !access.previewLocks('economySettings'))
    || (access.ready && access.canAdmin('economySettings'));
  const canOpen = canEdit;
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
        Kontoplan, standardkontoer og fakturastandarder brukes ved fakturering.
        Alle prosjekter arver disse verdiene under Faktureringsvalg — prosjektet kan overstyre enkeltfelt.
      </Text>
      <View
        nativeID="economy-settings-project-inherit-note"
        style={[styles.note, { backgroundColor: colors.brandSoft || '#e8f1ff', borderColor: colors.brand }]}
      >
        <Ionicons name="link-outline" size={18} color={colors.brand} />
        <Text style={{ color: colors.ink, flex: 1, fontSize: 13, lineHeight: 19 }}>
          Endringer her gjelder som selskapstandard for nye fakturaer på alle prosjekter.
          Åpne et prosjekt → Faktureringsvalg for å se arv og evt. overstyring.
        </Text>
      </View>
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
      ) : null}
      {tab === 'regnskapskontoer' ? (
        <StandardAccountSettings familyId={familyId} colors={colors} canEdit={canEdit} />
      ) : null}
      {tab === 'fakturastandarder' ? (
        <CompanyInvoiceDefaultsSettings familyId={familyId} colors={colors} canEdit={canEdit} />
      ) : null}
      {tab === 'regnskapssystem' ? (
        <PowerOfficeSettings familyId={familyId} colors={colors} canEdit={canEdit} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: 16, paddingBottom: 48, maxWidth: 980, width: '100%', alignSelf: 'flex-start', gap: 14 },
  title: { fontSize: 22, fontWeight: '600' },
  lead: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
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
