import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import {
  ACCESS_ACTIONS,
  ACCESS_GROUPS,
  ACCESS_LEVELS,
  accountDeactivated,
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
  parseDropId,
  personDropChange,
  placedLevelId,
  resetLevel,
  setLevelGrant,
  suggestedLevelId,
  toggleGrant,
} from '../../src/access/companyAccess';
import { applyEmployeeClassification, displayName, initials, normalizeEmployee } from '../../src/employees/model';

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

function byName(a, b) {
  return displayName(a).localeCompare(displayName(b), 'nb');
}

function AvatarFace({ employee, colors, active }) {
  const photo = employee?.person?.photoUrl || '';
  const custom = Object.keys(employee?.company?.accessOverrides || {}).length > 0;
  return (
    <View
      style={[
        styles.avatarBtn,
        {
          backgroundColor: colors.sunken,
          borderColor: active ? colors.brand : colors.line,
        },
      ]}
    >
      <View style={styles.avatarClip}>
        {photo ? (
          <Image source={{ uri: photo }} accessibilityIgnoresInvertColors style={styles.avatarImg} />
        ) : (
          <Text style={[styles.avatarText, { color: colors.ink }]}>{initials(employee)}</Text>
        )}
      </View>
      {custom ? <View style={[styles.avatarDot, { backgroundColor: colors.brand, borderColor: colors.card }]} /> : null}
    </View>
  );
}

function employeeMail(employee) {
  return employee?.company?.email || employee?.person?.email || '';
}

function statusNote(employee) {
  const status = employee?.company?.status || 'active';
  if (status === 'deleted') return 'Papirkurv';
  if (status === 'inactive' || status === 'former') return 'Deaktivert';
  if (status === 'leave') return 'Permisjon';
  return '';
}

function splitMembers(members) {
  const active = [];
  const inactive = [];
  for (const employee of members || []) {
    if (accountDeactivated(employee)) inactive.push(employee);
    else active.push(employee);
  }
  return { active, inactive };
}

function rosterMeta(activeCount, inactiveCount, detail) {
  const activeLabel = activeCount === 1 ? '1 aktiv' : `${activeCount} aktive`;
  const inactiveLabel = inactiveCount === 1 ? '1 deaktivert' : `${inactiveCount} deaktiverte`;
  return `${activeLabel} · ${inactiveLabel}${detail ? ` · ${detail}` : ''}`;
}

