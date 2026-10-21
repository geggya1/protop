import React, { useMemo, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
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
import { companyAccountNavItems, companyNavItems } from '../../src/navigation/shellModules';
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
  const walk = (items) => {
    for (const item of items || []) {
      if (subView) {
        if (item.action?.tab === tab && item.action?.subView === subView) return item.label;
      } else if (item.id === tab || (item.action?.tab === tab && !item.action?.subView)) {
        return item.label;
      }
      const nested = walk(item.children || []);
      if (nested) return nested;
    }
    return null;
  };
  return walk([...companyNavItems({ includeUnderenheter: true }), ...companyAccountNavItems()]) || 'denne modulen';
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

function useViewAsModel(access) {
  const { uid, familyId } = useApp();
  const selection = useViewAsSelection();
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

  const viewing = previewing ? access.viewingAs : null;
  const name = viewing ? displayName(viewing) : '';
  const scope = access?.viewAsScope;
  const grants = access?.grants;
  const rows = previewing && scope === 'all' ? companyModuleVisibility(grants) : [];
  const visibleLabels = rows.filter((row) => row.visible && !row.child).map((row) => row.label);
  const hiddenLabels = previewing && scope === 'all'
    ? hiddenCompanyModules(grants).map((row) => row.label)
    : [];
  const lens = selection.key === viewAsKey(uid, familyId) && selection.lens === 'companySettings'
    ? 'companySettings'
    : 'all';

  function pick(employeeId) {
    setViewAsEmployee(uid, familyId, employeeId);
  }

  return {
    uid,
    familyId,
    query,
    setQuery,
    previewing,
    capability,
    people,
    viewing,
    name,
    scope,
    grants,
    visibleLabels,
    hiddenLabels,
    lens,
    pick,
  };
}

function ViewAsSheet({ access, onClose }) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const model = useViewAsModel(access);
  const {
    uid, familyId, query, setQuery, previewing, capability, people, viewing, name,
    scope, grants, visibleLabels, hiddenLabels, lens, pick,
  } = model;
  const active = people.filter((row) => !accountDeactivated(row));
  const inactive = people.filter((row) => accountDeactivated(row));

  return (
    <View
      nativeID="view-as-panel"
      accessibilityRole="dialog"
      style={[
        styles.sheet,
        isDesktop && styles.sheetDesk,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      <View style={styles.sheetHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.ink }]}>
            {previewing ? `Ser som ${name}` : 'Vis som'}
          </Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {previewing
              ? `${levelLabel(viewing)} · ${scope === 'companySettings' ? 'bedriftsinnstillinger' : 'alle moduler og apper'}`
              : 'Se moduler og applikasjoner slik en valgt bruker ser dem'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lukk"
          onPress={onClose}
          style={[styles.iconBtn, { borderColor: colors.line }]}
        >
          <Ionicons name="close" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {previewing ? (
        <View nativeID="view-as-summary" style={styles.summary}>
          {scope === 'companySettings' ? (
            <Text style={[styles.body, { color: colors.ink }]}>
              Du tester bedriftsinnstillinger slik {name} ser dem. Øvrige moduler er dine.
            </Text>
          ) : (
            <Text style={[styles.body, { color: colors.ink }]}>
              Menyen viser modulene og applikasjonene {name} ser.
            </Text>
          )}
          <Text style={[styles.body, { color: colors.muted }]}>
            Offentlig bedriftsinfo: {phrase(grants?.companyPublic)}.
            {' '}Grunninnstillinger: {phrase(grants?.companyProfile)}.
            {' '}Underenheter: {phrase(grants?.units)}.
          </Text>
          {scope === 'all' ? (
            <Text style={[styles.body, { color: colors.muted }]}>
              Synlig: {visibleLabels.length ? visibleLabels.join(', ') : 'ingen bedriftsmoduler'}.
              {hiddenLabels.length ? ` Skjult: ${hiddenLabels.join(', ')}.` : ' Ingenting i bedriftsmenyen er skjult.'}
            </Text>
          ) : null}
          <Text style={[styles.body, { color: colors.muted }]}>
            Endring er av i bedriftsmodulene du ser som denne brukeren.
          </Text>
          <Pressable
            nativeID="view-as-clear"
            accessibilityRole="button"
            accessibilityLabel="Tilbakestill visning"
            onPress={() => clearViewAs()}
            style={[styles.stop, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
          >
            <Text style={{ color: colors.brand, fontWeight: '600' }}>Tilbakestill</Text>
          </Pressable>
        </View>
      ) : null}

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
            Rettigheten din tester bare bedriftsinnstillinger. Lese eller høyere på Se som bruker viser alle moduler og apper.
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
        <Pressable
          nativeID="view-as-self"
          accessibilityRole="button"
          accessibilityState={{ selected: !previewing }}
          onPress={() => pick('')}
          style={[
            styles.person,
            {
              borderColor: !previewing ? colors.brand : colors.line,
              backgroundColor: !previewing ? colors.brandSoft : colors.card,
            },
          ]}
        >
          <Text style={{ color: !previewing ? colors.brand : colors.ink }}>Meg selv</Text>
        </Pressable>
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
  );
}

/**
 * Kompakt «vis som» i toppfeltet.
 * Mobil: bare øye. På web med `labeled` står «Vis som» ved siden av øyet.
 * Aktiv visning lyser opp symbolet. Trykk åpner endring og tilbakestilling.
 */
export default function ViewAsControl({ access, labeled = false }) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const { familyId } = useApp();
  const [open, setOpen] = useState(false);
  const previewing = !!access?.previewing && !!access?.viewingAs;
  const name = previewing ? displayName(access.viewingAs) : '';

  if (!access?.canViewAs || !familyId) return null;

  const iconColor = previewing ? '#fff' : colors.ink;
  const label = previewing ? `Ser som ${name}` : 'Vis som bruker';

  return (
    <>
      <Pressable
        nativeID="view-as-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open, selected: previewing }}
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={[
          labeled ? styles.headingBtn : styles.iconBtn,
          {
            borderColor: previewing ? colors.brand : colors.line,
            backgroundColor: previewing ? colors.brand : colors.card,
          },
        ]}
      >
        <Ionicons name={previewing ? 'eye' : 'eye-outline'} size={labeled ? 16 : 20} color={iconColor} />
        {labeled ? (
          <Text style={[styles.headingLabel, { color: iconColor }]} numberOfLines={1}>
            Vis som
          </Text>
        ) : null}
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Lukk vis som" />
          <View style={[styles.modalCenter, isDesktop && styles.modalCenterDesk]} pointerEvents="box-none">
            <ViewAsSheet access={access} onClose={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 160,
  },
  headingLabel: { fontSize: 13, fontWeight: '600' },
  modalRoot: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalCenter: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
  },
  modalCenterDesk: {
    justifyContent: 'flex-start',
    paddingTop: 72,
  },
  sheetDesk: {
    maxHeight: 640,
  },
  sheet: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    maxHeight: '86%',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20 },
  summary: { gap: 6 },
  stop: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lensRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  lens: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  search: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    marginBottom: 8,
  },
  list: { maxHeight: 360 },
  person: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  group: { fontSize: 13, marginTop: 4, marginBottom: 6 },
  placeholder: { flex: 1, padding: 24, gap: 8 },
});
