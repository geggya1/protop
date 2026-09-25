import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, useLayout } from '../src/theme';
import BrandToggle from './BrandToggle';
import { listModulesByCategory } from '../src/modules/moduleActivationRegistry';
import { applyProtopActivationSections } from '../src/navigation/protopShell';
import { useModuleAccess } from '../src/context/ModuleAccessContext';
import { localizeModuleFields } from '../src/i18n/moduleCatalog';
import { useI18n } from '../src/i18n';

const CATEGORY_KEYS = {
  main: 'shell.main',
  food: 'shell.food',
  memories: 'shell.memories',
  family: 'shell.family',
  school: 'shell.school',
  vehicles: 'shell.vehicles',
  house: 'shell.house',
};

/**
 * Foreldre kan slå av en modul. Neste åpning viser velkomstskjermen igjen.
 */
export default function ModuleActivationSettings() {
  const { isDesktop } = useLayout();
  const { t, lang } = useI18n();
  const { isActivated, activateModule, deactivateModule, canManage } = useModuleAccess();
  const sections = useMemo(() => {
    return applyProtopActivationSections(listModulesByCategory()).map((section) => ({
      ...section,
      title: t(CATEGORY_KEYS[section.id] || section.title) || section.title,
      items: (section.items || []).map((mod) => localizeModuleFields(mod, lang)),
    }));
  }, [t, lang]);

  if (!canManage) {
    return (
      <Text style={styles.hint}>{t('settings.onlyParentsManage')}</Text>
    );
  }

  return (
    <View>
      {sections.map((section) => (
        <View key={section.id} style={styles.block}>
          <Text style={[styles.cat, isDesktop && styles.catDesk]}>{section.title}</Text>
          <View style={styles.group}>
            {section.items.map((mod) => {
              const on = isActivated(mod.id);
              return (
                <View key={mod.id} style={[styles.row, isDesktop && styles.rowCompact]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, isDesktop && styles.labelCompact]}>{mod.name}</Text>
                    <Text style={styles.rowHint}>
                      {on ? t('settings.activated') : t('settings.showsWelcome')}
                    </Text>
                  </View>
                  <BrandToggle
                    compact={isDesktop}
                    value={on}
                    onValueChange={(next) => {
                      if (next) activateModule(mod.id, { source: 'settings' });
                      else deactivateModule(mod.id);
                    }}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 4 },
  cat: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 8,
  },
  catDesk: { fontSize: 11, fontWeight: '400' },
  group: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowCompact: { paddingVertical: 8, paddingHorizontal: 10 },
  label: { fontSize: 15, fontWeight: '400', color: colors.ink },
  labelCompact: { fontSize: 13, fontWeight: '400' },
  rowHint: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: '400' },
  hint: { fontSize: 13, color: colors.muted, marginBottom: 12 },
});
