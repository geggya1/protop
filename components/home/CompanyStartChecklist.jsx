import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { isOrganizationType } from '../../src/utils/groupTypes';
import { watchEmployees } from '../../src/employees/storage';
import { loadCustomerList } from '../../src/anbud/storage';
import { loadProjectState } from '../../src/project/storage';
import { hasTimeEntries } from '../../src/economy/timeEntryStorage.js';
import { loadPowerOfficeStatus } from '../../src/economy/powerOfficeClient.js';
import {
  showStartChecklist,
  startChecklist,
  startChecklistHiddenKey,
} from '../../src/companyHome/startChecklist';

/** Leser det sjekklisten krysser av ut fra. Det som ikke kan leses, regnes som ikke gjort. */
function useStartFacts(familyId, enabled) {
  const [employees, setEmployees] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [projects, setProjects] = useState(null);
  const [hasHours, setHasHours] = useState(null);
  const [accountingConnected, setAccountingConnected] = useState(null);

  useEffect(() => {
    if (!enabled || !familyId) return undefined;
    return watchEmployees(familyId, (rows, meta) => {
      // Lokal kopi kan være tom før skyen svarer; vent på skyen.
      if (meta?.source === 'local' && !(rows || []).length) return;
      setEmployees(rows || []);
    }, () => setEmployees([]));
  }, [familyId, enabled]);

  useEffect(() => {
    if (!enabled || !familyId) return undefined;
    let live = true;
    const done = (setter) => (value) => { if (live) setter(value); };
    loadCustomerList(familyId).then((r) => done(setCustomers)(r?.customers || [])).catch(() => done(setCustomers)([]));
    loadProjectState(familyId, { hours: false }).then((s) => done(setProjects)(s?.projects || [])).catch(() => done(setProjects)([]));
    hasTimeEntries(familyId).then(done(setHasHours)).catch(() => done(setHasHours)(false));
    loadPowerOfficeStatus(familyId)
      .then((status) => done(setAccountingConnected)(!!status?.connected))
      .catch(() => done(setAccountingConnected)(false));
    return () => { live = false; };
  }, [familyId, enabled]);

  return { employees, customers, projects, hasHours, accountingConnected };
}

/**
 * «Kom i gang» på bedriftens forside og på Hjem i bedriften: fem steg som krysses
 * av automatisk ut fra det som finnes. Vises for den som kan sette opp bedriften,
 * forsvinner når alt er gjort og kan skjules.
 */
export default function CompanyStartChecklist({ style }) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const { uid, familyId, family, isAdmin, requestShellTab } = useApp();
  const canSetup = !!isAdmin && isOrganizationType(family?.type);
  const [hidden, setHidden] = useState(null);
  const facts = useStartFacts(familyId, canSetup && hidden === false);
  const checklist = useMemo(() => startChecklist({ ...facts, uid }), [facts, uid]);

  useEffect(() => {
    let live = true;
    if (!canSetup || !familyId || !uid) {
      setHidden(null);
      return undefined;
    }
    AsyncStorage.getItem(startChecklistHiddenKey(familyId, uid))
      .then((value) => { if (live) setHidden(value === '1'); })
      .catch(() => { if (live) setHidden(false); });
    return () => { live = false; };
  }, [canSetup, familyId, uid]);

  if (!showStartChecklist({ canSetup, hidden: hidden !== false, checklist })) return null;

  const hide = () => {
    setHidden(true);
    AsyncStorage.setItem(startChecklistHiddenKey(familyId, uid), '1').catch(() => {});
  };
  const share = checklist.total ? checklist.done / checklist.total : 0;

  return (
    <View
      nativeID="company-start-checklist"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, style]}
    >
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">Kom i gang</Text>
          <Text style={[styles.lead, { color: colors.muted }]}>
            Fem steg, så er bedriften klar for timer, prosjekter og faktura.
          </Text>
        </View>
        <Text style={[styles.progress, { color: colors.ink }]} nativeID="company-start-progress">
          {checklist.progressLabel}
        </Text>
      </View>
      <View
        style={[styles.bar, { backgroundColor: colors.sunken || colors.line }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: checklist.total, now: checklist.done }}
        accessibilityLabel={`${checklist.progressLabel} steg er gjort`}
      >
        <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: colors.success || '#16a34a' }]} />
      </View>
      {/* PC: fem steg side om side. Telefon og nettbrett: liste. */}
      <View style={isDesktop ? styles.tiles : styles.list}>
        {checklist.items.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => requestShellTab?.(item.action.tab, item.action.subView || null)}
            accessibilityRole="link"
            accessibilityState={{ checked: item.done }}
            accessibilityLabel={`${item.label}${item.done ? ', gjort' : ''}`}
            nativeID={`company-start-${item.id}`}
            style={isDesktop
              ? [styles.tile, { borderColor: colors.line, backgroundColor: item.done ? colors.card : (colors.sunken || colors.card) }]
              : [styles.row, { borderColor: colors.line }]}
          >
            <Ionicons
              name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={item.done ? (colors.success || '#16a34a') : colors.muted}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.rowLabel, { color: item.done ? colors.muted : colors.ink }]}>{item.label}</Text>
              {item.done ? null : <Text style={[styles.rowHint, { color: colors.muted }]}>{item.hint}</Text>}
            </View>
            {item.done || isDesktop ? null : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity onPress={hide} accessibilityRole="button" style={styles.hide} nativeID="company-start-hide">
        <Text style={[styles.hideTxt, { color: colors.muted }]}>Skjul listen</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  lead: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  progress: { fontSize: 15, fontWeight: '600' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  list: { gap: 0 },
  tiles: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  tile: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    minHeight: 64,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowHint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  hide: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  hideTxt: { fontSize: 13, textDecorationLine: 'underline' },
});
