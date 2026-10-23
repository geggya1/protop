import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable, StyleSheet, Switch, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COMPANY_DRAWER_GROUPS } from '../../src/navigation/shellModules';
import {
  COMPANY_MODULES,
  activeCompanyModuleCount,
  isCompanyModuleActive,
  normalizeCompanyModules,
  setCompanyModuleActive,
} from '../../src/access/companyModules';
import { showSaveToast } from '../../src/ui/saveToast';
import { useColors } from '../../src/context/ThemeContext';

function groupsWithModules() {
  return COMPANY_DRAWER_GROUPS
    .map((group) => ({
      ...group,
      modules: COMPANY_MODULES.filter((row) => row.groupId === group.id),
    }))
    .filter((group) => group.modules.length > 0);
}

function ModuleRow({ row, on, canEdit, colors, onToggle }) {
  return (
    <View
      dataSet={{ moduleRow: row.id }}
      style={[styles.moduleRow, { borderColor: colors.line }, !on ? styles.moduleOff : null]}
    >
      <View style={[styles.moduleIcon, { backgroundColor: on ? colors.brandSoft : colors.sunken }]}>
        <Ionicons name={row.icon} size={18} color={on ? colors.brand : colors.muted} />
      </View>
      <View style={styles.moduleText}>
        <Text style={[styles.moduleName, { color: colors.ink }]}>{row.label}</Text>
        {row.hint ? <Text style={[styles.moduleHint, { color: colors.muted }]}>{row.hint}</Text> : null}
        <Text style={[styles.moduleMeta, { color: on ? colors.brand : colors.muted }]}>
          {on ? 'Aktiv' : 'Deaktivert'}
        </Text>
      </View>
      <Switch
        value={on}
        disabled={!canEdit}
        onValueChange={(value) => onToggle?.(row.id, value)}
        accessibilityLabel={`${row.label}, ${on ? 'aktiv' : 'deaktivert'}`}
        trackColor={{ true: colors.brand, false: colors.line }}
        thumbColor="#fff"
        activeThumbColor="#fff"
      />
    </View>
  );
}

