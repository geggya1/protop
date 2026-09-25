import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator, Pressable, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  listenSeatingPlans, createSeatingPlan, updateSeatingPlan, deleteSeatingPlan,
  regenerateSeatingPlan, addSeatingUnit, assignSeatingSlot,
  clearSeatingAssignments, countSeatingSlots, countAssignedSeats,
  SEATING_PRESETS, SEATING_UNIT_KINDS, seatingPresetMeta, seatingUnitMeta,
  isClassroomAdmin,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

const CELL_MIN = 52;

function slotLabel(slot, students) {
  if (slot?.studentId) {
    return students.find((s) => s.id === slot.studentId)?.name
      || slot.displayName
      || 'Elev';
  }
  const name = String(slot?.displayName || '').trim();
  return name || 'Ledig';
}

function UnitBlock({
  unit, cell, students, selected, onPressSlot, editMode,
}) {
  const meta = seatingUnitMeta(unit.kind);
  const isTeacher = unit.kind === 'teacher';
  const slots = unit.slots || [];
  const cols = Math.max(1, meta.w);
  const innerW = unit.w * cell - 10;
  const innerH = unit.h * cell - (unit.label ? 22 : 12);
  const slotW = Math.max(28, Math.floor(innerW / cols) - 2);
  const slotRows = Math.max(1, Math.ceil(slots.length / cols));
  const slotH = Math.max(22, Math.floor(innerH / slotRows) - 2);

  return (
    <View
      style={[
        styles.unit,
        {
          left: unit.col * cell,
          top: unit.row * cell,
          width: unit.w * cell - 4,
          height: unit.h * cell - 4,
        },
        isTeacher && styles.unitTeacher,
        selected && styles.unitSelected,
      ]}
    >
      {!!unit.label && (
        <Text style={[styles.unitLabel, isTeacher && styles.unitLabelTeacher]} numberOfLines={1}>
          {unit.label}
        </Text>
      )}
      {isTeacher ? (
        <View style={styles.teacherInner}>
          <Ionicons name="person" size={16} color={c.brand} />
          <Text style={styles.teacherTxt}>Lærer</Text>
        </View>
      ) : (
        <View style={styles.slotsGrid}>
          {slots.map((slot) => {
            const filled = !!(slot.studentId || String(slot.displayName || '').trim());
            return (
              <TouchableOpacity
                key={slot.id}
                style={[
                  styles.slot,
                  { width: slotW, height: slotH },
                  filled && styles.slotFilled,
                  editMode && styles.slotEditable,
                ]}
                onPress={() => onPressSlot(unit, slot)}
                disabled={!editMode && !filled}
                activeOpacity={0.75}
              >
                <Text
                  style={[styles.slotTxt, filled && styles.slotTxtFilled]}
                  numberOfLines={2}
                >
                  {slotLabel(slot, students)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function ClassroomSeatingScreen({ classroomId, classroom }) {
  const { uid } = useApp();
  const { width: winW } = useWindowDimensions();
  const [staff, setStaff] = useState([]);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const [plans, setPlans] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPreset, setNewPreset] = useState('pairs');
  const [newCols, setNewCols] = useState('8');
  const [newRows, setNewRows] = useState('5');

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null); // { unitId, slotId }
  const [assignName, setAssignName] = useState('');
  const [studentFilter, setStudentFilter] = useState('');

  // Layout tools
  const [layoutOpen, setLayoutOpen] = useState(false);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const unsubs = [
      listenSeatingPlans(classroomId, (list) => {
        setPlans(list);
        setLoading(false);
        setActiveId((cur) => {
          if (cur && list.some((p) => p.id === cur)) return cur;
          return list[0]?.id || null;
        });
      }),
      onSnapshot(collection(db, 'families', classroomId, 'children'), (snap) => {
        setStudents(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            .filter((s) => s.deleted !== true && s.active !== false)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb')),
        );
      }),
      onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
        setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, () => setStaff([])),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [classroomId]);

  const plan = useMemo(
    () => plans.find((p) => p.id === activeId) || null,
    [plans, activeId],
  );

  const cell = useMemo(() => {
    const cols = plan?.cols || 8;
    const usable = Math.max(280, winW - 48);
    return Math.max(CELL_MIN, Math.min(72, Math.floor(usable / cols)));
  }, [plan?.cols, winW]);

  const assignedIds = useMemo(() => {
    const set = new Set();
    (plan?.units || []).forEach((u) => {
      (u.slots || []).forEach((s) => { if (s.studentId) set.add(s.studentId); });
    });
    return set;
  }, [plan]);

  const filteredStudents = useMemo(() => {
    const q = studentFilter.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !(s.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [students, studentFilter]);

  const openCreate = () => {
    setNewName(`Sitteplan ${plans.length + 1}`);
    setNewPreset('pairs');
    const meta = seatingPresetMeta('pairs');
    setNewCols(String(meta.defaultCols));
    setNewRows(String(meta.defaultRows));
    setCreateOpen(true);
  };

  const onPickPreset = (id) => {
    setNewPreset(id);
    const meta = seatingPresetMeta(id);
    setNewCols(String(meta.defaultCols));
    setNewRows(String(meta.defaultRows));
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await createSeatingPlan(classroomId, {
        name: newName,
        preset: newPreset,
        cols: Number(newCols) || undefined,
        rows: Number(newRows) || undefined,
        createdBy: uid,
      });
      setActiveId(id);
      setEditMode(true);
      setCreateOpen(false);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke opprette sitteplan.');
    } finally {
      setBusy(false);
    }
  };

  const persist = async (nextPlan) => {
    if (!nextPlan?.id) return;
    const { id, ...rest } = nextPlan;
    await updateSeatingPlan(classroomId, id, {
      name: rest.name,
      preset: rest.preset,
      cols: rest.cols,
      rows: rest.rows,
      frontLabel: rest.frontLabel,
      units: rest.units,
    });
  };

  const onPressSlot = (unit, slot) => {
    if (!editMode || !isAdmin) return;
    setAssignTarget({ unitId: unit.id, slotId: slot.id });
    setAssignName(slot.displayName || '');
    setStudentFilter('');
    setAssignOpen(true);
  };

  const saveAssign = async ({ studentId = null, displayName = '' } = {}) => {
    if (!plan || !assignTarget || busy) return;
    setBusy(true);
    try {
      const next = assignSeatingSlot(plan, assignTarget.unitId, assignTarget.slotId, {
        studentId,
        displayName: studentId ? '' : displayName,
      });
      await persist({ ...next, id: plan.id });
      setAssignOpen(false);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre plass.');
    } finally {
      setBusy(false);
    }
  };

  const addUnit = async (kindId) => {
    if (!plan || busy) return;
    setBusy(true);
    try {
      const meta = seatingUnitMeta(kindId);
      const n = (plan.units || []).filter((u) => u.kind === kindId).length + 1;
      const next = addSeatingUnit(plan, kindId, meta.slots ? `${meta.label} ${n}` : meta.label);
      await persist({ ...next, id: plan.id });
    } catch (e) {
      Alert.alert('Plass', e?.message || 'Klarte ikke legge til.');
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = (presetId, keepAssignments) => {
    if (!plan) return;
    Alert.alert(
      'Bytt oppsett',
      keepAssignments
        ? 'Genererer nytt rom og prøver å beholde plasseringer.'
        : 'Genererer nytt rom. Navn på plasser slettes.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Bytt',
          style: keepAssignments ? 'default' : 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await regenerateSeatingPlan(classroomId, plan.id, {
                preset: presetId,
                cols: plan.cols,
                rows: plan.rows,
                keepAssignments,
                previous: plan,
              });
              setLayoutOpen(false);
            } catch (e) {
              Alert.alert('Feil', e?.message || 'Klarte ikke bytte oppsett.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const clearAll = () => {
    if (!plan) return;
    Alert.alert('Tøm plasser', 'Fjerner alle elevnavn fra sitteplanen.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Tøm',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const next = clearSeatingAssignments(plan);
            await persist({ ...next, id: plan.id });
          } catch (e) {
            Alert.alert('Feil', e?.message || 'Klarte ikke tømme.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const resizeRoom = async (deltaCols, deltaRows) => {
    if (!plan || busy) return;
    const cols = Math.max(4, Math.min(12, (plan.cols || 8) + deltaCols));
    const rows = Math.max(3, Math.min(10, (plan.rows || 6) + deltaRows));
    // Drop units that fall outside
    const units = (plan.units || []).filter((u) => u.col + u.w <= cols && u.row + u.h <= rows);
    setBusy(true);
    try {
      await persist({ ...plan, id: plan.id, cols, rows, units });
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke endre rom.');
    } finally {
      setBusy(false);
    }
  };

  const removeUnit = async (unitId) => {
    if (!plan || busy) return;
    setBusy(true);
    try {
      const units = (plan.units || []).filter((u) => u.id !== unitId);
      await persist({ ...plan, id: plan.id, units });
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke fjerne.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>
        Velg hvordan klasserommet ser ut: enkel pult, to og to, rekker, gruppebord eller bygg selv.
        Trykk på en plass for å sette elevnavn.
      </Text>

      {isAdmin && (
        <TouchableOpacity style={styles.cta} onPress={openCreate}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.ctaTxt}>Ny sitteplan</Text>
        </TouchableOpacity>
      )}

      {plans.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="grid-outline" size={36} color={c.muted} />
          <Text style={styles.emptyTitle}>Ingen sitteplan ennå</Text>
          <Text style={styles.empty}>
            Opprett en plan og velg form — eller start med tomt rom og legg til pult for pult.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.planRow}>
            {plans.map((p) => {
              const on = p.id === activeId;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.planChip, on && styles.planChipOn]}
                  onPress={() => { setActiveId(p.id); setEditMode(false); }}
                >
                  <Text style={[styles.planChipTxt, on && styles.planChipTxtOn]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[styles.planChipMeta, on && styles.planChipTxtOn]}>
                    {seatingPresetMeta(p.preset).label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {plan ? (
            <View style={styles.editor}>
              <View style={styles.editorHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planTitle}>{plan.name}</Text>
                  <Text style={styles.planMeta}>
                    {seatingPresetMeta(plan.preset).label}
                    {' · '}
                    {countAssignedSeats(plan)}/{countSeatingSlots(plan)} plassert
                    {' · '}
                    {plan.cols}×{plan.rows}
                  </Text>
                </View>
                {isAdmin && (
                  <TouchableOpacity
                    style={[styles.editToggle, editMode && styles.editToggleOn]}
                    onPress={() => setEditMode((v) => !v)}
                  >
                    <Ionicons
                      name={editMode ? 'checkmark' : 'create-outline'}
                      size={16}
                      color={editMode ? '#fff' : c.brand}
                    />
                    <Text style={[styles.editToggleTxt, editMode && { color: '#fff' }]}>
                      {editMode ? 'Ferdig' : 'Rediger'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {editMode && isAdmin && (
                <View style={styles.toolbar}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {SEATING_UNIT_KINDS.filter((k) => k.id !== 'teacher' || true).map((k) => (
                      <TouchableOpacity
                        key={k.id}
                        style={styles.toolBtn}
                        onPress={() => addUnit(k.id)}
                      >
                        <Ionicons name={k.icon} size={16} color={c.brand} />
                        <Text style={styles.toolTxt}>{k.label}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.toolBtn} onPress={() => setLayoutOpen(true)}>
                      <Ionicons name="options-outline" size={16} color={c.brand} />
                      <Text style={styles.toolTxt}>Bytt form</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.toolBtn} onPress={clearAll}>
                      <Ionicons name="backspace-outline" size={16} color={c.danger} />
                      <Text style={[styles.toolTxt, { color: c.danger }]}>Tøm navn</Text>
                    </TouchableOpacity>
                  </ScrollView>
                  <View style={styles.resizeRow}>
                    <Text style={styles.resizeLbl}>Rom</Text>
                    <TouchableOpacity style={styles.resizeBtn} onPress={() => resizeRoom(-1, 0)}>
                      <Text style={styles.resizeTxt}>− kol</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.resizeBtn} onPress={() => resizeRoom(1, 0)}>
                      <Text style={styles.resizeTxt}>+ kol</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.resizeBtn} onPress={() => resizeRoom(0, -1)}>
                      <Text style={styles.resizeTxt}>− rad</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.resizeBtn} onPress={() => resizeRoom(0, 1)}>
                      <Text style={styles.resizeTxt}>+ rad</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.frontBar}>
                <Text style={styles.frontTxt}>{plan.frontLabel || 'Tavle'}</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View
                  style={[
                    styles.room,
                    {
                      width: (plan.cols || 8) * cell,
                      height: (plan.rows || 6) * cell,
                    },
                  ]}
                >
                  {Array.from({ length: plan.rows || 6 }).map((_, row) => (
                    Array.from({ length: plan.cols || 8 }).map((__, col) => (
                      <View
                        key={`${row}-${col}`}
                        style={[
                          styles.gridCell,
                          {
                            left: col * cell,
                            top: row * cell,
                            width: cell,
                            height: cell,
                          },
                        ]}
                      />
                    ))
                  ))}
                  {(plan.units || []).map((unit) => (
                    <Pressable
                      key={unit.id}
                      onLongPress={() => {
                        if (!editMode || !isAdmin) return;
                        Alert.alert(unit.label || seatingUnitMeta(unit.kind).label, undefined, [
                          { text: 'Avbryt', style: 'cancel' },
                          {
                            text: 'Fjern pult',
                            style: 'destructive',
                            onPress: () => removeUnit(unit.id),
                          },
                        ]);
                      }}
                    >
                      <UnitBlock
                        unit={unit}
                        cell={cell}
                        students={students}
                        editMode={editMode && isAdmin}
                        onPressSlot={onPressSlot}
                      />
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              {isAdmin && (
                <TouchableOpacity
                  style={styles.deletePlan}
                  onPress={() => {
                    Alert.alert('Slett sitteplan', plan.name, [
                      { text: 'Avbryt', style: 'cancel' },
                      {
                        text: 'Slett',
                        style: 'destructive',
                        onPress: () => deleteSeatingPlan(classroomId, plan.id),
                      },
                    ]);
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color={c.danger} />
                  <Text style={styles.deletePlanTxt}>Slett denne sitteplanen</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </>
      )}

      {/* Opprett */}
      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Ny sitteplan</Text>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Navn (f.eks. Uke 12)"
                placeholderTextColor={c.muted}
              />
              <Text style={styles.label}>Hvordan skal rommet se ut?</Text>
              {SEATING_PRESETS.map((p) => {
                const on = newPreset === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.presetCard, on && styles.presetCardOn]}
                    onPress={() => onPickPreset(p.id)}
                  >
                    <Ionicons name={p.icon} size={22} color={on ? c.brand : c.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.presetName, on && { color: c.brand }]}>{p.label}</Text>
                      <Text style={styles.presetDesc}>{p.description}</Text>
                    </View>
                    <Ionicons
                      name={on ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={on ? c.brand : c.muted}
                    />
                  </TouchableOpacity>
                );
              })}
              <Text style={styles.label}>Romstørrelse (kolonner × rader)</Text>
              <View style={styles.sizeRow}>
                <TextInput
                  style={[styles.input, styles.sizeInput]}
                  value={newCols}
                  onChangeText={setNewCols}
                  keyboardType="number-pad"
                  placeholder="Kol"
                />
                <Text style={styles.sizeX}>×</Text>
                <TextInput
                  style={[styles.input, styles.sizeInput]}
                  value={newRows}
                  onChangeText={setNewRows}
                  keyboardType="number-pad"
                  placeholder="Rad"
                />
              </View>
              <TouchableOpacity style={styles.save} onPress={create} disabled={busy}>
                {busy
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveTxt}>Opprett sitteplan</Text>}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Tildel elev */}
      <Modal visible={assignOpen} transparent animationType="fade" onRequestClose={() => setAssignOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAssignOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Sett elev på plass</Text>
              <Text style={styles.label}>Skriv navn (fritekst)</Text>
              <TextInput
                style={styles.input}
                value={assignName}
                onChangeText={setAssignName}
                placeholder="F.eks. Kari Nordmann"
                placeholderTextColor={c.muted}
              />
              <TouchableOpacity
                style={styles.save}
                onPress={() => saveAssign({ displayName: assignName })}
                disabled={busy || !assignName.trim()}
              >
                <Text style={styles.saveTxt}>Bruk dette navnet</Text>
              </TouchableOpacity>
              <Text style={styles.label}>Eller velg elev fra klassen</Text>
              <TextInput
                style={styles.input}
                value={studentFilter}
                onChangeText={setStudentFilter}
                placeholder="Søk elev…"
                placeholderTextColor={c.muted}
              />
              {filteredStudents.length === 0 ? (
                <Text style={styles.empty}>Ingen elever å velge.</Text>
              ) : filteredStudents.map((s) => {
                const taken = assignedIds.has(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.pick, taken && styles.pickTaken]}
                    onPress={() => saveAssign({ studentId: s.id, displayName: s.name })}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarTxt}>{(s.name || '?').slice(0, 1)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickTxt}>{s.name}</Text>
                      {taken ? <Text style={styles.takenTxt}>Allerede plassert</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={c.muted} />
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.clearSlot}
                onPress={() => saveAssign({ studentId: null, displayName: '' })}
              >
                <Text style={styles.clearSlotTxt}>Fjern fra plass</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bytt form */}
      <Modal visible={layoutOpen} transparent animationType="fade" onRequestClose={() => setLayoutOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setLayoutOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ScrollView>
              <Text style={styles.sheetTitle}>Bytt sitteform</Text>
              <Text style={styles.lead}>
                Velg nytt fysisk oppsett. Du kan beholde navnene eller starte på nytt.
              </Text>
              {SEATING_PRESETS.map((p) => (
                <View key={p.id} style={styles.presetCard}>
                  <Ionicons name={p.icon} size={22} color={c.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.presetName}>{p.label}</Text>
                    <Text style={styles.presetDesc}>{p.description}</Text>
                    <View style={styles.presetActions}>
                      <TouchableOpacity
                        style={styles.smallBtn}
                        onPress={() => applyPreset(p.id, true)}
                      >
                        <Text style={styles.smallBtnTxt}>Bytt + behold</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallBtn, styles.smallBtnGhost]}
                        onPress={() => applyPreset(p.id, false)}
                      >
                        <Text style={[styles.smallBtnTxt, { color: c.ink }]}>Bytt tom</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lead: { color: c.muted, fontWeight: '400', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.brand, borderRadius: 14, paddingVertical: 12, marginBottom: 14,
  },
  ctaTxt: { color: '#fff', fontWeight: '400' },
  emptyBox: {
    alignItems: 'center', padding: 28, backgroundColor: c.surface, borderRadius: 16,
    borderWidth: 1, borderColor: c.line, gap: 8,
  },
  emptyTitle: { color: c.ink, fontWeight: '400', fontSize: 16 },
  empty: { color: c.muted, fontWeight: '400', textAlign: 'center', lineHeight: 18 },
  planRow: { marginBottom: 12, maxHeight: 72 },
  planChip: {
    backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    marginRight: 8, borderWidth: 1, borderColor: c.line, minWidth: 120,
  },
  planChipOn: { backgroundColor: c.brandSoft, borderColor: c.brand },
  planChipTxt: { color: c.ink, fontWeight: '400', fontSize: 14 },
  planChipTxtOn: { color: c.brand },
  planChipMeta: { color: c.muted, fontWeight: '400', fontSize: 11, marginTop: 2 },
  editor: {
    backgroundColor: c.surface, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: c.line,
  },
  editorHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  planTitle: { color: c.ink, fontWeight: '400', fontSize: 18 },
  planMeta: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  editToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: c.brand, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
  },
  editToggleOn: { backgroundColor: c.brand, borderColor: c.brand },
  editToggleTxt: { color: c.brand, fontWeight: '400', fontSize: 12 },
  toolbar: { marginBottom: 10, gap: 8 },
  toolBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.brandSoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
    marginRight: 8,
  },
  toolTxt: { color: c.brand, fontWeight: '400', fontSize: 12 },
  resizeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  resizeLbl: { color: c.muted, fontWeight: '400', fontSize: 12, marginRight: 4 },
  resizeBtn: {
    alignSelf: 'flex-start',
    backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: c.line,
  },
  resizeTxt: { color: c.ink, fontWeight: '400', fontSize: 12 },
  frontBar: {
    backgroundColor: c.stripe, borderRadius: 10, paddingVertical: 8, alignItems: 'center',
    marginBottom: 8,
  },
  frontTxt: { color: '#fff', fontWeight: '400', letterSpacing: 1, fontSize: 12 },
  room: {
    backgroundColor: c.bg, borderRadius: 12, borderWidth: 1, borderColor: c.line,
    position: 'relative', overflow: 'hidden', marginBottom: 8,
  },
  gridCell: {
    position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(67,56,202,0.12)',
  },
  unit: {
    position: 'absolute', backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1.5, borderColor: c.line, padding: 3, overflow: 'hidden',
  },
  unitTeacher: { backgroundColor: c.brandSoft, borderColor: c.brand },
  unitSelected: { borderColor: c.brand, borderWidth: 2 },
  unitLabel: {
    position: 'absolute', top: 2, left: 4, right: 4, zIndex: 2,
    color: c.muted, fontWeight: '400', fontSize: 9,
  },
  unitLabelTeacher: { color: c.brand },
  teacherInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  teacherTxt: { color: c.brand, fontWeight: '400', fontSize: 11 },
  slotsGrid: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2,
    marginTop: 12, alignContent: 'flex-start', justifyContent: 'center',
  },
  slot: {
    backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 4,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent',
  },
  slotFilled: { backgroundColor: c.brandSoft, borderColor: c.line },
  slotEditable: { borderStyle: 'dashed', borderColor: c.line },
  slotTxt: { color: c.muted, fontWeight: '400', fontSize: 10, textAlign: 'center' },
  slotTxtFilled: { color: c.ink },
  deletePlan: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, marginTop: 4,
  },
  deletePlanTxt: { color: c.danger, fontWeight: '400', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(26,39,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '90%',
  },
  sheetTitle: { fontSize: 20, fontWeight: '400', color: c.ink, marginBottom: 12 },
  input: {
    backgroundColor: c.bg, borderRadius: 14, padding: 14, color: c.ink, fontWeight: '400',
    borderWidth: 1, borderColor: c.line, marginBottom: 12,
  },
  label: { color: c.ink, fontWeight: '400', fontSize: 12, marginBottom: 8 },
  presetCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: c.bg, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  presetCardOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  presetName: { color: c.ink, fontWeight: '400', fontSize: 15 },
  presetDesc: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 2, lineHeight: 16 },
  presetActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  smallBtn: {
    alignSelf: 'flex-start',
    backgroundColor: c.brand, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  smallBtnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: c.line },
  smallBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 12 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sizeInput: { flex: 1, marginBottom: 0, textAlign: 'center' },
  sizeX: { color: c.muted, fontWeight: '400', fontSize: 16 },
  save: {
    backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 8, marginBottom: 16,
  },
  saveTxt: { color: '#fff', fontWeight: '400' },
  pick: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
  },
  pickTaken: { opacity: 0.55 },
  pickTxt: { color: c.ink, fontWeight: '400' },
  takenTxt: { color: c.muted, fontWeight: '400', fontSize: 11 },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: c.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { color: c.brand, fontWeight: '400' },
  clearSlot: { alignItems: 'center', paddingVertical: 16, marginBottom: 12 },
  clearSlotTxt: { color: c.danger, fontWeight: '400' },
});