function MoveTargets({ employee, colors, excludeId, suggestedId, onAssign }) {
  const name = displayName(employee);
  const targets = ACCESS_LEVELS.filter((level) => level.id !== excludeId);
  return (
    <View style={styles.moveBox}>
      <Text style={[styles.kind, { color: colors.ink }]}>Flytt {name} til</Text>
      <View style={styles.modeRow}>
        {targets.map((level) => {
          const suggested = level.id === suggestedId;
          return (
            <Pressable
              key={level.id}
              accessibilityRole="button"
              accessibilityLabel={`Flytt ${name} til ${level.label}`}
              onPress={() => onAssign(employee, level.id)}
              style={[
                styles.moveBtn,
                {
                  borderColor: suggested ? colors.brand : colors.line,
                  backgroundColor: suggested ? colors.brandSoft : colors.card,
                },
              ]}
            >
              <Text style={{ color: suggested ? colors.brand : colors.ink, fontSize: 13 }}>
                {suggested ? `${level.label} · forslag` : level.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function dropHint(dropId) {
  const drop = parseDropId(dropId);
  if (!drop) return 'Slipp på en gruppe';
  const level = drop.levelId === 'unplaced' ? 'Ikke plassert' : (levelById(drop.levelId)?.label || '');
  if (drop.kind === 'status') return drop.status === 'active' ? `Aktiv i ${level}` : `Deaktivert i ${level}`;
  return level;
}

function MemberTabs({ tab, activeCount, inactiveCount, colors, dropKey, hotDrop, onChange }) {
  const tabs = [
    ['active', 'Aktive', activeCount],
    ['inactive', 'Deaktiverte', inactiveCount],
  ];
  return (
    <View style={styles.tabRow}>
      {tabs.map(([id, label, count]) => {
        const on = tab === id;
        const hot = hotDrop === `status:${dropKey}:${id}`;
        return (
          <Pressable
            key={id}
            dataSet={{ drop: `status:${dropKey}:${id}` }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label}, ${count}`}
            onPress={() => onChange(id)}
            style={[styles.tabBtn, {
              borderColor: hot || on ? colors.brand : colors.line,
              backgroundColor: hot || on ? colors.brandSoft : colors.card,
            }]}
          >
            <Text style={{ color: hot || on ? colors.brand : colors.ink, fontWeight: '600' }}>{label}</Text>
            <Text style={[styles.levelCount, { color: colors.muted }]}>{count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusDrop({ dropKey, hotDrop, colors }) {
  return (
    <View style={styles.dropOverlay}>
      <View
        dataSet={{ drop: `status:${dropKey}:active` }}
        style={[styles.dropChip, {
          borderColor: hotDrop === `status:${dropKey}:active` ? colors.brand : colors.line,
          backgroundColor: hotDrop === `status:${dropKey}:active` ? colors.brandSoft : colors.card,
        }]}
      >
        <Text style={{ color: hotDrop === `status:${dropKey}:active` ? colors.brand : colors.ink, fontWeight: '600' }}>Aktiv</Text>
      </View>
      <View
        dataSet={{ drop: `status:${dropKey}:inactive` }}
        style={[styles.dropChip, {
          borderColor: hotDrop === `status:${dropKey}:inactive` ? colors.brand : colors.line,
          backgroundColor: hotDrop === `status:${dropKey}:inactive` ? colors.brandSoft : colors.card,
        }]}
      >
        <Text style={{ color: hotDrop === `status:${dropKey}:inactive` ? colors.brand : colors.ink, fontWeight: '600' }}>Deaktivert</Text>
      </View>
    </View>
  );
}

function LevelDrawer({
  nativeID, title, meta, members, colors, canEdit, movingId, excludeId, suggestedId, compact,
  open, memberTab, settingsOpen, grants, custom, summary, dropKey, hotDrop, dragging,
  onToggleOpen, onMemberTab, onToggleSettings, onToggleMove, onAssign, onToggleGrant, onReset, onOpen,
}) {
  const { active, inactive } = splitMembers(members);
  const tab = memberTab === 'inactive' ? 'inactive' : 'active';
  const shown = tab === 'inactive' ? inactive : active;
  const moving = shown.find((row) => row.id === movingId) || null;
  const hot = !!hotDrop && (hotDrop === `level:${dropKey}` || String(hotDrop).startsWith(`status:${dropKey}:`));
  return (
    <View nativeID={nativeID} style={[styles.drawer, { borderColor: hot ? colors.brand : colors.line, backgroundColor: colors.card }]}>
      <View dataSet={{ drop: `level:${dropKey}` }} style={[styles.drawerHead, hot && !String(hotDrop).startsWith(`status:${dropKey}:`) ? { backgroundColor: colors.brandSoft } : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? `Lukk ${title}` : `Åpne ${title}`}
          onPress={onToggleOpen}
          style={styles.drawerToggle}
        >
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.levelName, { color: colors.ink }]}>{title}</Text>
            <Text style={[styles.kind, { color: colors.muted }]}>{meta}</Text>
          </View>
        </Pressable>
        {onToggleSettings ? (
          <Pressable
            nativeID={`${nativeID}-gear`}
            accessibilityRole="button"
            accessibilityLabel={`Innstillinger for ${title}`}
            accessibilityState={{ expanded: settingsOpen }}
            onPress={onToggleSettings}
            style={[styles.gearBtn, { borderColor: settingsOpen ? colors.brand : colors.line, backgroundColor: settingsOpen ? colors.brandSoft : colors.card }]}
          >
            <Ionicons name="settings-outline" size={18} color={settingsOpen ? colors.brand : colors.ink} />
          </Pressable>
        ) : null}
        {dragging && !open ? <StatusDrop dropKey={dropKey} hotDrop={hotDrop} colors={colors} /> : null}
      </View>
      {settingsOpen && grants ? (
        <View nativeID={`${nativeID}-settings`} style={[styles.drawerBody, { borderTopColor: colors.line }]}>
          <Text style={[styles.summary, { color: colors.ink }]}>{summary}</Text>
          <Text style={[styles.kind, { color: custom ? colors.brand : colors.muted }]}>
            {custom ? 'Tilpasset for denne bedriften' : 'Standard'}
          </Text>
          {canEdit && custom && onReset ? (
            <Pressable accessibilityRole="button" onPress={onReset} style={[styles.quietBtn, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Tilbakestill nivået til standard</Text>
            </Pressable>
          ) : null}
          <Matrix
            grants={grants}
            colors={colors}
            compact={compact}
            canEdit={canEdit}
            onToggle={onToggleGrant}
          />
        </View>
      ) : null}
      {open ? (
        <View style={[styles.drawerBody, { borderTopColor: colors.line }]}>
          <MemberTabs
            tab={tab}
            activeCount={active.length}
            inactiveCount={inactive.length}
            colors={colors}
            dropKey={dropKey}
            hotDrop={hotDrop}
            onChange={onMemberTab}
          />
          {shown.map((employee) => {
            const mail = employeeMail(employee);
            const name = displayName(employee);
            const customPerson = Object.keys(employee.company?.accessOverrides || {}).length > 0;
            const note = statusNote(employee);
            const movingThis = employee.id === movingId;
            return (
              <View key={employee.id} nativeID={`access-person-${employee.id}`} style={styles.memberLine}>
                <View style={styles.memberRow}>
                  {canEdit ? (
                    <Pressable
                      dataSet={{ drag: employee.id }}
                      accessibilityRole="button"
                      accessibilityLabel={`Dra ${name}`}
                      style={styles.dragHandle}
                    >
                      <Ionicons name="reorder-three-outline" size={22} color={colors.muted} />
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Åpne ${name}`}
                    onPress={() => onOpen(employee)}
                    style={{ flex: 1 }}
                  >
                    <Text style={[styles.personName, { color: colors.ink }]}>{name}</Text>
                    <Text style={[styles.kind, { color: colors.muted }]}>
                      {mail || 'Ingen e-post'}
                      {note ? ` · ${note}` : ''}
                      {customPerson ? ' · egen tilpasning' : ''}
                    </Text>
                  </Pressable>
                  {canEdit ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={movingThis ? `Lukk flytting av ${displayName(employee)}` : `Flytt ${displayName(employee)}`}
                      onPress={() => onToggleMove(employee.id)}
                      style={styles.moveLink}
                    >
                      <Text style={{ color: colors.brand }}>{movingThis ? 'Lukk' : 'Flytt'}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {movingThis && canEdit ? (
                  <MoveTargets
                    employee={employee}
                    colors={colors}
                    excludeId={excludeId}
                    suggestedId={employee.id === moving?.id ? suggestedId : ''}
                    onAssign={onAssign}
                  />
                ) : null}
              </View>
            );
          })}
          {!shown.length ? (
            <Text style={[styles.kind, { color: colors.muted }]}>
              {tab === 'inactive' ? 'Ingen deaktiverte i denne gruppen.' : 'Ingen aktive i denne gruppen.'}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
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

export function PersonAccessSheet({
  person,
  personLevel,
  personGrants,
  personBase,
  colors,
  canEdit,
  busy,
  dirty,
  compact,
  scrollMax,
  onClose,
  onPickLevel,
  onToggleGrant,
  onSave,
  onClear,
}) {
  if (!person || !personGrants) return null;
  const mail = employeeMail(person);
  const note = statusNote(person);
  return (
    <View nativeID="company-access-person" style={[styles.popupCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.popupHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>{displayName(person)}</Text>
          <Text style={[styles.kind, { color: colors.muted }]}>
            {mail || 'Ingen e-post'}{note ? ` · ${note}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lukk"
          onPress={onClose}
          style={[styles.gearBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
        >
          <Ionicons name="close" size={18} color={colors.ink} />
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: scrollMax }} contentContainerStyle={styles.stack}>
        <Text style={[styles.kind, { color: colors.muted }]}>
          {canEdit
            ? 'Trykk et nivå for å flytte personen dit. Avvikene under gjelder bare denne personen.'
            : 'Avvikene under gjelder bare denne personen.'}
        </Text>
        <LevelChips
          levelId={personLevel}
          onPick={onPickLevel}
          colors={colors}
          counts={null}
        />
        <Matrix
          grants={personGrants}
          base={personBase}
          colors={colors}
          compact={compact}
          canEdit={canEdit && !busy}
          onToggle={onToggleGrant}
        />
        {canEdit ? (
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="button"
              disabled={!dirty || busy}
              onPress={onSave}
              style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: !dirty || busy ? 0.5 : 1 }]}
            >
              <Text style={styles.primaryText}>Lagre avvik for personen</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onClear}
              style={[styles.quietBtn, { borderColor: colors.line }]}
            >
              <Text style={{ color: colors.ink }}>Nullstill til nivået</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function PersonAccessPopup(props) {
  const { height } = useWindowDimensions();
  if (!props.person) return null;
  const scrollMax = Math.max(240, Math.round((height || 800) * 0.62));
  return (
    <Modal transparent visible animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.modalBg}>
        <Pressable style={styles.modalDismiss} onPress={props.onClose} accessibilityLabel="Lukk personinnstillinger" />
        <PersonAccessSheet {...props} scrollMax={scrollMax} />
      </View>
    </Modal>
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
  initialMovingId = '',
  initialDrawerId = '',
  initialSettingsId = '',
  initialMemberTab = '',
  initialPersonId = '',
  initialMode = 'levels',
}) {
  const policyKey = JSON.stringify(company?.accessPolicy || {});
  const [policy, setPolicy] = useState(() => normalizeAccessPolicy(company?.accessPolicy));
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [query, setQuery] = useState('');
  const [personId, setPersonId] = useState(initialPersonId);
  const [personGrants, setPersonGrants] = useState(null);
  const [personDirty, setPersonDirty] = useState(false);
  const [movingId, setMovingId] = useState(initialMovingId);
  const [openDrawers, setOpenDrawers] = useState(() => {
    const next = {};
    if (initialDrawerId) next[initialDrawerId] = true;
    if (initialMovingId) {
      const row = employees.find((item) => item.id === initialMovingId);
      if (row) next[placedLevelId(row) || 'unplaced'] = true;
    }
    return next;
  });
  const [settingsId, setSettingsId] = useState(initialSettingsId);
  const [memberTabs, setMemberTabs] = useState(() => {
    const next = {};
    if (initialDrawerId && initialMemberTab) next[initialDrawerId] = initialMemberTab;
    if (initialMovingId) {
      const row = employees.find((item) => item.id === initialMovingId);
      if (row && accountDeactivated(row)) next[placedLevelId(row) || 'unplaced'] = 'inactive';
    }
    return next;
  });
  const { width } = useWindowDimensions();
  const compact = layout === 'compact' || (layout !== 'table' && width > 0 && width < 760);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [drag, setDrag] = useState(null);
  const dropRef = useRef(() => {});
  const employeesRef = useRef(employees);
  employeesRef.current = employees;

  useEffect(() => {
    setPolicy(normalizeAccessPolicy(company?.accessPolicy));
    setDirty(false);
  }, [policyKey]);

  const grouped = useMemo(() => groupEmployeesByLevel(employees), [employees]);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((row) => row?.company?.status !== 'deleted')
      .filter((row) => !q || displayName(row).toLowerCase().includes(q))
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'nb'));
  }, [employees, query]);

  const person = employees.find((row) => row.id === personId) || null;
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
    if (placedLevelId(employee) === nextLevel.id) return;
    setMovingId('');
    const next = applyEmployeeClassification(employee, { accessLevel: nextLevel.id });
    savePerson(next, `${displayName(employee)} er nå ${nextLevel.label}.`);
  }

  function dropPerson(employee, dropId) {
    const change = personDropChange(employee, dropId);
    if (!change || !employee) return;
    const name = displayName(employee);
    const patch = {};
    if (change.levelId) patch.accessLevel = change.levelId;
    if (change.activate) patch.status = 'active';
    if (change.deactivate) {
      patch.status = 'inactive';
      patch.canLogin = false;
    }
    let next = Object.keys(patch).length ? applyEmployeeClassification(employee, patch) : employee;
    if (change.clearLevel) {
      next = normalizeEmployee({
        ...next,
        company: { ...next.company, accessLevel: '', accessRole: '' },
      });
    }
    const levelName = change.clearLevel
      ? 'Ikke plassert'
      : (levelById(change.levelId)?.label || levelById(placedLevelId(employee))?.label || 'gruppen');
    let success = `${name} er nå ${levelName}.`;
    if (change.activate && (change.levelId || change.clearLevel)) success = `${name} er aktiv i ${levelName}.`;
    else if (change.deactivate && (change.levelId || change.clearLevel)) success = `${name} er deaktivert i ${levelName}.`;
    else if (change.activate) success = `${name} er aktiv.`;
    else if (change.deactivate) success = `${name} er deaktivert.`;
    const destination = change.clearLevel ? 'unplaced' : (change.levelId || placedLevelId(employee) || 'unplaced');
    setOpenDrawers((current) => ({ ...current, [destination]: true }));
    if (change.activate || change.deactivate) {
      setMemberTabs((current) => ({ ...current, [destination]: change.deactivate ? 'inactive' : 'active' }));
    }
    setMovingId('');
    savePerson(next, success);
  }

  dropRef.current = dropPerson;

  function dropAt(x, y) {
    if (typeof document === 'undefined' || !document.elementFromPoint) return '';
    const el = document.elementFromPoint(x, y);
    const zone = el && el.closest ? el.closest('[data-drop]') : null;
    return zone ? zone.getAttribute('data-drop') || '' : '';
  }

  useEffect(() => {
    if (!canEdit || typeof window === 'undefined') return undefined;
    let employee = null;
    let originX = 0;
    let originY = 0;
    let active = false;
    let usingPointer = false;

    function rowFrom(event) {
      const handle = event.target && event.target.closest ? event.target.closest('[data-drag]') : null;
      if (!handle) return null;
      const id = handle.getAttribute('data-drag');
      return employeesRef.current.find((row) => row.id === id) || null;
    }
    function down(event) {
      if (busy) return;
      if (event.type === 'mousedown') {
        if (usingPointer || event.button !== 0) return;
      } else {
        usingPointer = true;
      }
      const row = rowFrom(event);
      if (!row) return;
      employee = row;
      originX = event.pageX;
      originY = event.pageY;
      active = false;
    }
    function move(event) {
      if (!employee) return;
      if (event.type === 'mousemove' && usingPointer) return;
      const dx = event.pageX - originX;
      const dy = event.pageY - originY;
      if (!active && dx * dx + dy * dy < 25) return;
      active = true;
      if (event.cancelable) event.preventDefault();
      setDrag({
        id: employee.id,
        name: displayName(employee),
        x: event.clientX,
        y: event.clientY,
        drop: dropAt(event.clientX, event.clientY),
      });
    }
    function up(event) {
      if (!employee) return;
      if (event.type === 'mouseup' && usingPointer) return;
      const row = employee;
      const did = active;
      employee = null;
      active = false;
      if (did) dropRef.current(row, dropAt(event.clientX, event.clientY));
      setDrag(null);
    }
    const pairs = [
      ['pointerdown', down],
      ['mousedown', down],
      ['pointermove', move],
      ['mousemove', move],
      ['pointerup', up],
      ['mouseup', up],
      ['pointercancel', up],
    ];
    for (const [type, handler] of pairs) window.addEventListener(type, handler, true);
    return () => {
      for (const [type, handler] of pairs) window.removeEventListener(type, handler, true);
    };
  }, [canEdit, busy]);

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
        Åtte standardnivåer ligger til grunn og kan tilpasses. Hver ansatt hører til ett nivå.
        Åpne et nivå og velg Aktive eller Deaktiverte. Tannhjulet på gruppen setter se, lese, skrive og slette for modulene.
        En person kan i tillegg få egne avvik. Høyere rettighet tar med dem under.
      </Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Se som bruker, under Visning, er standard for administrator og øverste leder.
        Se tester bare bedriftsinnstillinger. Lese eller høyere viser alle moduler og applikasjoner.
        Nivå og personavvik kan gi funksjonen til andre.
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
              onPress={() => {
                setMode(id);
                setMovingId('');
                setPersonId('');
              }}
              style={[styles.modeChip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: on ? colors.brand : colors.ink }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'levels' ? (
        <View style={styles.stack}>
          <Text style={[styles.kind, { color: colors.muted }]}>
            {canEdit
              ? 'Trykk navnet for å åpne personen. Dra i håndtaket og slipp på en annen gruppe, eller på Aktiv eller Deaktivert. Tannhjulet definerer tilgangen til modulene.'
              : 'Åpne gruppen og velg Aktive eller Deaktiverte. Trykk navnet for å se personen. Tannhjulet viser tilgangen til modulene.'}
          </Text>
          {ACCESS_LEVELS.map((row) => {
            const roster = [...(grouped.buckets[row.id] || [])].sort(byName);
            const parts = splitMembers(roster);
            const grants = levelGrants(policy, row.id);
            return (
              <LevelDrawer
                key={row.id}
                nativeID={`company-access-level-${row.id}`}
                title={`${row.order}. ${row.label}`}
                meta={rosterMeta(parts.active.length, parts.inactive.length, kindLabel(row.kind))}
                members={roster}
                colors={colors}
                compact={compact}
                canEdit={canEdit && !busy}
                movingId={movingId}
                excludeId={row.id}
                open={!!openDrawers[row.id]}
                dropKey={row.id}
                hotDrop={drag?.drop || ''}
                dragging={!!drag}
                onOpen={(employee) => setPersonId(employee.id)}
                memberTab={memberTabs[row.id]}
                onMemberTab={(tab) => {
                  setMemberTabs((current) => ({ ...current, [row.id]: tab }));
                  setMovingId('');
                }}
                settingsOpen={settingsId === row.id}
                grants={grants}
                custom={levelIsCustom(policy, row.id)}
                summary={row.summary}
                onToggleOpen={() => setOpenDrawers((current) => ({ ...current, [row.id]: !current[row.id] }))}
                onToggleSettings={() => setSettingsId((current) => (current === row.id ? '' : row.id))}
                onToggleMove={(id) => setMovingId((current) => (current === id ? '' : id))}
                onAssign={assignLevel}
                onToggleGrant={(resourceId, action, on) => {
                  const next = toggleGrant(grants[resourceId], action, on);
                  setPolicy(setLevelGrant(policy, row.id, resourceId, next));
                  setDirty(true);
                  setNote('');
                }}
                onReset={() => {
                  setPolicy(resetLevel(policy, row.id));
                  setDirty(true);
                }}
              />
            );
          })}
          <LevelDrawer
            nativeID="company-access-unplaced"
            title="Ikke plassert"
            meta={grouped.unplaced.length
              ? rosterMeta(splitMembers(grouped.unplaced).active.length, splitMembers(grouped.unplaced).inactive.length, 'Ikke tildelt nivå ennå')
              : 'Alle ansatte er plassert i ett nivå.'}
            members={[...grouped.unplaced].sort(byName)}
            colors={colors}
            compact={compact}
            canEdit={canEdit && !busy}
            movingId={movingId}
            excludeId=""
            suggestedId={movingId ? suggestedLevelId(grouped.unplaced.find((row) => row.id === movingId)) : ''}
            open={!!openDrawers.unplaced}
            dropKey="unplaced"
            hotDrop={drag?.drop || ''}
            dragging={!!drag}
            onOpen={(employee) => setPersonId(employee.id)}
            memberTab={memberTabs.unplaced}
            onMemberTab={(tab) => {
              setMemberTabs((current) => ({ ...current, unplaced: tab }));
              setMovingId('');
            }}
            settingsOpen={false}
            onToggleOpen={() => setOpenDrawers((current) => ({ ...current, unplaced: !current.unplaced }))}
            onToggleMove={(id) => setMovingId((current) => (current === id ? '' : id))}
            onAssign={assignLevel}
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
            const note = statusNote(employee);
            return (
              <Pressable
                key={employee.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Endre ${displayName(employee)}`}
                onPress={() => setPersonId(employee.id)}
                style={[styles.person, { borderColor: on ? colors.brand : colors.line, backgroundColor: colors.card }]}
              >
                <AvatarFace employee={employee} colors={colors} active={on} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personName, { color: colors.ink }]}>{displayName(employee)}</Text>
                  <Text style={[styles.kind, { color: colors.muted }]}>
                    {label}{note ? ` · ${note}` : ''}{custom ? ' · egen tilpasning' : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <Text style={[styles.kind, { color: colors.muted }]}>Trykk en ansatt for å endre nivå og avvik.</Text>
        </View>
      )}
      {drag && typeof document !== 'undefined' ? createPortal(
        <View style={[styles.dragGhost, { left: drag.x + 14, top: drag.y + 16, borderColor: colors.brand, pointerEvents: 'none' }]}>
          <Text style={[styles.personName, { color: colors.ink }]}>{drag.name}</Text>
          <Text style={[styles.kind, { color: colors.brand }]}>{dropHint(drag.drop)}</Text>
        </View>,
        document.body,
      ) : null}
      <PersonAccessPopup
        person={person}
        personLevel={personLevel}
        personGrants={personGrants}
        personBase={personBase}
        colors={colors}
        canEdit={canEdit && !busy}
        busy={busy}
        dirty={personDirty}
        compact={compact}
        onClose={() => setPersonId('')}
        onPickLevel={(id) => canEdit && assignLevel(person, id)}
        onToggleGrant={(resourceId, action, on) => {
          const next = toggleGrant(personGrants[resourceId], action, on);
          setPersonGrants({ ...personGrants, [resourceId]: next });
          setPersonDirty(true);
          setNote('');
        }}
        onSave={savePersonGrants}
        onClear={clearPersonGrants}
      />
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
  cardTitle: { fontSize: 18, fontWeight: '600' },
  tabRow: { flexDirection: 'row', gap: 8 },
  tabBtn: { flex: 1, borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalBg: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalDismiss: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,23,42,0.45)' },
  popupCard: { width: '100%', maxWidth: 560, maxHeight: '100%', borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, zIndex: 2 },
  popupHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  drawer: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 8, paddingVertical: 4 },
  drawerToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 8 },
  gearBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  drawerBody: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  memberLine: { gap: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moveLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  dragHandle: { width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center', cursor: 'grab' },
  dropOverlay: { position: 'absolute', right: 56, top: 8, bottom: 8, width: 280, flexDirection: 'row', gap: 8 },
  dropChip: { flex: 1, borderWidth: 1, borderRadius: 12, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  dragGhost: { position: 'fixed', zIndex: 80, borderWidth: 1, borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, maxWidth: 240 },
  avatarBtn: { position: 'relative', width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarClip: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 28, height: 28 },
  avatarText: { fontSize: 11, fontWeight: '700' },
  avatarDot: { position: 'absolute', right: -1, bottom: -1, width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  moveBox: { gap: 6, width: '100%' },
  moveBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
