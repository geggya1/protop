import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { accessLevelSections, accessSectionTitle, accountDeactivated, employeeLevelIds } from '../../src/access/companyAccess';
import { displayName, employeeActivityTab, employeeShowsInSection } from '../../src/employees/model';

const COLUMN_LABEL = {
  regnskap_ekstern: 'Regnskap',
  innleie_ekstern: 'Innleie',
  ansatt: 'Ansatt',
  tilbud: 'Tilbud',
  ansatt_andre_avdelinger: 'Andre avdelinger',
  avdelingsleder: 'Avdelingsleder',
  leder: 'Øverste leder',
  administrator: 'Administrator',
};

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
            <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: '400' }}>{label}</Text>
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

function LevelTable({
  nativeID,
  rows,
  levels,
  colors,
  canEditLevels,
  renderIdentity,
  onToggleLevel,
}) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator
      style={styles.tableScroll}
    >
      <View nativeID={nativeID} accessibilityRole="table" style={styles.table}>
        <View style={[styles.headerRow, { borderBottomColor: colors.line, backgroundColor: colors.bg }]}>
          <Text style={[styles.personHead, { color: colors.muted }]}>Navn</Text>
          {levels.map((level) => (
            <Text key={level.id} style={[styles.levelHead, { color: colors.ink }]}>
              {COLUMN_LABEL[level.id] || level.label}
            </Text>
          ))}
        </View>
        {rows.map((row) => {
          const selected = employeeLevelIds(row);
          const name = displayName(row);
          const retired = accountDeactivated(row);
          return (
            <View
              key={row.id}
              nativeID={`employee-row-${row.id}`}
              style={[styles.dataRow, { borderBottomColor: colors.line, opacity: retired ? 0.92 : 1 }]}
            >
              <View style={styles.personCell}>{renderIdentity(row)}</View>
              {levels.map((level) => {
                const on = selected.includes(level.id);
                return (
                  <Pressable
                    key={level.id}
                    nativeID={`employee-level-${row.id}-${level.id}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: false, disabled: retired || !canEditLevels }}
                    accessibilityLabel={retired
                      ? `${name}, ${level.label}, deaktivert uten rettigheter`
                      : `${name}, ${level.label}`}
                    disabled={retired || !canEditLevels}
                    onPress={() => {
                      if (retired) return;
                      onToggleLevel?.(row, level.id, !on);
                    }}
                    style={styles.levelCell}
                  >
                    <View style={[
                      styles.box,
                      retired && on && styles.retiredBox,
                      {
                        borderColor: on ? (retired ? colors.muted : colors.brand) : colors.line,
                        backgroundColor: on ? (retired ? (colors.sunken || '#f8fafc') : colors.brand) : colors.card,
                        borderStyle: retired ? 'dashed' : 'solid',
                        opacity: retired ? 0.72 : (canEditLevels ? 1 : 0.7),
                      },
                    ]}
                    >
                      {retired && on ? <View style={[styles.hatch, { backgroundColor: colors.muted }]} /> : null}
                      {on ? (
                        retired
                          ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 15 }}>✓</Text>
                          : <Ionicons name="checkmark" size={14} color="#fff" />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

export default function EmployeeDirectory({
  rows = [],
  companyName = '',
  colors,
  focusSection = '',
  variant = 'list',
  canEditLevels = false,
  renderPerson,
  renderIdentity,
  onToggleLevel,
}) {
  const [companyOpen, setCompanyOpen] = useState(true);
  const [externalOpen, setExternalOpen] = useState(true);
  const [trashOpen, setTrashOpen] = useState(false);
  const [companyTab, setCompanyTab] = useState('active');
  const [externalTab, setExternalTab] = useState('active');
  const sections = accessLevelSections();
  const companyLevels = sections.find((section) => section.id === 'company')?.levels || [];
  const externalLevels = sections.find((section) => section.id === 'external')?.levels || [];

  useEffect(() => {
    if (focusSection === 'external') setExternalOpen(true);
    if (focusSection === 'company') setCompanyOpen(true);
  }, [focusSection]);

  const company = rows.filter((row) => employeeShowsInSection(row, 'company'));
  const external = rows.filter((row) => employeeShowsInSection(row, 'external'));
  const trash = rows.filter((row) => employeeActivityTab(row) === 'trash');
  const companyParts = splitActivity(company);
  const externalParts = splitActivity(external);
  const companyShown = companyTab === 'inactive' ? companyParts.inactive : companyParts.active;
  const externalShown = externalTab === 'inactive' ? externalParts.inactive : externalParts.active;
  const identity = renderIdentity || renderPerson;
  const withLevels = variant === 'levels';

  function listing(nativeID, shown, levels, emptyText) {
    if (!shown.length) return <Text style={{ color: colors.muted }}>{emptyText}</Text>;
    if (!withLevels) {
      return (
        <View nativeID={nativeID} style={styles.list}>
          {shown.map((row) => (
            <View key={row.id} nativeID={`employee-row-${row.id}`} style={[styles.listRow, { borderBottomColor: colors.line }]}>
              {identity(row)}
            </View>
          ))}
        </View>
      );
    }
    return (
      <LevelTable
        nativeID={nativeID}
        rows={shown}
        levels={levels}
        colors={colors}
        canEditLevels={canEditLevels}
        renderIdentity={identity}
        onToggleLevel={onToggleLevel}
      />
    );
  }

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
        {withLevels ? (
          <Text nativeID="employees-level-hint-company" style={{ color: companyTab === 'inactive' ? (colors.danger || '#b42318') : colors.muted, fontSize: 13 }}>
            {companyTab === 'inactive'
              ? 'Deaktivert. Ingen rettigheter. De skraverte rutene viser nivåene de hadde.'
              : 'Kryss av nivåene som passer. En ansatt kan ha flere.'}
          </Text>
        ) : null}
        {listing(
          withLevels ? 'employees-table-company' : 'employees-list-company',
          companyShown,
          companyLevels,
          companyTab === 'inactive' ? 'Ingen deaktiverte ansatte.' : 'Ingen aktive ansatte.',
        )}
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
        {withLevels ? (
          <Text nativeID="employees-level-hint-external" style={{ color: externalTab === 'inactive' ? (colors.danger || '#b42318') : colors.muted, fontSize: 13 }}>
            {externalTab === 'inactive'
              ? 'Deaktivert. Ingen rettigheter. De skraverte rutene viser nivåene de hadde.'
              : 'Kryss av nivåene som passer. En person kan ha flere.'}
          </Text>
        ) : null}
        {listing(
          withLevels ? 'employees-table-external' : 'employees-list-external',
          externalShown,
          externalLevels,
          externalTab === 'inactive' ? 'Ingen deaktiverte eksterne.' : 'Ingen aktive eksterne.',
        )}
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700' },
  body: { borderTopWidth: 1, padding: 10, gap: 8 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, borderWidth: 1, borderRadius: 12, minHeight: 40, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { gap: 0 },
  listRow: { borderBottomWidth: 1, paddingVertical: 4 },
  tableScroll: { marginHorizontal: -4 },
  table: { minWidth: 860 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, paddingBottom: 8 },
  dataRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, minHeight: 60 },
  personHead: { width: 280, fontSize: 12, fontWeight: '400', paddingHorizontal: 8 },
  personCell: { width: 280, paddingVertical: 6, paddingRight: 8 },
  levelHead: { width: 108, fontSize: 12, fontWeight: '400', textAlign: 'center' },
  levelCell: { width: 108, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  retiredBox: { position: 'relative' },
  hatch: {
    position: 'absolute',
    width: 30,
    height: 1.5,
    transform: [{ rotate: '45deg' }],
  },
});
