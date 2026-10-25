import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import EmployeeDirectory from '../employees/EmployeeDirectory';
import InfoButton from '../InfoButton';
import {
  ACCESS_ACTIONS,
  ACCESS_GROUPS,
  ACCESS_LEVELS,
  accessLevelSections,
  accessSectionTitle,
  accountDeactivated,
  applyOverrides,
  checksFromGrant,
  compactOverrides,
  compactPolicy,
  effectiveLevelId,
  employeeLevelIds,
  grantsForLevelIds,
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
  withToggledLevel,
} from '../../src/access/companyAccess';
import { applyEmployeeClassification, cardSubtitle, commitEmployee, contactLine, displayName, initials, normalizeEmployee } from '../../src/employees/model';
import { showSaveToast } from '../../src/ui/saveToast';
import { canGrantLevel, canSetGrant, checkPersonChange, grantsAbove } from '../../src/access/accessCeiling';

const ACCESS_LEADS = [
  'Åtte standardnivåer ligger til grunn og kan tilpasses. Hvert nivå har egen matrise for alle moduler, undermoduler og innstillinger. Lese = se uten endring. Begrenset redigering = opprette og redigere. Admin = innstillingsknapper og full styring i modulen. Høyere trinn tar med dem under. Flere nivå på samme person krysses av under Personer.',
  'Alt lagres automatisk med en gang du krysser av. Tilbakestill henter ProTop-standarden for nivået. Se som bruker under Visning: Lese viser bare bedriftsinnstillinger; begrenset redigering eller Admin viser alle moduler.',
  'Ingen kan endre sin egen tilgang, og ingen kan gi mer enn de har selv. Begrenset redigering på Tilgangsstyring (Øverste leder som standard) gir lov til å endre medlemmene. Admin trengs for å endre selve nivåene.',
];

const ACCESS_VIEW_ONLY = 'Du kan se oppsettet. Endringer krever Begrenset redigering eller Admin på Tilgangsstyring.';

const ACCESS_PEOPLE_HINT = 'Kryss av nivåene som passer. Trykk navnet for å åpne den ansatte. Deaktiverte har ingen rettigheter.';

function accessLevelsHint(canEdit) {
  return canEdit
    ? 'Trykk navnet for å åpne den ansatte. Dra i håndtaket og slipp på en annen gruppe, eller på Aktiv eller Deaktivert. Tannhjulet definerer tilgangen til modulene.'
    : 'Åpne gruppen og velg Aktive eller Deaktiverte. Trykk navnet for å åpne den ansatte. Tannhjulet viser tilgangen til modulene.';
}

function AccessHelpCopy({ colors, canEdit, mode }) {
  const paragraphs = [
    ...ACCESS_LEADS,
    ...(canEdit ? [] : [ACCESS_VIEW_ONLY]),
    mode === 'people' ? ACCESS_PEOPLE_HINT : accessLevelsHint(canEdit),
  ];
  return (
    <View style={styles.helpCopy}>
      {paragraphs.map((paragraph) => (
        <Text key={paragraph} style={[styles.summary, { color: colors.ink }]}>{paragraph}</Text>
      ))}
    </View>
  );
}

function kindLabel(level) {
  if (level?.id === 'ansatt_andre_avdelinger') return 'Andre avdelinger · ikke ansatt i bedriften';
  if (level?.kind === 'external') return 'Eksternt · ikke fast ansatt';
  if (level?.kind === 'innleid') return 'Innleie · ikke fast ansatt';
  return 'Ansatt i bedriften';
}

function personBaseGrants(policy, employee) {
  const ids = employeeLevelIds(employee);
  if (ids.length) return grantsForLevelIds(policy, ids);
  return levelGrants(policy, effectiveLevelId(employee));
}

