import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  listenClassGroups, createClassGroup, updateClassGroup, deleteClassGroup, isClassroomAdmin,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

const COLORS = ['#4338ca', '#2563eb', '#dc2626', '#16a34a', '#ea580c', '#db2777', '#0d9488'];

export default function ClassroomGroupsScreen({ classroomId, classroom }) {
  const { uid } = useApp();
  const [staff, setStaff] = useState([]);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const a = listenClassGroups(classroomId, setGroups);
    const b = onSnapshot(collection(db, 'families', classroomId, 'children'), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.deleted !== true && s.active !== false));
      setLoading(false);
    }, () => { setStudents([]); setLoading(false); });
    const c = onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setStaff([]));
    return () => { a(); b(); c(); };
  }, [classroomId]);

  const startNew = () => {
    setEditing(null);
    setName(`Gruppe ${groups.length + 1}`);
    setColor(COLORS[groups.length % COLORS.length]);
    setPicked({});
    setOpen(true);
  };

  const startEdit = (g) => {
    setEditing(g);
    setName(g.name || '');
    setColor(g.color || COLORS[0]);
    setPicked(Object.fromEntries((g.studentIds || []).map((id) => [id, true])));
    setOpen(true);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const studentIds = Object.keys(picked).filter((id) => picked[id]);
      if (editing) await updateClassGroup(classroomId, editing.id, { name: name.trim(), color, studentIds });
      else await createClassGroup(classroomId, { name: name.trim(), color, studentIds, createdBy: uid });
      setOpen(false);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre gruppen.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  const nameOf = (id) => students.find((s) => s.id === id)?.name || 'Elev';

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.lead}>
        Sett elever i grupper — gruppe 1, gruppe 2, eller egne navn. Brukes i timeplan og arbeid.
      </Text>
      {isAdmin && (
        <TouchableOpacity style={styles.cta} onPress={startNew}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.ctaTxt}>Ny gruppe</Text>
        </TouchableOpacity>
      )}
      {groups.length === 0 ? (
        <Text style={styles.empty}>Ingen grupper ennå.</Text>
      ) : groups.map((g) => (
        <TouchableOpacity key={g.id} style={styles.card} onPress={() => isAdmin && startEdit(g)}>
          <View style={[styles.dot, { backgroundColor: g.color || c.brand }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{g.name}</Text>
            <Text style={styles.sub} numberOfLines={2}>
              {(g.studentIds || []).length
                ? (g.studentIds || []).map(nameOf).join(', ')
                : 'Ingen elever valgt'}
            </Text>
          </View>
          {isAdmin && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert('Slett gruppe', g.name, [
                  { text: 'Avbryt', style: 'cancel' },
                  { text: 'Slett', style: 'destructive', onPress: () => deleteClassGroup(classroomId, g.id) },
                ]);
              }}
            >
              <Ionicons name="trash-outline" size={18} color={c.muted} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ))}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ScrollView>
              <Text style={styles.sheetTitle}>{editing ? 'Endre gruppe' : 'Ny gruppe'}</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Gruppenavn" />
              <View style={styles.colorRow}>
                {COLORS.map((col) => (
                  <TouchableOpacity
                    key={col}
                    style={[styles.colorDot, { backgroundColor: col }, color === col && styles.colorOn]}
                    onPress={() => setColor(col)}
                  />
                ))}
              </View>
              <Text style={styles.label}>Elever</Text>
              {students.length === 0 ? (
                <Text style={styles.empty}>Legg til elever først.</Text>
              ) : students.map((s) => {
                const on = !!picked[s.id];
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.pick, on && styles.pickOn]}
                    onPress={() => setPicked((p) => ({ ...p, [s.id]: !p[s.id] }))}
                  >
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? c.brand : c.muted} />
                    <Text style={styles.pickTxt}>{s.name}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.save} onPress={save} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Lagre gruppe</Text>}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lead: { color: c.muted, fontWeight: '400', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.brand, borderRadius: 14, paddingVertical: 12, marginBottom: 14,
  },
  ctaTxt: { color: '#fff', fontWeight: '400' },
  empty: { color: c.muted, fontWeight: '400' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  dot: { width: 12, height: 36, borderRadius: 6 },
  name: { color: c.ink, fontWeight: '400', fontSize: 16 },
  sub: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(26,39,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '88%',
  },
  sheetTitle: { fontSize: 20, fontWeight: '400', color: c.ink, marginBottom: 12 },
  input: {
    backgroundColor: c.bg, borderRadius: 14, padding: 14, color: c.ink, fontWeight: '400',
    borderWidth: 1, borderColor: c.line, marginBottom: 12,
  },
  colorRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorOn: { borderWidth: 3, borderColor: c.ink },
  label: { color: c.ink, fontWeight: '400', fontSize: 12, marginBottom: 8 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  pickOn: {},
  pickTxt: { color: c.ink, fontWeight: '400' },
  save: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12, marginBottom: 20 },
  saveTxt: { color: '#fff', fontWeight: '400' },
});
