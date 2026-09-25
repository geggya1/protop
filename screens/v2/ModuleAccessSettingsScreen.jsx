import React from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { colors, useLayout } from '../../src/theme';
import { MODULE_CATALOG } from '../../src/modules/moduleActivationRegistry';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import ModuleActivationSettings from '../../components/ModuleActivationSettings';

/**
 * Family-level activate / deactivate. Welcome returns after deactivate.
 */
export default function ModuleAccessSettingsScreen({ onBack }) {
  const { isDesktop } = useLayout();
  const reassurance = MODULE_CATALOG?.defaults?.reassuranceText || '';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
        showsVerticalScrollIndicator={false}
      >
        {onBack ? <CompactBackLink onPress={onBack} compact={isDesktop} /> : null}
        <Text style={[styles.title, isDesktop && styles.titleDesk]}>Aktiverte moduler</Text>
        <Text style={styles.hint}>
          Alle moduler vises i menyen. En deaktivert modul viser velkomstskjermen neste gang noen åpner den.
          {reassurance ? ` ${reassurance}` : ''}
        </Text>
        <ModuleActivationSettings />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  bodyDesk: { paddingHorizontal: 12, paddingTop: 4, maxWidth: 680 },
  title: { fontSize: 20, fontWeight: '400', color: colors.ink, marginBottom: 8 },
  titleDesk: { fontSize: 17, fontWeight: '400' },
  hint: { fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 14, fontWeight: '400' },
});