function companyHeadingName(company) {
  return String(company?.navn || company?.name || '').trim();
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

/** Område + Lese + Begrenset redigering + Admin. Minstebredde holder ordene vannrett; fr-andeler vokser med feltet. */
const MATRIX_COLUMNS = 'minmax(200px, 2.4fr) minmax(112px, 1fr) minmax(196px, 1.7fr) minmax(112px, 1fr)';

/** Menytreet i én gruppe som rader: modul (dybde 0), overskrift uten rettighet, og undersider (dybde 1). */
function matrixRows(group) {
  const rows = [];
  for (const item of group.items) {
    rows.push({ key: item.id, item, depth: 0, heading: !!item.heading });
    for (const child of item.children || []) {
      rows.push({ key: child.id, item: child, depth: 1, parentLabel: item.label });
    }
  }
  return rows;
}

function groupMeta(group, grants, base) {
  const total = group.resources.length;
  const granted = group.resources.filter((row) => (grants?.[row.id] || 'none') !== 'none').length;
  const overrides = base
    ? group.resources.filter((row) => (base[row.id] || 'none') !== (grants?.[row.id] || 'none')).length
    : 0;
  const parts = [`${granted} av ${total} med tilgang`];
  if (overrides) parts.push(overrides === 1 ? '1 avvik' : `${overrides} avvik`);
  return parts.join(' · ');
}

/** Kategori som skuff, lik gruppene i hamburgermenyen. Lukket til den åpnes. */
function GroupDrawer({ group, grants, base, colors, children }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.matrixDrawer, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `Lukk ${group.label}` : `Åpne ${group.label}`}
        onPress={() => setOpen((value) => !value)}
        style={styles.matrixDrawerHead}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
        <Ionicons name={group.icon} size={18} color={colors.brand} />
        <View style={styles.drawerTitle}>
          <Text style={[styles.groupLabel, { color: colors.ink }]}>{group.label}</Text>
          <Text style={[styles.kind, { color: colors.muted }]}>{groupMeta(group, grants, base)}</Text>
        </View>
      </Pressable>
      {open ? (
        <View style={[styles.matrixDrawerBody, { borderColor: colors.line }]}>{children}</View>
      ) : null}
    </View>
  );
}

function AreaLabel({ row, colors, overridden }) {
  const { item, depth, heading } = row;
  return (
    <View style={[styles.areaCell, depth ? styles.areaChild : null]}>
      <View style={styles.areaTitle}>
        <Ionicons name={item.icon} size={depth ? 15 : 17} color={heading ? colors.ink : colors.muted} />
        <Text style={[heading || !depth ? styles.areaModule : styles.areaLabel, { color: colors.ink }]}>{item.label}</Text>
      </View>
      {item.hint ? <Text style={[styles.areaHint, styles.areaIndent, { color: colors.muted }]}>{item.hint}</Text> : null}
      {overridden ? <Text style={[styles.overrideMark, styles.areaIndent, { color: colors.brand }]}>Avvik fra nivået</Text> : null}
    </View>
  );
}

function rowState(row, grants, base) {
  const grant = grants?.[row.item.id] || 'none';
  return {
    checks: checksFromGrant(grant),
    overridden: base ? (base[row.item.id] || 'none') !== grant : false,
    a11y: row.parentLabel ? `${row.parentLabel} — ${row.item.label}` : row.item.label,
  };
}

function CompactRows({ group, grants, base, colors, canEdit, onToggle, limit }) {
  return matrixRows(group).map((row) => {
    if (row.heading) {
      return (
        <View key={row.key} style={[styles.compactRow, { borderColor: colors.line }]}>
          <AreaLabel row={row} colors={colors} />
        </View>
      );
    }
    const { checks, overridden, a11y } = rowState(row, grants, base);
    return (
      <View key={row.key} style={[styles.compactRow, { borderColor: colors.line }]}>
        <AreaLabel row={row} colors={colors} overridden={overridden} />
        <View style={[styles.compactChecks, row.depth ? styles.areaChild : null]}>
          {ACCESS_ACTIONS.map((action) => (
            <View key={action.id} style={styles.compactCheck}>
              <Text style={[styles.compactAction, { color: colors.muted }]}>{action.label}</Text>
              <CheckBox
                on={checks[action.id]}
                disabled={!canEdit || (!!limit && !checks[action.id] && !limit(row.item.id, action.id))}
                colors={colors}
                label={`${a11y}, ${action.label}`}
                onPress={() => onToggle(row.item.id, action.id, !checks[action.id])}
              />
            </View>
          ))}
        </View>
      </View>
    );
  });
}

