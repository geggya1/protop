import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator, Pressable, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  listenSubjects, listenBookLists, createBookListItem, deleteBookListItem, isClassroomAdmin,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

export default function ClassroomBooksScreen({ classroomId, classroom }) {
  const { uid } = useApp();
  const [staff, setStaff] = useState([]);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const [subjects, setSubjects] = useState([]);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', author: '', isbn: '', subjectId: '', purchaseUrl: '', notes: '', required: true,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const a = listenSubjects(classroomId, setSubjects);
    const b = listenBookLists(classroomId, (list) => { setBooks(list); setLoading(false); });
    const c = onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setStaff([]));
    return () => { a(); b(); c(); };
  }, [classroomId]);

  const bySubject = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s])), [subjects]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createBookListItem(classroomId, { ...form, createdBy: uid });
      setOpen(false);
      setForm({ title: '', author: '', isbn: '', subjectId: '', purchaseUrl: '', notes: '', required: true });
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre boken.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.lead}>
        Pensumliste — bøker som skal kjøpes eller brukes i fagene.
      </Text>
      {isAdmin && (
        <TouchableOpacity style={styles.cta} onPress={() => setOpen(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.ctaTxt}>Legg til bok</Text>
        </TouchableOpacity>
      )}
      {books.length === 0 ? (
        <Text style={styles.empty}>Ingen bøker på pensumlisten ennå.</Text>
      ) : books.map((b) => (
        <View key={b.id} style={styles.card}>
          <Text style={styles.meta}>
            {bySubject[b.subjectId]?.name || 'Fag'} · {b.required ? 'Obligatorisk' : 'Anbefalt'}
          </Text>
          <Text style={styles.title}>{b.title}</Text>
          {!!b.author && <Text style={styles.sub}>{b.author}</Text>}
          {!!b.isbn && <Text style={styles.sub}>ISBN {b.isbn}</Text>}
          {!!b.notes && <Text style={styles.notes}>{b.notes}</Text>}
          <View style={styles.row}>
            {!!b.purchaseUrl && (
              <TouchableOpacity onPress={() => Linking.openURL(b.purchaseUrl).catch(() => {})}>
                <Text style={styles.link}>Kjøp</Text>
              </TouchableOpacity>
            )}
            {isAdmin && (
              <TouchableOpacity onPress={() => deleteBookListItem(classroomId, b.id)}>
                <Text style={styles.del}>Slett</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ScrollView>
              <Text style={styles.sheetTitle}>Pensumbok</Text>
              <TextInput style={styles.input} value={form.title} onChangeText={(t) => setForm((f) => ({ ...f, title: t }))} placeholder="Tittel" />
              <TextInput style={styles.input} value={form.author} onChangeText={(t) => setForm((f) => ({ ...f, author: t }))} placeholder="Forfatter" />
              <TextInput style={styles.input} value={form.isbn} onChangeText={(t) => setForm((f) => ({ ...f, isbn: t }))} placeholder="ISBN" />
              <Text style={styles.label}>Fag</Text>
              <View style={styles.chips}>
                {subjects.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.chip, form.subjectId === s.id && styles.chipOn]}
                    onPress={() => setForm((f) => ({ ...f, subjectId: s.id }))}
                  >
                    <Text style={[styles.chipTxt, form.subjectId === s.id && styles.chipTxtOn]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.input} value={form.purchaseUrl} onChangeText={(t) => setForm((f) => ({ ...f, purchaseUrl: t }))} placeholder="Kjøpslenke (https://…)" autoCapitalize="none" />
              <TextInput style={styles.input} value={form.notes} onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))} placeholder="Notat" />
              <TouchableOpacity
                style={styles.pick}
                onPress={() => setForm((f) => ({ ...f, required: !f.required }))}
              >
                <Ionicons name={form.required ? 'checkbox' : 'square-outline'} size={20} color={c.brand} />
                <Text style={styles.pickTxt}>Obligatorisk</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={save} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Lagre</Text>}
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
  lead: { color: c.muted, fontWeight: '600', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.brand, borderRadius: 14, paddingVertical: 12, marginBottom: 14,
  },
  ctaTxt: { color: '#fff', fontWeight: '900' },
  empty: { color: c.muted, fontWeight: '600' },
  card: {
    backgroundColor: c.surface, borderRadius: 16, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  meta: { color: c.tint, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  title: { color: c.ink, fontWeight: '900', fontSize: 17, marginTop: 4 },
  sub: { color: c.muted, fontWeight: '600', marginTop: 2 },
  notes: { color: c.ink, fontWeight: '600', marginTop: 6 },
  row: { flexDirection: 'row', gap: 16, marginTop: 8 },
  link: { color: c.brand, fontWeight: '800' },
  del: { color: c.danger, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(26,39,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '88%',
  },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: c.ink, marginBottom: 12 },
  input: {
    backgroundColor: c.bg, borderRadius: 14, padding: 12, color: c.ink, fontWeight: '700',
    borderWidth: 1, borderColor: c.line, marginBottom: 8,
  },
  label: { color: c.ink, fontWeight: '800', fontSize: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: c.bg, borderWidth: 1, borderColor: c.line,
  },
  chipOn: { backgroundColor: c.brandSoft, borderColor: c.brand },
  chipTxt: { color: c.muted, fontWeight: '800', fontSize: 12 },
  chipTxtOn: { color: c.brand },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  pickTxt: { color: c.ink, fontWeight: '700' },
  save: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  saveTxt: { color: '#fff', fontWeight: '900' },
});
