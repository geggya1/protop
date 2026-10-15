import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useLayout } from '../../src/theme';
import { useColors } from '../../src/context/ThemeContext';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { isSuperAdmin } from '../../src/utils/groups';
import CompanyDesktopLanding from './CompanyDesktopLanding';

/**
 * Selskap: offentlig bedriftsinfo og nyhetsvegg.
 * Innstillinger åpnes via tannhjulet (selskap/innstillinger).
 */
export default function CompanyLanding() {
  const { pad } = useLayout();
  const colors = useColors();
  const nav = useNavigation();
  const { family, requestShellTab, uid } = useApp();
  const access = useCompanyAccess();

  const stored = family?.company?.navn ? family.company : null;
  const owner = isSuperAdmin(family, uid);
  const canOpenSettings = (owner && !access.previewLocks('companyProfile'))
    || (access.ready && access.can('companyProfile', 'read'));

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
      contentContainerStyle={[styles.body, { padding: pad, maxWidth: 1180, width: '100%', alignSelf: 'flex-start' }]}
      showsVerticalScrollIndicator={false}
    >
      <CompanyDesktopLanding
        stored={stored}
        onSettings={canOpenSettings ? () => requestShellTab?.('selskap', 'innstillinger') : null}
        onUnits={() => requestShellTab?.('selskap', 'underenheter')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { flexGrow: 1 },
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
