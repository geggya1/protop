import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours, parseHours } from '../../src/arbeid/hours.js';
import { TIME_TYPES } from '../../src/arbeid/overtime.js';

const QUICK = ['0:30', '1:00', '2:00', '4:00', '7:30', '8:00'];

function blankBlock(activities, seed) {
  return {
    key: seed?.id || `new-${Math.random().toString(36).slice(2, 7)}`,
    id: seed?.id || '',
    hours: formatHours(seed?.hours || 0),
    description: seed?.description || '',
    internalNote: seed?.internalNote || '',
    activityId: seed?.activityId || activities[0]?.id || '',
    timeType: seed?.timeType || 'ordinary',
    clockIn: seed?.clockIn || '',
    clockOut: seed?.clockOut || '',
  };
}

/**
 * Timeføring slik den er satt: timer, eksternt notat, aktivitet og meny
 * for notat, hurtigvalg, flytt, utlegg, produktsalg og bilgodtgjørelse.
 */
export default function TimeEntryModal({
  visible,
  colors,
  project,
  dateLabel,
  dateKey = '',
  activities = [],
  initial,
  entries,
  projects = [],
  requireDescription = true,
  requireClock = false,
  locked = false,
  onSave,
  onDelete,
  onClose,
  onMove,
  onAddExpense,
  onAddSale,
  onAddMileage,
}) {
  const [blocks, setBlocks] = useState([]);
  const [showInternal, setShowInternal] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showTimeType, setShowTimeType] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [moveDate, setMoveDate] = useState('');
  const [moveProjectId, setMoveProjectId] = useState('');
  const [activityOpen, setActivityOpen] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    const seeds = Array.isArray(entries) && entries.length
      ? entries
      : (initial ? [initial] : [{}]);
    setBlocks(seeds.map((row) => blankBlock(activities, row)));
    setShowInternal(seeds.some((row) => row?.internalNote));
    setShowQuick(false);
    setShowMenu(false);
    setShowTimeType(seeds.some((row) => row?.timeType && row.timeType !== 'ordinary'));
    setShowMove(false);
    setMoveDate(dateKey || '');
    setMoveProjectId(project?.id || '');
    setActivityOpen('');
    setError('');
  }, [visible, initial, entries, activities, dateKey, project?.id]);

  function patchBlock(key, patch) {
    setBlocks((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function submit() {
    if (locked) {
      setError('Dagen er låst og venter på kontroll.');
      return;
    }
    const payload = [];
    for (const block of blocks) {
      const value = parseHours(block.hours);
      if (value < 0) {
        setError('Timer kan ikke være negative.');
        return;
      }
      if (requireDescription && value > 0 && !block.description.trim()) {
        setError('Beskrivelse av utført arbeid er påkrevd.');
        return;
      }
      if (requireClock && value > 0 && (!block.clockIn.trim() || !block.clockOut.trim())) {
        setError('Kom- og gåtid må fylles ut.');
        return;
      }
      const activity = activities.find((row) => row.id === block.activityId);
      payload.push({
        id: block.id || undefined,
        hours: value,
        description: block.description.trim(),
        internalNote: block.internalNote.trim(),
        activityId: block.activityId,
        activityName: activity?.name || 'Hovedaktivitet',
        timeType: block.timeType,
        clockIn: block.clockIn.trim(),
        clockOut: block.clockOut.trim(),
      });
    }
    onSave?.(payload);
  }

  if (!visible) return null;
  const activityChoices = activities.length ? activities : [{ id: '', name: 'Hovedaktivitet' }];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation?.()} style={styles.wrap}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="time-entry-modal">
            <View style={styles.columnsHead}>
              <Text style={[styles.colTitle, { color: colors.ink, width: 88 }]}>Timer</Text>
              <Text style={[styles.colTitle, { color: colors.ink, flex: 1 }]}>Beskrivelse av utført arbeid</Text>
              <TouchableOpacity onPress={() => setShowMenu((value) => !value)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Flere valg" nativeID="time-entry-menu">
                <Ionicons name="settings-outline" size={18} color="#7c3aed" />
              </TouchableOpacity>
              {blocks.some((row) => row.id) ? (
                <TouchableOpacity
                  onPress={() => onDelete?.(blocks.filter((row) => row.id).map((row) => row.id))}
                  accessibilityRole="button"
                  accessibilityLabel="Slett"
                  style={{ marginLeft: 8 }}
                >
                  <Text style={{ color: '#7c3aed', fontWeight: '600' }}>Slett</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {showMenu ? (
              <View style={[styles.menu, { borderColor: colors.line, backgroundColor: '#fff' }]}>
                <MenuItem label="Vis internt notat" onPress={() => { setShowInternal(true); setShowMenu(false); }} colors={colors} />
                <MenuItem label={showQuick ? 'Skjul hurtigvalg for timer' : 'Vis hurtigvalg for timer'} onPress={() => { setShowQuick((value) => !value); setShowMenu(false); }} colors={colors} />
                <MenuItem label="Flytt til annen dag/prosjekt" icon="swap-horizontal" onPress={() => { setShowMove(true); setShowMenu(false); }} colors={colors} />
                <MenuItem label="Legg til utlegg" icon="add" onPress={() => { setShowMenu(false); onAddExpense?.(); }} colors={colors} />
                <MenuItem label="Legg til produktsalg" icon="add" onPress={() => { setShowMenu(false); onAddSale?.(); }} colors={colors} />
                <MenuItem label="Legg til bilgodtgjørelse" icon="add" onPress={() => { setShowMenu(false); onAddMileage?.(); }} colors={colors} />
                <MenuItem label="Timeart" onPress={() => { setShowTimeType(true); setShowMenu(false); }} colors={colors} />
              </View>
            ) : null}

            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              {blocks.map((block, index) => {
                const activityName = activityChoices.find((row) => (row.id || '') === (block.activityId || ''))?.name || 'Hovedaktivitet';
                return (
                  <View key={block.key} style={[styles.block, index > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 }]}>
                    <View style={styles.blockRow}>
                      <TextInput
                        value={block.hours}
                        onChangeText={(hours) => patchBlock(block.key, { hours })}
                        placeholder="0:00"
                        placeholderTextColor={colors.placeholder}
                        editable={!locked}
                        keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                        style={[styles.hours, { color: colors.ink, borderColor: colors.line }]}
                      />
                      <TextInput
                        value={block.description}
                        onChangeText={(description) => patchBlock(block.key, { description })}
                        placeholder="Eksternt notat - synlig for kunde"
                        placeholderTextColor={colors.placeholder}
                        editable={!locked}
                        multiline
                        style={[styles.area, { color: colors.ink, borderColor: colors.line, backgroundColor: '#f8f3df' }]}
                      />
                    </View>
                    {showQuick ? (
                      <View style={styles.quickRow}>
                        {QUICK.map((item) => (
                          <TouchableOpacity key={item} onPress={() => patchBlock(block.key, { hours: item })} style={[styles.quick, { borderColor: colors.line }]}>
                            <Text style={{ color: colors.ink, fontSize: 12 }}>{item}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                    {showInternal ? (
                      <TextInput
                        value={block.internalNote}
                        onChangeText={(internalNote) => patchBlock(block.key, { internalNote })}
                        placeholder="Internt notat — kun synlig internt"
                        placeholderTextColor={colors.placeholder}
                        editable={!locked}
                        multiline
                        style={[styles.area, { color: colors.ink, borderColor: colors.line, marginTop: 8 }]}
                      />
                    ) : null}
                    {requireClock ? (
                      <View style={styles.clockRow}>
                        <TextInput
                          value={block.clockIn}
                          onChangeText={(clockIn) => patchBlock(block.key, { clockIn })}
                          placeholder="Kom 08:00"
                          placeholderTextColor={colors.placeholder}
                          style={[styles.clock, { color: colors.ink, borderColor: colors.line }]}
                        />
                        <TextInput
                          value={block.clockOut}
                          onChangeText={(clockOut) => patchBlock(block.key, { clockOut })}
                          placeholder="Gå 16:00"
                          placeholderTextColor={colors.placeholder}
                          style={[styles.clock, { color: colors.ink, borderColor: colors.line }]}
                        />
                      </View>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => setActivityOpen((current) => (current === block.key ? '' : block.key))}
                      style={[styles.activity, { borderColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink, flex: 1 }}>{activityName}</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.muted} />
                    </TouchableOpacity>
                    {activityOpen === block.key ? (
                      <View style={[styles.activityList, { borderColor: colors.line }]}>
                        {activityChoices.map((row) => (
                          <TouchableOpacity key={row.id || 'main'} onPress={() => { patchBlock(block.key, { activityId: row.id || '' }); setActivityOpen(''); }} style={styles.activityItem}>
                            <Text style={{ color: colors.ink }}>{row.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                    {showTimeType ? (
                      <View style={styles.quickRow}>
                        {TIME_TYPES.map((row) => {
                          const on = row.id === block.timeType;
                          return (
                            <TouchableOpacity key={row.id} onPress={() => patchBlock(block.key, { timeType: row.id })} style={[styles.quick, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? `${colors.brand}18` : '#fff' }]}>
                              <Text style={{ color: colors.ink, fontSize: 12 }}>{row.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {showMove ? (
                <View style={[styles.move, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink, fontWeight: '600', marginBottom: 6 }}>Flytt til annen dag/prosjekt</Text>
                  <TextInput
                    value={moveDate}
                    onChangeText={setMoveDate}
                    placeholder="ÅÅÅÅ-MM-DD"
                    placeholderTextColor={colors.placeholder}
                    style={[styles.clock, { color: colors.ink, borderColor: colors.line, marginBottom: 8 }]}
                  />
                  <ScrollView style={{ maxHeight: 140 }}>
                    {projects.map((row) => (
                      <TouchableOpacity key={row.id} onPress={() => setMoveProjectId(row.id)} style={styles.activityItem}>
                        <Text style={{ color: row.id === moveProjectId ? colors.brand : colors.ink, fontWeight: row.id === moveProjectId ? '700' : '400' }}>
                          #{row.number} {row.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    onPress={() => onMove?.({
                      ids: blocks.map((row) => row.id).filter(Boolean),
                      date: moveDate,
                      projectId: moveProjectId,
                    })}
                    style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start', marginTop: 8 }]}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Flytt</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>

            {dateLabel ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>{dateLabel}</Text> : null}
            {project ? <Text style={{ color: colors.muted, fontSize: 12 }}>#{project.number} {project.name}</Text> : null}
            {locked ? <Text style={{ color: '#0f766e', marginTop: 6 }}>Låst — klar for fakturering.</Text> : null}
            {error ? <Text style={{ color: colors.danger || '#b42318', marginTop: 6 }}>{error}</Text> : null}

            <View style={styles.footer}>
              <TouchableOpacity
                onPress={() => setBlocks((current) => [...current, blankBlock(activities)])}
                disabled={locked}
                accessibilityRole="button"
              >
                <Text style={{ color: '#7c3aed', fontWeight: '600' }}>+ Legg til flere timer på prosjektet</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={onClose} style={[styles.btn, { borderWidth: 1, borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submit} disabled={locked} style={[styles.btn, { backgroundColor: colors.brand, opacity: locked ? 0.5 : 1 }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuItem({ label, onPress, colors, icon }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.menuItem} accessibilityRole="button">
      {icon ? <Ionicons name={icon} size={14} color={colors.ink} /> : <View style={{ width: 14 }} />}
      <Text style={{ color: colors.ink, fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  wrap: { width: '100%', maxWidth: 640 },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  columnsHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  colTitle: { fontSize: 14, fontWeight: '600' },
  block: { marginBottom: 8 },
  blockRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  hours: {
    width: 88,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  area: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 72,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  activity: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  activityList: { borderWidth: 1, borderRadius: 6, marginTop: 4 },
  activityItem: { paddingHorizontal: 10, paddingVertical: 8 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  quick: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#fff' },
  clockRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  clock: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: '#fff' },
  menu: {
    position: 'absolute',
    top: 36,
    right: 14,
    zIndex: 5,
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 260,
    paddingVertical: 4,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  move: { borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
});
