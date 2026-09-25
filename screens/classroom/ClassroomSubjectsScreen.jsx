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
  listenSubjects, createSubject, updateSubject, archiveSubject, isClassroomAdmin,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

const COLORS = ['#2563eb', '#dc2626', '#7c3aed', '#0d9488', '#16a34a', '#ea580c', '#db2777', '#ca8a04', '#4f46e5', '#059669'];

export default function ClassroomSubjectsScreen({ classroomId, classroom }) {
  const { uid } = useApp();
  const [staff, setStaff] = useState([]);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const a = listenSubjects(classroomId, (list) => {
      setSubjects(list);
      setLoading(false);
    });
    const b = onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setStaff([]));
    return () => { a(); b(); };
  }, [classroomId]);

  const startNew = () => {
    setEditing(null);
    setName('');
    setColor(COLORS[subjects.length % COLORS.length]);
    setOpen(true);
  };

  const startEdit = (sub) => {
    setEditing(sub);
    setName(sub.name || '');
    setColor(sub.color || COLORS[0]);
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (editing) await updateSubject(classroomId, editing.id, { name: name.trim(), color });
      else await createSubject(classroomId, { name: name.trim(), color });
      setOpen(false);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre fag.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (sub) => {
    Alert.alert('Arkiver fag', `Skjul «${sub.name}» fra klassen?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Arkiver',
        style: 'destructive',
        onPress: () => archiveSubject(classroomId, sub.id).catch((e) => Alert.alert('Feil', e?.message)),
      },
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.lead}>
        Fag i klassen — norsk, matte, engelsk og det dere trenger. Brukes i timeplan, undervisningsplan og beskjeder.
      </Text>
      {isAdmin && (
        <TouchableOpacity style={styles.cta} onPress={startNew}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.ctaTxt}>Nytt fag</Text>
        </TouchableOpacity>
      )}
      {subjects.length === 0 ? (
        <Text style={styles.empty}>Ingen fag ennå. Legg til norsk, matematikk, engelsk…</Text>
      ) : subjects.map((sub) => (
        <TouchableOpacity key={sub.id} style={styles.row} onPress={() => isAdmin && startEdit(sub)}>
          <View style={[styles.swatch, { backgroundColor: sub.color || c.brand }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{sub.name}</Text>
            <Text style={styles.sub}>
              {(sub.teacherUids || []).length
                ? `${sub.teacherUids.length} ansvarlig lærer`
                : 'Ingen ansvarlig satt'}
            </Text>
          </View>
          {isAdmin && (
            <TouchableOpacity onPress={() => remove(sub)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={c.muted} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ))}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>{editing ? 'Endre fag' : 'Nytt fag'}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="F.eks. Norsk"
              placeholderTextColor={c.muted}
            />
            <Text style={styles.label}>Farge</Text>
            <View style={styles.colorRow}>
              {COLORS.map((col) => (
                <TouchableOpacity
                  key={col}
                  style={[styles.colorDot, { backgroundColor: col }, color === col && styles.colorOn]}
                  onPress={() => setColor(col)}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.save} onPress={save} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Lagre</Text>}
            </TouchableOpacity>
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
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  swatch: { width: 12, height: 36, borderRadius: 6 },
  name: { color: c.ink, fontWeight: '400', fontSize: 16 },
  sub: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(26,39,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
  },
  sheetTitle: { fontSize: 20, fontWeight: '400', color: c.ink, marginBottom: 12 },
  input: {
    backgroundColor: c.bg, borderRadius: 14, padding: 14, color: c.ink, fontWeight: '400',
    borderWidth: 1, borderColor: c.line, marginBottom: 12,
  },
  label: { color: c.ink, fontWeight: '400', fontSize: 12, marginBottom: 8 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorOn: { borderWidth: 3, borderColor: c.ink },
  save: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '400' },
});
