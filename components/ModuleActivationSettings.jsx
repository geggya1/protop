import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, useLayout } from '../src/theme';
import BrandToggle from './BrandToggle';
import { listModulesByCategory } from '../src/modules/moduleActivationRegistry';
import { applyProtopActivationSections } from '../src/navigation/protopShell';
import { useModuleAccess, useModuleWriteScope } from '../src/context/ModuleAccessContext';
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
 * showCategories={false}: uten kategorioverskrift, når siden har sin egen (Modulinnstillinger).
 *
 * I en bedrift (MENY-01): scope 'company' viser og endrer bedriftens valg (Modulinnstillinger,
 * canEdit = Admin på Modulinnstillinger). scope 'personal' (Konto for en vanlig ansatt) endrer
 * bare den ansattes egen visning; en modul bedriften har slått av, kan ikke slås på for seg selv.
 * Uten scope: useModuleWriteScope (hele bedriften for den som har tilgangen, ellers bare meg).
 */
export default function ModuleActivationSettings({ showCategories = true, scope: scopeProp = '', canEdit = true }) {
  const { isDesktop } = useLayout();
  const { t, lang } = useI18n();
  const {
    isActivated, companyActivated, companyLocked, activateModule, deactivateModule, canManage,
  } = useModuleAccess();
  const ownScope = useModuleWriteScope();
  const scope = scopeProp || ownScope;
  const personal = scope === 'personal';
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
          {showCategories ? <Text style={[styles.cat, isDesktop && styles.catDesk]}>{section.title}</Text> : null}
          <View style={styles.group}>
            {section.items.map((mod) => {
              const on = scope === 'company' ? companyActivated(mod.id) : isActivated(mod.id);
              // Slått av for hele bedriften: kan ikke slås på bare for meg.
              const locked = personal && !on && companyLocked(mod.id);
              const hint = locked
                ? 'Slått av for hele bedriften'
                : (on ? t('settings.activated') : t('settings.showsWelcome'));
              return (
                <View key={mod.id} style={[styles.row, isDesktop && styles.rowCompact]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, isDesktop && styles.labelCompact]}>{mod.name}</Text>
                    <Text style={styles.rowHint}>{hint}</Text>
                  </View>
                  <BrandToggle
                    compact={isDesktop}
                    value={on}
                    disabled={!canEdit || locked}
                    onValueChange={(next) => {
                      if (next) activateModule(mod.id, { source: 'settings', scope });
                      else deactivateModule(mod.id, { scope });
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
