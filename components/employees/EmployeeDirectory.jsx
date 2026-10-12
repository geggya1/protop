import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { accessSectionTitle } from '../../src/access/companyAccess';
import { employeeActivityTab, employeeDirectoryBucket } from '../../src/employees/model';

function splitActivity(rows) {
  const active = [];
  const inactive = [];
  for (const row of rows || []) {
    if (employeeActivityTab(row) === 'inactive') inactive.push(row);
    else if (employeeActivityTab(row) !== 'trash') active.push(row);
  }
  return { active, inactive };
}

function countLine(activeCount, inactiveCount) {
  const activeLabel = activeCount === 1 ? '1 aktiv' : `${activeCount} aktive`;
  const inactiveLabel = inactiveCount === 1 ? '1 deaktivert' : `${inactiveCount} deaktiverte`;
  return `${activeLabel} · ${inactiveLabel}`;
}

function ActivityTabs({ value, activeCount, inactiveCount, colors, onChange }) {
  const tabs = [
    ['active', 'Aktive', activeCount],
    ['inactive', 'Deaktiverte', inactiveCount],
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map(([id, label, count]) => {
        const on = value === id;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label}, ${count}`}
            onPress={() => onChange(id)}
            style={[styles.tab, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
          >
            <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: '600' }}>{label}</Text>
            <Text style={{ color: colors.muted }}>{count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Drawer({ nativeID, title, meta, open, colors, onToggle, children }) {
  return (
    <View nativeID={nativeID} style={[styles.drawer, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `Lukk ${title}` : `Åpne ${title}`}
        onPress={onToggle}
        style={styles.head}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
        <View style={styles.headText}>
          <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{meta}</Text>
        </View>
      </Pressable>
      {open ? <View style={[styles.body, { borderTopColor: colors.line }]}>{children}</View> : null}
    </View>
  );
}

export default function EmployeeDirectory({ rows = [], companyName = '', colors, focusSection = '', renderPerson }) {
  const [companyOpen, setCompanyOpen] = useState(true);
  const [externalOpen, setExternalOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [companyTab, setCompanyTab] = useState('active');
  const [externalTab, setExternalTab] = useState('active');

  useEffect(() => {
    if (focusSection === 'external') setExternalOpen(true);
    if (focusSection === 'company') setCompanyOpen(true);
  }, [focusSection]);

  const company = rows.filter((row) => employeeDirectoryBucket(row) === 'company');
  const external = rows.filter((row) => employeeDirectoryBucket(row) === 'external');
  const trash = rows.filter((row) => employeeDirectoryBucket(row) === 'trash');
  const companyParts = splitActivity(company);
  const externalParts = splitActivity(external);
  const companyShown = companyTab === 'inactive' ? companyParts.inactive : companyParts.active;
  const externalShown = externalTab === 'inactive' ? externalParts.inactive : externalParts.active;

  return (
    <View style={styles.stack}>
      <Drawer
        nativeID="employees-section-company"
        title={accessSectionTitle('company', companyName)}
        meta={countLine(companyParts.active.length, companyParts.inactive.length)}
        open={companyOpen}
        colors={colors}
        onToggle={() => setCompanyOpen((open) => !open)}
      >
        <ActivityTabs
          value={companyTab}
          activeCount={companyParts.active.length}
          inactiveCount={companyParts.inactive.length}
          colors={colors}
          onChange={setCompanyTab}
        />
        {companyShown.map((row) => renderPerson(row))}
        {!companyShown.length ? (
          <Text style={{ color: colors.muted }}>
            {companyTab === 'inactive' ? 'Ingen deaktiverte ansatte.' : 'Ingen aktive ansatte.'}
          </Text>
        ) : null}
      </Drawer>
      <Drawer
        nativeID="employees-section-external"
        title={accessSectionTitle('external', companyName)}
        meta={countLine(externalParts.active.length, externalParts.inactive.length)}
        open={externalOpen}
        colors={colors}
        onToggle={() => setExternalOpen((open) => !open)}
      >
        <ActivityTabs
          value={externalTab}
          activeCount={externalParts.active.length}
          inactiveCount={externalParts.inactive.length}
          colors={colors}
          onChange={setExternalTab}
        />
        {externalShown.map((row) => renderPerson(row))}
        {!externalShown.length ? (
          <Text style={{ color: colors.muted }}>
            {externalTab === 'inactive' ? 'Ingen deaktiverte eksterne.' : 'Ingen aktive eksterne.'}
          </Text>
        ) : null}
      </Drawer>
      {trash.length ? (
        <Drawer
          nativeID="employees-section-trash"
          title="Papirkurv"
          meta={trash.length === 1 ? '1 slettet' : `${trash.length} slettet`}
          open={trashOpen}
          colors={colors}
          onToggle={() => setTrashOpen((open) => !open)}
        >
          {trash.map((row) => renderPerson(row))}
        </Drawer>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  drawer: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { borderTopWidth: 1, padding: 12, gap: 10 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
