import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { isSuperAdmin, updateGroup } from '../../src/utils/groups';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import CompanyStructureSettings from '../../components/project/CompanyStructureSettings';

export default function CompanyUnitsScreen() {
  const colors = useColors();
  const { family, familyId, families, applyFamilyPatch, requestShellTab, uid, userProfile, selectFamily } = useApp();
  const company = family?.company?.navn ? family.company : null;
  const access = useCompanyAccess();
  const canEdit = isSuperAdmin(family, uid) || (access.ready && access.can('units', 'write'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function saveCompany(next) {
    if (!familyId) return;
    const patch = { company: next };
    await updateGroup(familyId, patch);
    applyFamilyPatch?.(familyId, patch);
  }

  if (!company) {
    return (
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Underenheter hører til et selskap. Åpne selskapet først.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      nativeID="company-units-page"
      id="company-units-page"
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      {!!error && <Text style={{ color: colors.danger, fontWeight: '400' }}>{error}</Text>}
      <View style={styles.block}>
        <CompanyStructureSettings
          company={company}
          familyId={familyId}
          families={families || []}
          canEdit={canEdit}
          colors={colors}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          userProfile={userProfile}
          onSaved={saveCompany}
          onOpenCompany={(id) => {
            selectFamily?.(id);
            requestShellTab?.('selskap');
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 16, paddingBottom: 48, gap: 10, maxWidth: 760, width: '100%', alignSelf: 'flex-start' },
  lead: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  block: { width: '100%', gap: 10 },
});
