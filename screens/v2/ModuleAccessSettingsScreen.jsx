import React from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import { colors, useLayout } from '../../src/theme';
import { MODULE_CATALOG } from '../../src/modules/moduleActivationRegistry';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import ModuleActivationSettings from '../../components/ModuleActivationSettings';
import { useModuleAccess, useModuleWriteScope } from '../../src/context/ModuleAccessContext';
import { UnlessShellTitle } from '../../src/ui/ShellTitles';

/**
 * Family-level activate / deactivate. Welcome returns after deactivate.
 * I en bedrift (MENY-01) gjelder valget her bare den ansatte selv; hele bedriften endres i
 * Modulinnstillinger av den som har tilgangen (eier, administrator, Admin på Modulinnstillinger).
 */
export default function ModuleAccessSettingsScreen({ onBack }) {
  const { isDesktop } = useLayout();
  const reassurance = MODULE_CATALOG?.defaults?.reassuranceText || '';
  const { isCompany } = useModuleAccess();
  const scope = useModuleWriteScope();
  let hint = `Alle moduler vises i menyen. En deaktivert modul viser velkomstskjermen neste gang noen åpner den.${reassurance ? ` ${reassurance}` : ''}`;
  if (isCompany && scope === 'personal') {
    hint = 'Valgene her gjelder bare deg. En modul du slår av, viser velkomsten når du åpner den, og du kan slå den på igjen. '
      + 'Moduler for hele bedriften endres i Modulinnstillinger av den som har tilgang til dem.';
  } else if (isCompany) {
    hint = 'Valgene her gjelder hele bedriften, som i Modulinnstillinger. En modul som er slått av, viser velkomsten neste gang noen åpner den.';
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
        showsVerticalScrollIndicator={false}
      >
        {onBack ? <CompactBackLink onPress={onBack} compact={isDesktop} /> : null}
        {/* Én tittel per side: toppfeltet viser allerede «Aktiverte moduler» i skallet. */}
        <UnlessShellTitle title="Aktiverte moduler">
          <Text style={[styles.title, isDesktop && styles.titleDesk]}>Aktiverte moduler</Text>
        </UnlessShellTitle>
        <Text style={styles.hint} nativeID="module-access-scope">{hint}</Text>
        <ModuleActivationSettings scope={scope} />
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