function GridRows({ group, grants, base, colors, canEdit, onToggle, limit }) {
  return (
    <>
      <View dataSet={{ accessMatrix: 'head' }} style={[styles.matrixHead, { borderColor: colors.line }]}>
        <Text style={[styles.areaHead, { color: colors.muted }]}>Område</Text>
        {ACCESS_ACTIONS.map((action) => (
          <Text key={action.id} style={[styles.actionHead, { color: colors.muted }]}>{action.label}</Text>
        ))}
      </View>
      {matrixRows(group).map((row) => {
        if (row.heading) {
          return (
            <View key={row.key} dataSet={{ accessMatrix: 'row' }} style={[styles.matrixRow, styles.headingRow, { borderColor: colors.line }]}>
              <AreaLabel row={row} colors={colors} />
            </View>
          );
        }
        const { checks, overridden, a11y } = rowState(row, grants, base);
        return (
          <View key={row.key} dataSet={{ accessMatrix: 'row' }} style={[styles.matrixRow, { borderColor: colors.line }]}>
            <AreaLabel row={row} colors={colors} overridden={overridden} />
            {ACCESS_ACTIONS.map((action) => (
              <CheckBox
                key={action.id}
                on={checks[action.id]}
                disabled={!canEdit || (!!limit && !checks[action.id] && !limit(row.item.id, action.id))}
                colors={colors}
                label={`${a11y}, ${action.label}`}
                onPress={() => onToggle(row.item.id, action.id, !checks[action.id])}
              />
            ))}
          </View>
        );
      })}
    </>
  );
}

