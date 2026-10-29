import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useLayout } from '../../src/theme';
import { useColors } from '../../src/context/ThemeContext';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { isSuperAdmin } from '../../src/utils/groups';
import CompanyDesktopLanding from './CompanyDesktopLanding';
import CompanyStartChecklist from '../../components/home/CompanyStartChecklist';

/**
 * Selskap: offentlig bedriftsinfo og nyhetsvegg.
 * Innstillinger åpnes via tannhjulet (selskap/innstillinger).
 */
export default function CompanyLanding({ subView = '' } = {}) {
  const { pad } = useLayout();
  const colors = useColors();
  const nav = useNavigation();
  const { family, requestShellTab, uid } = useApp();
  const access = useCompanyAccess();

  const stored = family?.company?.navn ? family.company : null;
  const owner = isSuperAdmin(family, uid);
  const canOpenSettings = (owner && !access.previewLocks('companyProfile'))
    || (access.ready && access.canAdmin('companyProfile'));

  if (!stored) {
    return (
      <ScrollView contentContainerStyle={[styles.emptyBody, { padding: pad }]}>
        <Text style={[styles.emptyLead, { color: colors.muted }]}>
          Prosjekt og anbud hører til en bedrift. Du er ikke i en bedrift nå.
          Be om innpass eller opprett bedrift fra organisasjonssiden. Det er gratis.
        </Text>
        <TouchableOpacity
          onPress={() => nav.navigate('FamilyOverview')}
          style={[styles.emptyBtn, { backgroundColor: colors.brand }]}
        >
          <Text style={styles.emptyBtnText}>Gå til organisasjon</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      nativeID="company-landing"
      id="company-landing"
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={[styles.body, { width: '100%', alignItems: 'flex-start' }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View nativeID="company-profile-sheet" id="company-profile-sheet" style={[styles.sheet, { padding: pad }]}>
        {/* Bedriftens forside: «Kom i gang» til oppsettet er ferdig. */}
        <CompanyStartChecklist style={styles.startCard} />
        <CompanyDesktopLanding
          stored={stored}
          initialTab={subView === 'nyheter' ? 'nyheter' : ''}
          onSettings={canOpenSettings ? () => requestShellTab?.('selskap', 'innstillinger') : null}
          onUnits={() => requestShellTab?.('selskap', 'underenheter')}
          onEmployees={() => requestShellTab?.('ansatte')}
          onOpenIso={() => requestShellTab?.('iso')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, alignSelf: 'stretch', width: '100%' },
  body: { flexGrow: 1, width: '100%', alignItems: 'flex-start' },
  sheet: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' ? { marginLeft: 0, marginRight: 'auto' } : null),
  },
  startCard: { marginBottom: 16 },
  emptyBody: { flexGrow: 1, gap: 16, paddingBottom: 28 },
  emptyLead: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  emptyBtn: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '400', fontSize: 15 },
});
