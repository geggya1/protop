import React, { useMemo, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import {
  accountDeactivated,
  effectiveLevelId,
  levelById,
} from '../../src/access/companyAccess';
import { companyModuleVisibility, hiddenCompanyModules } from '../../src/access/viewAsNav';
import {
  clearViewAs,
  setViewAsEmployee,
  setViewAsLens,
  useViewAsSelection,
  viewAsKey,
} from '../../src/access/viewAsStore';
import { companyNavItems } from '../../src/navigation/shellModules';
import { displayName } from '../../src/employees/model';

const RANK_PHRASE = {
  none: 'ser ikke',
  see: 'ser',
  read: 'kan lese',
  write: 'kan endre',
  delete: 'har full tilgang',
};

function phrase(rank) {
  return RANK_PHRASE[rank] || 'ser ikke';
}

function levelLabel(employee) {
  return levelById(effectiveLevelId(employee))?.label || 'Ansatt';
}

function moduleLabel(tab, subView) {
  for (const item of companyNavItems()) {
    if (subView) {
      const child = (item.children || []).find((row) => (
        row.action?.tab === tab && row.action?.subView === subView
      ));
      if (child) return child.label;
    }
    if (item.id === tab || item.action?.tab === tab) return item.label;
  }
  return 'denne modulen';
}

function PersonButton({ person, active, colors, onPress }) {
  const name = displayName(person);
  const paused = accountDeactivated(person);
  return (
    <Pressable
      nativeID={`view-as-person-${person.id}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Se som ${name}`}
      onPress={onPress}
      style={[
        styles.person,
        {
          borderColor: active ? colors.brand : colors.line,
          backgroundColor: active ? colors.brandSoft : colors.card,
        },
      ]}
    >
      <Text style={{ color: active ? colors.brand : colors.ink }}>{name}</Text>
      <Text style={[styles.meta, { color: colors.muted }]}>
        {levelLabel(person)}{paused ? ' · deaktivert' : ''}
      </Text>
    </Pressable>
  );
}

export function ViewAsModulePlaceholder({ access, tab, subView, colors }) {
  const name = displayName(access?.viewingAs);
  const label = moduleLabel(tab, subView);
  return (
    <View nativeID="view-as-placeholder" style={styles.placeholder}>
      <Text style={[styles.title, { color: colors?.ink || '#1a2744' }]}>{name} ser {label}.</Text>
      <Text style={[styles.body, { color: colors?.muted || '#5b6b82' }]}>
        Innholdet åpnes ikke, fordi din egen tilgang ikke inkluderer området.
        Du ser bare at modulen er synlig for denne brukeren.
      </Text>
    </View>
  );
}

export default function ViewAsButton({ compact = false }) {
  const colors = useColors();
  const { uid, familyId } = useApp();
  const access = useCompanyAccess();
  const selection = useViewAsSelection();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const previewing = !!access?.previewing && !!access?.viewingAs;
  const capability = access?.viewAsCapability || 'none';

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (access?.employees || [])
      .filter((row) => row?.company?.status !== 'deleted')
      .filter((row) => !q || displayName(row).toLowerCase().includes(q))
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'nb'));
  }, [access?.employees, query]);

  if (!access?.canViewAs || !familyId) return null;

  const active = people.filter((row) => !accountDeactivated(row));
  const inactive = people.filter((row) => accountDeactivated(row));
  const viewing = previewing ? access.viewingAs : null;
  const name = viewing ? displayName(viewing) : '';
  const scope = access.viewAsScope;
  const grants = access.grants;
  const rows = previewing && scope === 'all' ? companyModuleVisibility(grants) : [];
  const visibleLabels = rows.filter((row) => row.visible && !row.child).map((row) => row.label);
  const hiddenLabels = previewing && scope === 'all'
    ? hiddenCompanyModules(grants).map((row) => row.label)
    : [];
  const lens = selection.key === viewAsKey(uid, familyId) && selection.lens === 'companySettings'
    ? 'companySettings'
    : 'all';
  const size = compact ? 32 : 36;

  function pick(employeeId) {
    setViewAsEmployee(uid, familyId, employeeId);
    setOpen(false);
  }

  function backToSelf() {
    clearViewAs();
    setOpen(false);
  }

  return (
    <>
      <View nativeID="view-as-toggle" style={styles.slot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previewing ? `Du er ${name}. Bytt bruker.` : 'Se som bruker'}
          onPress={() => setOpen(true)}
          style={[
            previewing ? styles.chip : styles.iconBtn,
            {
              height: size,
              minWidth: size,
              borderRadius: compact ? 6 : size / 2,
              borderColor: previewing ? colors.brand : colors.line,
              backgroundColor: previewing ? colors.brandSoft : colors.card,
            },
          ]}
        >
          <Ionicons name="eye-outline" size={compact ? 16 : 18} color={previewing ? colors.brand : colors.ink} />
          {previewing ? (
            <Text style={[styles.chipName, { color: colors.brand, maxWidth: compact ? 200 : 120 }]} numberOfLines={1}>
              {`som ${name}`}
            </Text>
          ) : null}
        </Pressable>
        {previewing ? (
          <Pressable
            nativeID="view-as-clear"
            accessibilityRole="button"
            accessibilityLabel="Tilbake til meg selv"
            onPress={backToSelf}
            style={[
              styles.meBtn,
              {
                height: size,
                borderRadius: compact ? 6 : size / 2,
                borderColor: colors.brand,
                backgroundColor: colors.card,
              },
            ]}
          >
            <Text style={[styles.meText, { color: colors.brand }]}>Meg</Text>
          </Pressable>
        ) : null}
      </View>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBg}>
          <Pressable style={styles.modalDismiss} onPress={() => setOpen(false)} accessibilityLabel="Lukk se som bruker" />
          <View nativeID="view-as-menu" style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.title, { color: colors.ink }]}>
              {previewing ? `Du er ${name}` : 'Se som bruker'}
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              {previewing
                ? `${levelLabel(viewing)}. Alle sider og moduler følger denne brukeren til du går tilbake til deg selv.`
                : 'Velg en bruker. Sidene viser modulene og applikasjonene slik den personen ser dem.'}
            </Text>
            {previewing ? (
              <View nativeID="view-as-summary" style={styles.summary}>
                {scope === 'companySettings' ? (
                  <Text style={[styles.body, { color: colors.ink }]}>
                    Du tester bedriftsinnstillinger slik {name} ser dem. Øvrige moduler er dine.
                  </Text>
                ) : (
                  <Text style={[styles.body, { color: colors.ink }]}>
                    Synlig: {visibleLabels.length ? visibleLabels.join(', ') : 'ingen bedriftsmoduler'}.
                    {hiddenLabels.length ? ` Skjult: ${hiddenLabels.join(', ')}.` : ''}
                  </Text>
                )}
                <Text style={[styles.body, { color: colors.muted }]}>
                  Offentlig bedriftsinfo: {phrase(grants?.companyPublic)}.
                  {' '}Grunninnstillinger: {phrase(grants?.companyProfile)}.
                  {' '}Underenheter: {phrase(grants?.units)}.
                </Text>
              </View>
            ) : null}
            <Pressable
              nativeID="view-as-self"
              accessibilityRole="button"
              accessibilityState={{ selected: !previewing }}
              onPress={backToSelf}
              style={[
                styles.person,
                {
                  borderColor: !previewing ? colors.brand : colors.line,
                  backgroundColor: !previewing ? colors.brandSoft : colors.card,
                },
              ]}
            >
              <Text style={{ color: !previewing ? colors.brand : colors.ink }}>Tilbake til meg selv</Text>
            </Pressable>
            {capability === 'all' ? (
              <View style={styles.lensRow}>
                {[['all', 'Alle moduler'], ['companySettings', 'Bare bedriftsinnstillinger']].map(([id, label]) => {
                  const on = (previewing ? scope : lens) === id;
                  return (
                    <Pressable
                      key={id}
                      nativeID={`view-as-lens-${id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setViewAsLens(uid, familyId, id)}
                      style={[
                        styles.lens,
                        {
                          borderColor: on ? colors.brand : colors.line,
                          backgroundColor: on ? colors.brandSoft : colors.card,
                        },
                      ]}
                    >
                      <Text style={{ color: on ? colors.brand : colors.ink }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.body, { color: colors.muted }]}>
                Rettigheten din tester bare bedriftsinnstillinger.
              </Text>
            )}
            <TextInput
              nativeID="view-as-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Søk etter ansatt"
              placeholderTextColor={colors.placeholder || colors.muted}
              style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {active.map((person) => (
                <PersonButton
                  key={person.id}
                  person={person}
                  active={viewing?.id === person.id}
                  colors={colors}
                  onPress={() => pick(person.id)}
                />
              ))}
              {inactive.length ? (
                <Text style={[styles.group, { color: colors.muted }]}>Deaktiverte</Text>
              ) : null}
              {inactive.map((person) => (
                <PersonButton
                  key={person.id}
                  person={person}
                  active={viewing?.id === person.id}
                  colors={colors}
                  onPress={() => pick(person.id)}
                />
              ))}
              {!people.length ? (
                <Text style={[styles.body, { color: colors.muted }]}>Ingen ansatte å se som ennå.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  slot: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  iconBtn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  chip: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    maxWidth: 220,
  },
  chipName: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  meBtn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  meText: { fontSize: 13, fontWeight: '600' },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingRight: 16,
    paddingLeft: 16,
  },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  menu: {
    width: '100%',
    maxWidth: 420,
    zIndex: 2,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    maxHeight: '80%',
  },
  title: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 20 },
  summary: { gap: 4 },
  lensRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lens: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  search: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  list: { maxHeight: 280 },
  person: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  group: { fontSize: 13, marginTop: 4, marginBottom: 6 },
  placeholder: { flex: 1, padding: 24, gap: 8 },
});