/** limit(resourceId, action) → false når aktøren ikke kan heve dit (tak: eget nivå). */
function Matrix({ grants, base, colors, canEdit, onToggle, compact = false, limit = null }) {
  const Rows = compact ? CompactRows : GridRows;
  return (
    <View style={compact ? styles.stack : styles.matrix}>
      {ACCESS_GROUPS.map((group) => (
        <GroupDrawer key={group.id} group={group} grants={grants} base={base} colors={colors}>
          <Rows group={group} grants={grants} base={base} colors={colors} canEdit={canEdit} onToggle={onToggle} limit={limit} />
        </GroupDrawer>
      ))}
    </View>
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
  if (status === 'inactive' || status === 'former') return 'Deaktivert. Ingen rettigheter.';
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

function MoveTargets({ employee, colors, excludeId, suggestedId, onAssign, allowLevel }) {
  const name = displayName(employee);
  const targets = ACCESS_LEVELS.filter((level) => level.id !== excludeId && (!allowLevel || allowLevel(level.id)));
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
  onToggleOpen, onMemberTab, onToggleSettings, onToggleMove, onAssign, onToggleGrant, onSaveLevel, onReset, onOpen,
  canEditSettings, canEditPerson, allowLevel, limit,
}) {
  const settingsEditable = canEditSettings === undefined ? canEdit : canEditSettings;
  const { active, inactive } = splitMembers(members);
  const tab = memberTab === 'inactive' ? 'inactive' : 'active';
  const shown = tab === 'inactive' ? inactive : active;
  const moving = shown.find((row) => row.id === movingId) || null;
  const hot = !!hotDrop && (hotDrop === `level:${dropKey}` || String(hotDrop).startsWith(`status:${dropKey}:`));
  const expanded = open || settingsOpen;
  return (
    <View nativeID={nativeID} style={[styles.drawer, { borderColor: hot ? colors.brand : colors.line, backgroundColor: colors.card }]}>
      <View dataSet={{ drop: `level:${dropKey}` }} style={[styles.drawerHead, hot && !String(hotDrop).startsWith(`status:${dropKey}:`) ? { backgroundColor: colors.brandSoft } : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? `Lukk ${title}` : `Åpne ${title}`}
          onPress={onToggleOpen}
          style={styles.drawerToggle}
        >
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
          <View dataSet={{ accessTitle: '1' }} style={styles.drawerTitle}>
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
            {custom ? 'Tilpasset for denne bedriften' : 'ProTop-standard'}
          </Text>
          <Matrix
            grants={grants}
            colors={colors}
            compact={compact}
            canEdit={settingsEditable}
            onToggle={onToggleGrant}
            limit={limit}
          />
          {settingsEditable ? (
            <View style={styles.levelActions}>
              {onSaveLevel ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Lagre som standard for ${title}`}
                  onPress={onSaveLevel}
                  style={[styles.primaryBtn, { backgroundColor: colors.brand, flex: 1 }]}
                >
                  <Text style={styles.primaryText}>Lagre som standard</Text>
                </Pressable>
              ) : null}
              {onReset ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Tilbakestill ${title}`}
                  disabled={!custom}
                  onPress={onReset}
                  style={[styles.quietBtn, { borderColor: colors.line, flex: 1, opacity: custom ? 1 : 0.45 }]}
                >
                  <Text style={{ color: colors.ink, textAlign: 'center' }}>Tilbakestill</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
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
            const personEditable = canEdit && (!canEditPerson || canEditPerson(employee));
            return (
              <View key={employee.id} nativeID={`access-person-${employee.id}`} style={styles.memberLine}>
                <View style={styles.memberRow}>
                  {personEditable ? (
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
                  {personEditable ? (
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
                {movingThis && personEditable ? (
                  <MoveTargets
                    employee={employee}
                    colors={colors}
                    excludeId={excludeId}
                    suggestedId={employee.id === moving?.id ? suggestedId : ''}
                    onAssign={onAssign}
                    allowLevel={allowLevel}
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

export function PersonAccessSheet({
  person,
  personGrants,
  personBase,
  colors,
  canEdit,
  busy,
  dirty,
  compact,
  scrollMax,
  onClose,
  onToggleGrant,
  onSave,
  onClear,
  limit,
  lockedReason,
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
          Avvikene under gjelder bare denne personen, oppå nivåene som er krysset av. Endringer lagres med en gang.
        </Text>
        {lockedReason ? <Text style={[styles.kind, { color: colors.danger }]}>{lockedReason}</Text> : null}
        <Matrix
          grants={personGrants}
          base={personBase}
          colors={colors}
          compact={compact}
          canEdit={canEdit && !busy}
          onToggle={onToggleGrant}
          limit={limit}
        />
        {canEdit ? (
          <View style={styles.modeRow}>
            {onSave ? (
              <Pressable
                accessibilityRole="button"
                disabled={!dirty || busy}
                onPress={onSave}
                style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: !dirty || busy ? 0.5 : 1 }]}
              >
                <Text style={styles.primaryText}>Lagre avvik for personen</Text>
              </Pressable>
            ) : null}
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
  onOpenEmployee,
  layout = '',
  initialMovingId = '',
  initialDrawerId = '',
  initialSettingsId = '',
  initialMemberTab = '',
  initialPersonId = '',
  initialMode = 'levels',
  canEditLevels,
  actor = null,
}) {
  // Endre personer: canEdit. Endre selve nivåene: canEditLevels (Admin på Tilgangsstyring).
  const levelsEditable = canEditLevels === undefined ? canEdit : !!canEditLevels;
  const me = actor || { bypass: false, uid: '', grants: {} };
  const policyKey = JSON.stringify(company?.accessPolicy || {});
  const [policy, setPolicy] = useState(() => normalizeAccessPolicy(company?.accessPolicy));
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState(initialMode);
  const [query, setQuery] = useState('');
  const [levelDrafts, setLevelDrafts] = useState({});
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
  const levelWrites = useRef(new Map());
  const draftsRef = useRef({});
  employeesRef.current = employees;

  useEffect(() => {
    // Venter en autolagring, er det den lokale versjonen som gjelder.
    if (policyTimer.current) return;
    const next = normalizeAccessPolicy(company?.accessPolicy);
    policyRef.current = next;
    setPolicy(next);
    setDirty(false);
  }, [policyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLevelDrafts((current) => {
      const next = { ...current };
      let changed = false;
      for (const [id, draft] of Object.entries(current)) {
        const live = employees.find((row) => row.id === id);
        if (!live) continue;
        const same = employeeLevelIds(live).join('|') === employeeLevelIds(draft).join('|');
        if (same) {
          delete next[id];
          changed = true;
        }
      }
      if (changed) draftsRef.current = next;
      return changed ? next : current;
    });
  }, [employees]);

  const grouped = useMemo(() => groupEmployeesByLevel(employees), [employees]);

  const roster = useMemo(
    () => employees.map((row) => levelDrafts[row.id] || row),
    [employees, levelDrafts],
  );

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster
      .filter((row) => row?.company?.status !== 'deleted')
      .filter((row) => !q || displayName(row).toLowerCase().includes(q) || contactLine(row).toLowerCase().includes(q))
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'nb'));
  }, [roster, query]);

  const person = roster.find((row) => row.id === personId) || null;
  const personBase = person ? personBaseGrants(policy, person) : null;

  useEffect(() => {
    if (!person) {
      setPersonGrants(null);
      setPersonDirty(false);
      return;
    }
    const base = personBaseGrants(policy, person);
    setPersonGrants(applyOverrides(base, person.company?.accessOverrides));
    setPersonDirty(false);
  }, [personId, policyKey, person?.updatedAt]);

  async function savePolicy(nextPolicy = policy) {
    if (!levelsEditable || busy) return;
    setError('');
    setNote('');
    try {
      await onSavePolicy(compactPolicy(nextPolicy));
      if (policyRef.current === nextPolicy) setDirty(false);
      setNote('Nivåene er lagret.');
      showSaveToast('Nivåene er lagret.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke lagre tilgangen.');
    }
  }

  // Nivåmatrisen lagres fortløpende: kort pause etter siste klikk, så lagres alt samlet.
  const policyRef = useRef(policy);
  const policyTimer = useRef(null);
  function changePolicy(nextPolicy, message = '') {
    policyRef.current = nextPolicy;
    setPolicy(nextPolicy);
    setDirty(true);
    setNote(message);
    if (policyTimer.current) clearTimeout(policyTimer.current);
    policyTimer.current = setTimeout(() => {
      policyTimer.current = null;
      savePolicy(policyRef.current);
    }, 600);
  }
  useEffect(() => () => {
    // Forlater man siden før pausen er over, lagres det likevel.
    if (policyTimer.current) {
      clearTimeout(policyTimer.current);
      policyTimer.current = null;
      onSavePolicy?.(compactPolicy(policyRef.current)).catch?.(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Kan jeg endre denne personen i det hele tatt? (ikke meg selv, ikke noen over meg) */
  function personEditable(employee) {
    if (!canEdit || !employee) return false;
    return checkPersonChange({ actor: me, policy, before: employee, after: employee }).ok;
  }

  function personLock(employee) {
    if (!canEdit || !employee) return '';
    const res = checkPersonChange({ actor: me, policy, before: employee, after: employee });
    return res.ok ? '' : res.reason;
  }

  const allowLevel = (levelId) => canGrantLevel({ actor: me, policy, levelId });
  const limitFor = (grants) => (resourceId, action) => canSetGrant({ actor: me, resourceId, grant: action, current: grants?.[resourceId] || 'none' });

  async function savePerson(nextEmployee, success) {
    if (!canEdit || busy) return;
    setError('');
    setNote('');
    const before = employeesRef.current.find((row) => row.id === nextEmployee?.id) || null;
    const check = checkPersonChange({ actor: me, policy, before, after: nextEmployee });
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    try {
      await onSaveEmployee(nextEmployee);
      setPersonDirty(false);
      setNote(success);
      showSaveToast(success);
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

  function savePersonGrants(grantsNext = personGrants) {
    if (!person || !grantsNext || !personBase) return;
    const next = normalizeEmployee({
      ...person,
      company: {
        ...person.company,
        accessOverrides: compactOverrides(personBase, grantsNext),
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

  function openEmployee(employee) {
    if (!employee?.id) return;
    onOpenEmployee?.(employee);
  }

  function togglePersonLevel(employee, levelId, checked) {
    if (!canEdit || !employee?.id || !onSaveEmployee || accountDeactivated(employee)) return;
    const id = employee.id;
    const previous = levelWrites.current.get(id) || Promise.resolve();
    const job = previous.catch(() => {}).then(async () => {
      const current = draftsRef.current[id] || employeesRef.current.find((row) => row.id === id) || employee;
      const next = withToggledLevel(current, levelId, checked);
      const stored = employeesRef.current.find((row) => row.id === id) || current;
      const check = checkPersonChange({ actor: me, policy, before: stored, after: next });
      if (!check.ok) {
        setNote('');
        setError(check.reason);
        return;
      }
      const result = commitEmployee(next, { scope: 'company' });
      if (!result.ok) {
        setNote('');
        setError(result.errors.join('\n'));
        return;
      }
      draftsRef.current = { ...draftsRef.current, [id]: result.employee };
      setLevelDrafts(draftsRef.current);
      setError('');
      try {
        const saved = await onSaveEmployee(result.employee);
        const stored = saved?.id ? saved : result.employee;
        draftsRef.current = { ...draftsRef.current, [id]: stored };
        setLevelDrafts({ ...draftsRef.current });
        const levelNames = employeeLevelIds(stored).map((item) => levelById(item)?.label).filter(Boolean);
        const savedText = levelNames.length
          ? `${displayName(stored)} har ${levelNames.join(', ')}.`
          : `${displayName(stored)} har ingen tilgangsnivå.`;
        setNote(levelNames.length
          ? `${savedText} Rettighetene fra alle avhukede nivå gjelder.`
          : savedText);
        showSaveToast(savedText);
      } catch (err) {
        const copy = { ...draftsRef.current };
        delete copy[id];
        draftsRef.current = copy;
        setLevelDrafts(copy);
        setNote('');
        setError(err?.message || 'Kunne ikke lagre tilgangsnivået.');
      }
    });
    levelWrites.current.set(id, job);
  }

  return (
    <View nativeID="company-access-page" id="company-access-page" style={styles.page}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.title, styles.titleFlex, { color: colors.ink }]}>Tilgang</Text>
        {compact ? (
          <InfoButton title="Om tilgang">
            <AccessHelpCopy colors={colors} canEdit={canEdit} mode={mode} />
          </InfoButton>
        ) : null}
      </View>
      {compact ? null : ACCESS_LEADS.map((paragraph) => (
        <Text key={paragraph} style={[styles.lead, { color: colors.muted }]}>{paragraph}</Text>
      ))}
      {!canEdit && !compact ? (
        <Text style={[styles.lead, { color: colors.muted }]}>{ACCESS_VIEW_ONLY}</Text>
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
          {compact ? null : (
            <Text style={[styles.kind, { color: colors.muted }]}>{accessLevelsHint(canEdit)}</Text>
          )}
          {accessLevelSections().map((section) => (
            <View key={section.id} nativeID={`company-access-section-${section.id}`} style={styles.section}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>
                {accessSectionTitle(section.id, companyHeadingName(company))}
              </Text>
              {section.levels.map((row) => {
                const roster = [...(grouped.buckets[row.id] || [])].sort(byName);
                const parts = splitMembers(roster);
                const grants = levelGrants(policy, row.id);
                return (
                  <LevelDrawer
                    key={row.id}
                    nativeID={`company-access-level-${row.id}`}
                    title={`${row.order}. ${row.label}`}
                    meta={rosterMeta(parts.active.length, parts.inactive.length, kindLabel(row))}
                    members={roster}
                    colors={colors}
                    compact={compact}
                    canEdit={canEdit && !busy}
                    canEditSettings={levelsEditable && !busy}
                    canEditPerson={personEditable}
                    allowLevel={allowLevel}
                    limit={limitFor(grants)}
                    movingId={movingId}
                    excludeId={row.id}
                    open={!!openDrawers[row.id]}
                    dropKey={row.id}
                    hotDrop={drag?.drop || ''}
                    dragging={!!drag}
                    onOpen={openEmployee}
                    memberTab={memberTabs[row.id]}
                    onMemberTab={(tab) => {
                      setMemberTabs((current) => ({ ...current, [row.id]: tab }));
                      setMovingId('');
                    }}
                    settingsOpen={settingsId === row.id}
                    grants={grants}
                    custom={levelIsCustom(policy, row.id)}
                    summary={row.summary}
                    onToggleOpen={() => {
                      const expanded = !!openDrawers[row.id] || settingsId === row.id;
                      setOpenDrawers((current) => ({ ...current, [row.id]: !expanded }));
                      if (expanded && settingsId === row.id) setSettingsId('');
                    }}
                    onToggleSettings={() => setSettingsId((current) => (current === row.id ? '' : row.id))}
                    onToggleMove={(id) => setMovingId((current) => (current === id ? '' : id))}
                    onAssign={assignLevel}
                    onToggleGrant={(resourceId, action, on) => {
                      if (!levelsEditable) return;
                      const next = toggleGrant(grants[resourceId], action, on);
                      if (!canSetGrant({ actor: me, resourceId, grant: next, current: grants[resourceId] })) {
                        setError('Du kan ikke gi høyere tilgang enn du har selv.');
                        return;
                      }
                      setError('');
                      changePolicy(setLevelGrant(policyRef.current, row.id, resourceId, next));
                    }}
                    onSaveLevel={null}
                    onReset={() => {
                      if (!levelsEditable) return;
                      const next = resetLevel(policyRef.current, row.id);
                      const lifted = grantsAbove(levelGrants(next, row.id), me.bypass ? levelGrants(next, row.id) : (me.grants || {}));
                      if (lifted.length) {
                        setError('Standarden for nivået gir mer enn du har selv. Be eieren tilbakestille det.');
                        return;
                      }
                      changePolicy(next, 'Tilbakestilt til ProTop-standard.');
                    }}
                  />
                );
              })}
            </View>
          ))}
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
            canEditPerson={personEditable}
            allowLevel={allowLevel}
            movingId={movingId}
            excludeId=""
            suggestedId={movingId ? suggestedLevelId(grouped.unplaced.find((row) => row.id === movingId)) : ''}
            open={!!openDrawers.unplaced}
            dropKey="unplaced"
            hotDrop={drag?.drop || ''}
            dragging={!!drag}
            onOpen={openEmployee}
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

          {levelsEditable ? (
            <Text nativeID="company-access-save" style={[styles.kind, { color: colors.muted }]}>
              {dirty ? 'Lagrer endringene i nivåene …' : 'Endringer i nivåene lagres automatisk.'}
            </Text>
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
          {!people.length ? (
            <Text style={[styles.kind, { color: colors.muted }]}>Ingen ansatte matcher søket.</Text>
          ) : (
            <EmployeeDirectory
              rows={people}
              companyName={companyHeadingName(company)}
              colors={colors}
              variant="levels"
              canEditLevels={canEdit && !busy
                ? (row, levelId, turningOn) => personEditable(row) && (!turningOn || allowLevel(levelId))
                : false}
              onToggleLevel={togglePersonLevel}
              renderIdentity={(employee) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Åpne ${displayName(employee)}`}
                  onPress={() => openEmployee(employee)}
                  style={styles.memberRow}
                >
                  <AvatarFace employee={employee} colors={colors} active={employee.id === personId} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.personName, { color: colors.ink }]}>{displayName(employee)}</Text>
                    {!!contactLine(employee) && (
                      <Text style={[styles.kind, { color: colors.muted }]}>{contactLine(employee)}</Text>
                    )}
                    <Text style={[styles.kind, { color: colors.muted }]}>
                      {cardSubtitle(employee, companyHeadingName(company))}
                    </Text>
                    {accountDeactivated(employee) ? (
                      <Text style={{ color: colors.danger || '#b42318', fontSize: 12 }}>
                        Deaktivert. Ingen rettigheter.
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              )}
            />
          )}
          {compact ? null : (
            <Text style={[styles.kind, { color: colors.muted }]}>{ACCESS_PEOPLE_HINT}</Text>
          )}
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
        personGrants={personGrants}
        personBase={personBase}
        colors={colors}
        canEdit={canEdit && !busy && personEditable(person)}
        lockedReason={person ? personLock(person) : ''}
        limit={personGrants ? limitFor(personGrants) : null}
        busy={busy}
        dirty={personDirty}
        compact={compact}
        onClose={() => setPersonId('')}
        onToggleGrant={(resourceId, action, on) => {
          const next = toggleGrant(personGrants[resourceId], action, on);
          if (!canSetGrant({ actor: me, resourceId, grant: next, current: personGrants[resourceId] })) {
            setError('Du kan ikke gi høyere tilgang enn du har selv.');
            return;
          }
          const grantsNext = { ...personGrants, [resourceId]: next };
          setPersonGrants(grantsNext);
          setNote('');
          // Lagres med en gang – ingen egen lagreknapp.
          savePersonGrants(grantsNext);
        }}
        onSave={null}
        onClear={clearPersonGrants}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  denied: { flex: 1, padding: 24, gap: 8, maxWidth: 560 },
  page: { alignSelf: 'stretch', width: '100%', maxWidth: '100%', gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleFlex: { flex: 1 },
  helpCopy: { gap: 12 },
  stack: { gap: 10 },
  section: { gap: 10, width: '100%' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 8 },
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
  matrix: { width: '100%', gap: 8, paddingBottom: 4 },
  groupLabel: { fontSize: 15, fontWeight: '600' },
  matrixDrawer: { borderWidth: 1, borderRadius: 12, width: '100%', overflow: 'hidden' },
  matrixDrawerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, paddingVertical: 8 },
  matrixDrawerBody: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, width: '100%', minWidth: 0 },
  matrixHead: {
    display: 'grid',
    gridTemplateColumns: MATRIX_COLUMNS,
    alignItems: 'end',
    width: '100%',
    columnGap: 12,
    borderBottomWidth: 1,
    paddingBottom: 6,
  },
  areaHead: { fontSize: 12, minWidth: 0 },
  actionHead: { textAlign: 'center', fontSize: 13, lineHeight: 16, minWidth: 0 },
  matrixRow: {
    display: 'grid',
    gridTemplateColumns: MATRIX_COLUMNS,
    alignItems: 'center',
    width: '100%',
    columnGap: 12,
    borderBottomWidth: 1,
    minHeight: 52,
  },
  headingRow: { minHeight: 40 },
  areaCell: { minWidth: 0, paddingVertical: 8, paddingRight: 8 },
  areaChild: { paddingLeft: 26 },
  areaTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  areaIndent: { paddingLeft: 25 },
  areaModule: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  areaLabel: { fontSize: 14, flexShrink: 1 },
  areaHint: { fontSize: 12, marginTop: 2 },
  overrideMark: { fontSize: 12, marginTop: 2 },
  compactRow: { borderBottomWidth: 1, paddingVertical: 10, gap: 4 },
  compactChecks: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  compactCheck: { alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 96 },
  compactAction: { fontSize: 12, lineHeight: 15, marginBottom: 4, textAlign: 'center' },
  checkHit: { minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  levelActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  primaryBtn: { alignSelf: 'flex-start', borderRadius: 12, minHeight: 40, justifyContent: 'center', paddingHorizontal: 16 },
  primaryText: { color: '#fff', textAlign: 'center' },
  quietBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  person: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  personName: { fontSize: 15, fontWeight: '600' },
  drawer: { borderWidth: 1, borderRadius: 14, width: '100%', alignSelf: 'stretch', overflow: 'hidden' },
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 4,
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 4,
  },
  drawerToggle: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  drawerTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 160 },
  gearBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  drawerBody: { borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 12, gap: 10, width: '100%', minWidth: 0 },
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
