import React from 'react';
import {
  Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  cardSubtitle,
  displayName,
  statusLabel,
} from '../../src/employees/model';
import { EMPLOYEE_DETAIL_TABS, employeeViewToTab } from '../../src/employees/personTabs.js';
import { useLayout } from '../../src/theme';

export { EMPLOYEE_DETAIL_TABS, employeeViewToTab };

function accountDeactivated(employee) {
  const status = employee?.company?.status || 'active';
  return status === 'inactive' || status === 'deleted' || status === 'former';
}

/**
 * Fast person-chrome: navn + skilleark som står på tvers av alle undersider.
 */
export default function EmployeePersonChrome({
  employee,
  colors,
  companyName = '',
  siblings = [],
  activeTab = 'home',
  onBack,
  onTab,
  onSelect,
  children,
}) {
  const { isPhone } = useLayout();
  const index = siblings.findIndex((row) => row.id === employee?.id);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const name = displayName(employee);
  const status = statusLabel(employee?.company?.status);
  const deactivated = accountDeactivated(employee);
  const subtitle = cardSubtitle(employee, companyName);

  return (
    <View nativeID="employee-person-chrome" style={styles.root}>
      <View style={styles.crumbRow}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" style={styles.crumbBtn}>
          <Text style={{ color: colors.brand, fontSize: 13 }}>Ansatte</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.muted, fontSize: 13 }}> / </Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Oversikt</Text>
      </View>

      <View style={[styles.titleRow, isPhone && styles.titleRowPhone]}>
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={[styles.name, { color: colors.ink }]}>{name}</Text>
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            {deactivated ? (
              <Text style={{ color: colors.danger || '#dc2626', fontWeight: '700' }}>Deaktivert</Text>
            ) : (
              <Text style={{ color: colors.muted }}>{status}</Text>
            )}
            {subtitle ? ` · ${subtitle}` : ''}
          </Text>
        </View>
        <View style={styles.navActions}>
          <TouchableOpacity
            onPress={() => prev && onSelect?.(prev)}
            disabled={!prev}
            accessibilityRole="button"
            accessibilityLabel="Forrige medarbeider"
            style={[
              styles.navBtn,
              { borderColor: colors.line, backgroundColor: colors.card, opacity: prev ? 1 : 0.45 },
            ]}
          >
            <Ionicons name="chevron-back" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink, fontSize: 13 }}>Forrige</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => next && onSelect?.(next)}
            disabled={!next}
            accessibilityRole="button"
            accessibilityLabel="Neste medarbeider"
            style={[
              styles.navBtn,
              { borderColor: colors.line, backgroundColor: colors.card, opacity: next ? 1 : 0.45 },
            ]}
          >
            <Text style={{ color: colors.ink, fontSize: 13 }}>Neste</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>

      {deactivated ? (
        <View
          nativeID="employee-deactivated"
          style={[styles.deactivatedBanner, { backgroundColor: '#fde8e8', borderColor: colors.danger || '#dc2626' }]}
        >
          <Ionicons name="remove-circle" size={18} color={colors.danger || '#dc2626'} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.danger || '#dc2626', fontWeight: '700' }}>Deaktivert</Text>
            <Text style={{ color: colors.danger || '#dc2626', fontSize: 13, lineHeight: 18 }}>
              {employee?.company?.status === 'deleted'
                ? 'Kontoen er deaktivert og ligger i papirkurven.'
                : 'Kontoen er deaktivert. Personen har ikke vanlig tilgang.'}
            </Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabs, { borderBottomColor: colors.line }]}
        contentContainerStyle={styles.tabsInner}
        nativeID="employee-detail-tabs"
      >
        {EMPLOYEE_DETAIL_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onTab?.(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              aria-selected={active}
              accessibilityLabel={tab.label}
              nativeID={`employee-tab-${tab.id}`}
              {...(Platform.OS === 'web' ? { dataSet: { employeeTab: active ? 'active' : 'idle' } } : null)}
              style={[
                styles.tab,
                active && {
                  borderBottomColor: colors.brand,
                  backgroundColor: colors.brandSoft || '#E5F6FE',
                },
              ]}
            >
              <Text style={{
                color: active ? colors.brand : colors.muted,
                fontWeight: active ? '600' : '500',
                fontSize: 14,
              }}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10, width: '100%', flexShrink: 0 },
  crumbRow: { flexDirection: 'row', alignItems: 'center' },
  crumbBtn: { paddingVertical: 2 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  titleRowPhone: { flexDirection: 'column' },
  titleBlock: { flex: 1, gap: 4, minWidth: 180 },
  name: { fontSize: 28, fontWeight: '700', letterSpacing: -0.3 },
  navActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deactivatedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  tabs: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabsInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
});