/** Kategori som skuff, lik gruppene i hamburgermenyen og tilgangsstyringen. */
function GroupDrawer({ group, state, colors, children }) {
  const [open, setOpen] = useState(true);
  const total = group.modules.length;
  const active = group.modules.filter((row) => isCompanyModuleActive(state, row.id)).length;
  return (
    <View style={[styles.drawer, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `Lukk ${group.label}` : `Åpne ${group.label}`}
        onPress={() => setOpen((value) => !value)}
        style={styles.drawerHead}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
        <Ionicons name={group.icon} size={18} color={colors.brand} />
        <View style={styles.drawerTitle}>
          <Text style={[styles.groupLabel, { color: colors.ink }]}>{group.label}</Text>
          <Text style={[styles.groupMeta, { color: colors.muted }]}>{`${active} av ${total} aktive`}</Text>
        </View>
      </Pressable>
      {open ? (
        <View style={[styles.drawerBody, { borderColor: colors.line }]}>{children}</View>
      ) : null}
    </View>
  );
}

/**
 * Modulinnstillinger: hvilke moduler bedriften abonnerer på.
 * Ligger over tilgangsstyringen. En deaktivert modul er av for alle.
 */
export default function CompanyModuleSettings({
  company,
  canEdit = false,
  colors,
  busy = false,
  onSave,
}) {
  const savedKey = JSON.stringify(company?.modules || {});
  const [state, setState] = useState(() => normalizeCompanyModules(company?.modules));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const groups = useMemo(groupsWithModules, []);

  useEffect(() => {
    setState(normalizeCompanyModules(company?.modules));
    setDirty(false);
  }, [savedKey]);

  const activeCount = activeCompanyModuleCount(state);

  function toggle(id, on) {
    if (!canEdit) return;
    setState((current) => setCompanyModuleActive(current, id, on));
    setDirty(true);
  }

  async function save() {
    if (!canEdit || busy || !dirty) return;
    setError('');
    try {
      await onSave?.(normalizeCompanyModules(state));
      setDirty(false);
      showSaveToast('Modulene er lagret.');
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre modulene.');
    }
  }

  function reset() {
    setState(normalizeCompanyModules(company?.modules));
    setDirty(false);
  }

  return (
    <View style={styles.page}>
      <View style={[styles.summary, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <View style={[styles.summaryIcon, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name="apps" size={20} color={colors.brand} />
        </View>
        <View style={styles.summaryText}>
          <Text style={[styles.summaryTitle, { color: colors.ink }]}>
            {`${activeCount} av ${COMPANY_MODULES.length} moduler aktive`}
          </Text>
        </View>
      </View>

      {!canEdit ? (
        <Text style={[styles.lead, { color: colors.muted }]}>Bare administrator kan slå moduler av og på.</Text>
      ) : null}
      {error ? <Text style={[styles.lead, { color: colors.danger }]}>{error}</Text> : null}

      {groups.map((group) => (
        <GroupDrawer key={group.id} group={group} state={state} colors={colors}>
          {group.modules.map((row) => (
            <ModuleRow
              key={row.id}
              row={row}
              on={isCompanyModuleActive(state, row.id)}
              canEdit={canEdit && !busy}
              colors={colors}
              onToggle={toggle}
            />
          ))}
        </GroupDrawer>
      ))}

      {canEdit ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={!dirty || busy}
            onPress={save}
            style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: !dirty || busy ? 0.5 : 1 }]}
          >
            <Text style={styles.primaryText}>{busy ? 'Lagrer…' : 'Lagre moduler'}</Text>
          </Pressable>
          {dirty ? (
            <Pressable
              accessibilityRole="button"
              onPress={reset}
              style={[styles.quietBtn, { borderColor: colors.line }]}
            >
              <Text style={{ color: colors.ink }}>Angre endringer</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Vises i stedet for en deaktivert modul. */
export function CompanyModuleLocked({ module, contactNote, canManage, onOpenSettings }) {
  const colors = useColors();
  return (
    <View style={styles.lockedPage} dataSet={{ moduleLockedPage: module?.id || '1' }}>
      <View style={[styles.lockedCard, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <View style={[styles.lockedIcon, { backgroundColor: colors.sunken }]}>
          <Ionicons name="lock-closed" size={26} color={colors.muted} />
        </View>
        <Text accessibilityRole="header" style={[styles.lockedTitle, { color: colors.ink }]}>
          {`${module?.label || 'Modulen'} er ikke aktivert`}
        </Text>
        <Text style={[styles.lead, { color: colors.muted, textAlign: 'center' }]}>
          Bedriften abonnerer ikke på denne modulen.
          {' '}
          {canManage ? 'Du er administrator og kan aktivere den i Modulinnstillinger.' : contactNote}
        </Text>
        {canManage && onOpenSettings ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenSettings}
            style={[styles.primaryBtn, { backgroundColor: colors.brand, alignSelf: 'center' }]}
          >
            <Text style={styles.primaryText}>Åpne Modulinnstillinger</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignSelf: 'stretch', width: '100%', maxWidth: 860, gap: 10 },
  lead: { fontSize: 15, lineHeight: 21 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  summaryIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  summaryText: { flex: 1, minWidth: 0, gap: 2 },
  summaryTitle: { fontSize: 16, fontWeight: '600' },
  summaryHint: { fontSize: 13, lineHeight: 18 },
  drawer: { borderWidth: 1, borderRadius: 12, width: '100%', overflow: 'hidden' },
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, paddingVertical: 8 },
  drawerTitle: { flex: 1, minWidth: 0 },
  drawerBody: { borderTopWidth: 1, paddingHorizontal: 12 },
  groupLabel: { fontSize: 15, fontWeight: '600' },
  groupMeta: { fontSize: 13, lineHeight: 18 },
  moduleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  moduleOff: { opacity: 0.7 },
  moduleIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moduleText: { flex: 1, minWidth: 0, gap: 2 },
  moduleName: { fontSize: 14, fontWeight: '600' },
  moduleHint: { fontSize: 12, lineHeight: 16 },
  moduleMeta: { fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  primaryBtn: { alignSelf: 'flex-start', borderRadius: 12, minHeight: 40, justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: '#fff', textAlign: 'center' },
  quietBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  lockedPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lockedCard: { width: '100%', maxWidth: 480, borderWidth: 1, borderRadius: 16, padding: 24, gap: 12, alignItems: 'center' },
  lockedIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  lockedTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
});
