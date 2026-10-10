import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ACCESS_ACTIONS,
  ACCESS_GROUPS,
  ACCESS_LEVELS,
  applyOverrides,
  checksFromGrant,
  compactOverrides,
  compactPolicy,
  effectiveLevelId,
  groupEmployeesByLevel,
  levelById,
  levelGrants,
  levelIsCustom,
  normalizeAccessPolicy,
  placedLevelId,
  resetLevel,
  setLevelGrant,
  suggestedLevelId,
  toggleGrant,
} from '../../src/access/companyAccess';
import { displayName, normalizeEmployee } from '../../src/employees/model';

function kindLabel(kind) {
  if (kind === 'external') return 'Eksternt · ikke fast ansatt';
  if (kind === 'innleid') return 'Innleie · ikke fast ansatt';
  return 'Ansatt i bedriften';
}

function CheckBox({ on, disabled, colors, onPress, label }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.checkHit}
    >
      <View
        style={[
          styles.check,
          {
            borderColor: on ? colors.brand : colors.line,
            backgroundColor: on ? colors.brand : 'transparent',
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        {on ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
    </Pressable>
  );
}

function Matrix({ grants, base, colors, canEdit, onToggle, compact = false }) {
  if (compact) {
    return (
      <View style={styles.stack}>
        {ACCESS_GROUPS.map((group) => (
          <View key={group.id} style={styles.group}>
            <Text style={[styles.groupLabel, { color: colors.muted }]}>{group.label}</Text>
            {group.resources.map((resource) => {
              const grant = grants?.[resource.id] || 'none';
              const checks = checksFromGrant(grant);
              const overridden = base ? (base[resource.id] || 'none') !== grant : false;
              return (
                <View key={resource.id} style={[styles.compactRow, { borderColor: colors.line }]}>
                  <Text style={[styles.areaLabel, { color: colors.ink }]}>{resource.label}</Text>
                  {resource.hint ? <Text style={[styles.areaHint, { color: colors.muted }]}>{resource.hint}</Text> : null}
                  {overridden ? <Text style={[styles.overrideMark, { color: colors.brand }]}>Avvik fra nivået</Text> : null}
                  <View style={styles.compactChecks}>
                    {ACCESS_ACTIONS.map((action) => (
                      <View key={action.id} style={styles.compactCheck}>
                        <Text style={[styles.compactAction, { color: colors.muted }]}>{action.label}</Text>
                        <CheckBox
                          on={checks[action.id]}
                          disabled={!canEdit}
                          colors={colors}
                          label={`${resource.label}, ${action.label}`}
                          onPress={() => onToggle(resource.id, action.id, !checks[action.id])}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={styles.matrix}>
        {ACCESS_GROUPS.map((group) => (
          <View key={group.id} style={styles.group}>
            <Text style={[styles.groupLabel, { color: colors.muted }]}>{group.label}</Text>
            <View style={[styles.matrixHead, { borderColor: colors.line }]}>
              <Text style={[styles.areaHead, { color: colors.muted }]}>Område</Text>
              {ACCESS_ACTIONS.map((action) => (
                <Text key={action.id} style={[styles.actionHead, { color: colors.muted }]}>{action.label}</Text>
              ))}
            </View>
            {group.resources.map((resource) => {
              const grant = grants?.[resource.id] || 'none';
              const checks = checksFromGrant(grant);
              const overridden = base ? (base[resource.id] || 'none') !== grant : false;
              return (
                <View key={resource.id} style={[styles.matrixRow, { borderColor: colors.line }]}>
                  <View style={styles.areaCell}>
                    <Text style={[styles.areaLabel, { color: colors.ink }]}>{resource.label}</Text>
                    {resource.hint ? (
                      <Text style={[styles.areaHint, { color: colors.muted }]}>{resource.hint}</Text>
                    ) : null}
                    {overridden ? (
                      <Text style={[styles.overrideMark, { color: colors.brand }]}>Avvik fra nivået</Text>
                    ) : null}
                  </View>
                  {ACCESS_ACTIONS.map((action) => (
                    <CheckBox
                      key={action.id}
                      on={checks[action.id]}
                      disabled={!canEdit}
                      colors={colors}
                      label={`${resource.label}, ${action.label}`}
                      onPress={() => onToggle(resource.id, action.id, !checks[action.id])}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function LevelChips({ levelId, onPick, colors, counts }) {
  return (
    <View style={styles.levelRow}>
      {ACCESS_LEVELS.map((level) => {
        const on = level.id === levelId;
        const count = counts ? (counts[level.id] || 0) : null;
        return (
          <Pressable
            key={level.id}
            nativeID={`company-access-level-${level.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(level.id)}
            style={[
              styles.levelChip,
              {
                borderColor: on ? colors.brand : colors.line,
                backgroundColor: on ? colors.brandSoft : colors.card,
              },
            ]}
          >
            <Text style={[styles.levelOrder, { color: on ? colors.brand : colors.muted }]}>{level.order}</Text>
            <Text style={[styles.levelName, { color: on ? colors.brand : colors.ink }]}>{level.label}</Text>
            {count == null ? null : (
              <Text style={[styles.levelCount, { color: colors.muted }]}>{count}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function CompanyAccessDenied({ colors }) {
  return (
    <View style={styles.denied}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Ingen tilgang</Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Du har ikke tilgang til denne delen av bedriften. Tilgangen styres under Selskap, Tilgang.
      </Text>
    </View>
  );
}

export default function CompanyAccessSettings({
  company,
  employees = [],
  canEdit = false,
  colors,
  busy = false,
  onSavePolicy,
  onSaveEmployee,
  layout = '',
}) {
  const policyKey = JSON.stringify(company?.accessPolicy || {});
  const [policy, setPolicy] = useState(() => normalizeAccessPolicy(company?.accessPolicy));
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState('levels');
  const [levelId, setLevelId] = useState('ansatt');
  const [query, setQuery] = useState('');
  const [personId, setPersonId] = useState('');
  const [personGrants, setPersonGrants] = useState(null);
  const [personDirty, setPersonDirty] = useState(false);
  const { width } = useWindowDimensions();
  const compact = layout === 'compact' || (layout !== 'table' && width > 0 && width < 760);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    setPolicy(normalizeAccessPolicy(company?.accessPolicy));
    setDirty(false);
  }, [policyKey]);

  const grouped = useMemo(() => groupEmployeesByLevel(employees), [employees]);
  const counts = useMemo(() => {
    const next = {};
    for (const level of ACCESS_LEVELS) next[level.id] = grouped.buckets[level.id].length;
    return next;
  }, [grouped]);
  const level = levelById(levelId) || ACCESS_LEVELS[2];
  const levelGrant = levelGrants(policy, level.id);
  const members = grouped.buckets[level.id] || [];

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((row) => row?.company?.status !== 'deleted')
      .filter((row) => !q || displayName(row).toLowerCase().includes(q))
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'nb'));
  }, [employees, query]);

  const person = people.find((row) => row.id === personId) || null;
  const personLevel = person ? (placedLevelId(person) || '') : '';
  const personBase = person
    ? levelGrants(policy, placedLevelId(person) || effectiveLevelId(person))
    : null;

  useEffect(() => {
    if (!person) {
      setPersonGrants(null);
      setPersonDirty(false);
      return;
    }
    const base = levelGrants(policy, placedLevelId(person) || effectiveLevelId(person));
    setPersonGrants(applyOverrides(base, person.company?.accessOverrides));
    setPersonDirty(false);
  }, [personId, policyKey, person?.updatedAt]);

  async function savePolicy() {
    if (!canEdit || busy) return;
    setError('');
    setNote('');
    try {
      await onSavePolicy(compactPolicy(policy));
      setDirty(false);
      setNote('Nivåene er lagret.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke lagre tilgangen.');
    }
  }

  async function savePerson(nextEmployee, success) {
    if (!canEdit || busy) return;
    setError('');
    setNote('');
    try {
      await onSaveEmployee(nextEmployee);
      setPersonDirty(false);
      setNote(success);
    } catch (err) {
      setError(err?.message || 'Kunne ikke lagre personen.');
    }
  }

  function assignLevel(employee, nextLevelId) {
    const nextLevel = levelById(nextLevelId);
    if (!nextLevel || !employee) return;
    const company = {
      ...employee.company,
      accessLevel: nextLevel.id,
      accessRole: nextLevel.label,
    };
    if (nextLevel.kind === 'staff' && (company.personnelKind === 'external' || company.personnelKind === 'innleid')) {
      company.personnelKind = 'staff';
      company.external = false;
      if (/^(ekstern|innleid|innleie)$/i.test(company.employmentType || '')) company.employmentType = 'Fast ansatt';
    }
    const next = normalizeEmployee({ ...employee, company });
    savePerson(next, `${displayName(employee)} er nå ${nextLevel.label}.`);
  }

  function savePersonGrants() {
    if (!person || !personGrants || !personBase) return;
    const next = normalizeEmployee({
      ...person,
      company: {
        ...person.company,
        accessOverrides: compactOverrides(personBase, personGrants),
      },
    });
    savePerson(next, `Avvikene for ${displayName(person)} er lagret.`);
  }

  function clearPersonGrants() {
    if (!person || !personBase) return;
    setPersonGrants({ ...personBase });
    const next = normalizeEmployee({
      ...person,
      company: { ...person.company, accessOverrides: {} },
    });
    savePerson(next, `${displayName(person)} følger nivået igjen.`);
  }

  return (
    <View nativeID="company-access-page" id="company-access-page" style={styles.page}>
      <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.title, { color: colors.ink }]}>Tilgang</Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Seks standardnivåer ligger til grunn og kan tilpasses. Hver ansatt hører til ett nivå.
        En person kan i tillegg få egne avvik. Se, lese, skrive og slette gjelder hvert område.
        Høyere rettighet tar med dem under.
      </Text>
      {!canEdit ? (
        <Text style={[styles.lead, { color: colors.muted }]}>
          Du kan se oppsettet. Bare administrator kan endre nivåer, hvem som hører til hvor, og personavvik.
        </Text>
      ) : null}
      {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
      {!!note && <Text style={[styles.note, { color: colors.brand }]}>{note}</Text>}

      <View style={styles.modeRow}>
        {[['levels', 'Nivåer'], ['people', 'Personer']].map(([id, label]) => {
          const on = mode === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setMode(id)}
              style={[styles.modeChip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: on ? colors.brand : colors.ink }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'levels' ? (
        <View style={styles.stack}>
          <LevelChips levelId={level.id} onPick={setLevelId} colors={colors} counts={counts} />
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>{level.order}. {level.label}</Text>
            <Text style={[styles.kind, { color: colors.muted }]}>{kindLabel(level.kind)}</Text>
            <Text style={[styles.summary, { color: colors.ink }]}>{level.summary}</Text>
            {levelIsCustom(policy, level.id) ? (
              <Text style={[styles.kind, { color: colors.brand }]}>Tilpasset for denne bedriften</Text>
            ) : (
              <Text style={[styles.kind, { color: colors.muted }]}>Standard</Text>
            )}
            {canEdit && levelIsCustom(policy, level.id) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPolicy(resetLevel(policy, level.id));
                  setDirty(true);
                }}
                style={[styles.quietBtn, { borderColor: colors.line }]}
              >
                <Text style={{ color: colors.ink }}>Tilbakestill nivået til standard</Text>
              </Pressable>
            ) : null}
          </View>

          <Matrix
            grants={levelGrant}
            colors={colors}
            compact={compact}
            canEdit={canEdit && !busy}
            onToggle={(resourceId, action, on) => {
              const next = toggleGrant(levelGrant[resourceId], action, on);
              setPolicy(setLevelGrant(policy, level.id, resourceId, next));
              setDirty(true);
              setNote('');
            }}
          />

          {canEdit ? (
            <Pressable
              nativeID="company-access-save"
              accessibilityRole="button"
              disabled={!dirty || busy}
              onPress={savePolicy}
              style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: !dirty || busy ? 0.5 : 1 }]}
            >
              <Text style={styles.primaryText}>{busy ? 'Lagrer…' : 'Lagre tilpasning av nivåer'}</Text>
            </Pressable>
          ) : null}

          <Text style={[styles.sectionTitle, { color: colors.ink }]}>
            {members.length === 1 ? '1 ansatt i nivået' : `${members.length} ansatte i nivået`}
          </Text>
          {members.map((employee) => (
            <PersonLine
              key={employee.id}
              employee={employee}
              colors={colors}
              canEdit={canEdit && !busy}
              onAssign={assignLevel}
            />
          ))}
          {!members.length ? (
            <Text style={[styles.kind, { color: colors.muted }]}>Ingen er plassert her ennå.</Text>
          ) : null}

          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Ikke plassert</Text>
          <Text style={[styles.kind, { color: colors.muted }]}>
            Disse har ikke fått et nivå ennå. De ligger ikke i flere grupper. Eksterne foreslås til regnskap eller innleie, øvrige får ansattnivå til de plasseres.
          </Text>
          {grouped.unplaced.map((employee) => {
            const suggestion = suggestedLevelId(employee);
            const suggested = suggestion ? levelById(suggestion) : null;
            return (
              <View key={employee.id} style={[styles.person, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personName, { color: colors.ink }]}>{displayName(employee)}</Text>
                  <Text style={[styles.kind, { color: colors.muted }]}>
                    {suggested ? `Foreslått: ${suggested.label}` : 'Får ansattnivå til nivået er valgt'}
                  </Text>
                </View>
                {canEdit && suggested ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => assignLevel(employee, suggested.id)}
                    style={[styles.quietBtn, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>Plasser</Text>
                  </Pressable>
                ) : null}
                {canEdit ? (
                  <AssignRow employee={employee} colors={colors} onAssign={assignLevel} />
                ) : null}
              </View>
            );
          })}
          {!grouped.unplaced.length ? (
            <Text style={[styles.kind, { color: colors.muted }]}>Alle ansatte er plassert i ett nivå.</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.stack}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk etter ansatt"
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="Søk etter ansatt"
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          {people.map((employee) => {
            const placed = placedLevelId(employee);
            const label = placed ? levelById(placed)?.label : 'Ikke plassert';
            const on = employee.id === personId;
            const custom = Object.keys(employee.company?.accessOverrides || {}).length > 0;
            return (
              <Pressable
                key={employee.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setPersonId(employee.id)}
                style={[styles.person, { borderColor: on ? colors.brand : colors.line, backgroundColor: colors.card }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personName, { color: colors.ink }]}>{displayName(employee)}</Text>
                  <Text style={[styles.kind, { color: colors.muted }]}>
                    {label}{custom ? ' · egen tilpasning' : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {person && personGrants ? (
            <View nativeID="company-access-person" style={styles.stack}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>{displayName(person)}</Text>
              <Text style={[styles.kind, { color: colors.muted }]}>
                Velg ett nivå. Personavvikene under gjelder bare denne personen.
              </Text>
              <LevelChips
                levelId={personLevel}
                onPick={(id) => canEdit && assignLevel(person, id)}
                colors={colors}
                counts={null}
              />
              <Matrix
                grants={personGrants}
                base={personBase}
                colors={colors}
                compact={compact}
                canEdit={canEdit && !busy}
                onToggle={(resourceId, action, on) => {
                  const next = toggleGrant(personGrants[resourceId], action, on);
                  setPersonGrants({ ...personGrants, [resourceId]: next });
                  setPersonDirty(true);
                  setNote('');
                }}
              />
              {canEdit ? (
                <View style={styles.modeRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!personDirty || busy}
                    onPress={savePersonGrants}
                    style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: !personDirty || busy ? 0.5 : 1 }]}
                  >
                    <Text style={styles.primaryText}>Lagre avvik for personen</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={clearPersonGrants}
                    style={[styles.quietBtn, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>Nullstill til nivået</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={[styles.kind, { color: colors.muted }]}>Velg en ansatt for å sette nivå og egne avvik.</Text>
          )}
        </View>
      )}
    </View>
  );
}

function AssignRow({ employee, colors, onAssign }) {
  return (
    <View style={styles.assign}>
      {ACCESS_LEVELS.map((level) => (
        <Pressable
          key={level.id}
          accessibilityRole="button"
          accessibilityLabel={`Plasser ${displayName(employee)} som ${level.label}`}
          onPress={() => onAssign(employee, level.id)}
          style={[styles.mini, { borderColor: colors.line }]}
        >
          <Text style={{ color: colors.ink, fontSize: 12 }}>{level.order}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PersonLine({ employee, colors, canEdit, onAssign }) {
  const [open, setOpen] = useState(false);
  const custom = Object.keys(employee.company?.accessOverrides || {}).length > 0;
  return (
    <View style={[styles.person, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.personName, { color: colors.ink }]}>{displayName(employee)}</Text>
        <Text style={[styles.kind, { color: colors.muted }]}>
          {[employee.company?.title, custom ? 'Egen tilpasning' : ''].filter(Boolean).join(' · ') || 'Medarbeider'}
        </Text>
      </View>
      {canEdit ? (
        <Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)}>
          <Text style={{ color: colors.brand }}>{open ? 'Lukk' : 'Bytt nivå'}</Text>
        </Pressable>
      ) : null}
      {open && canEdit ? <AssignRow employee={employee} colors={colors} onAssign={onAssign} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  denied: { flex: 1, padding: 24, gap: 8, maxWidth: 560 },
  page: { alignSelf: 'flex-start', width: '100%', maxWidth: 980, gap: 12 },
  stack: { gap: 10 },
  title: { fontSize: 22, fontWeight: '600' },
  lead: { fontSize: 15, lineHeight: 21 },
  error: { fontSize: 14 },
  note: { fontSize: 14 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, minWidth: 140, gap: 2 },
  levelOrder: { fontSize: 12 },
  levelName: { fontSize: 14, fontWeight: '600' },
  levelCount: { fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  kind: { fontSize: 13, lineHeight: 18 },
  summary: { fontSize: 15, lineHeight: 21 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 6 },
  matrix: { minWidth: 680, gap: 14, paddingBottom: 4 },
  group: { gap: 0 },
  groupLabel: { fontSize: 12, marginBottom: 4 },
  matrixHead: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 6 },
  areaHead: { flex: 1, fontSize: 12 },
  actionHead: { width: 72, textAlign: 'center', fontSize: 12 },
  matrixRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, minHeight: 52 },
  areaCell: { flex: 1, paddingVertical: 8, paddingRight: 8 },
  areaLabel: { fontSize: 14 },
  areaHint: { fontSize: 12, marginTop: 2 },
  overrideMark: { fontSize: 12, marginTop: 2 },
  compactRow: { borderBottomWidth: 1, paddingVertical: 10, gap: 4 },
  compactChecks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  compactCheck: { alignItems: 'center', minWidth: 64 },
  compactAction: { fontSize: 12, marginBottom: 4 },
  checkHit: { width: 72, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { alignSelf: 'flex-start', borderRadius: 12, minHeight: 40, justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: '#fff' },
  quietBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  person: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  personName: { fontSize: 15, fontWeight: '600' },
  assign: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: '100%' },
  mini: { width: 36, height: 36, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
