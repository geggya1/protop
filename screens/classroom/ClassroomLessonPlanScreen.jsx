import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  listenSubjects, listenLessonPlans, createLessonPlan, deleteLessonPlan, isClassroomAdmin,
} from '../../src/utils/classroom';
import { dateKey, getISOWeek } from '../../src/utils/dates';
import { useApp } from '../../src/context/AppContext';

export default function ClassroomLessonPlanScreen({ classroomId, classroom }) {
  const { uid, activeProfile } = useApp();
  const [staff, setStaff] = useState([]);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const [subjects, setSubjects] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', subjectId: '', dateKey: dateKey(new Date()), objectives: '', description: '', resources: '',
  });
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const a = listenSubjects(classroomId, setSubjects);
    const b = listenLessonPlans(classroomId, (list) => {
      setPlans(list);
      setLoading(false);
    });
    const c = onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setStaff([]));
    return () => { a(); b(); c(); };
  }, [classroomId]);

  const bySubject = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s])),
    [subjects],
  );

  const shown = filter ? plans.filter((p) => p.subjectId === filter) : plans;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const iso = getISOWeek(new Date(form.dateKey));
      await createLessonPlan(classroomId, {
        ...form,
        objectives: String(form.objectives || '').split('\n').map((x) => x.trim()).filter(Boolean),
        weekNumber: iso.week,
        year: iso.year,
        teacherUid: uid,
        teacherName: activeProfile?.name || '',
        createdBy: uid,
      });
      setOpen(false);
      setForm({ title: '', subjectId: filter || '', dateKey: dateKey(new Date()), objectives: '', description: '', resources: '' });
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre planen.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.lead}>
        Undervisningsplan er et eget modul — knyttet til fag, økter og læringsmål. Timeplanen viser når; planen viser hva og hvorfor.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={styles.chips}>
          <TouchableOpacity style={[styles.chip, !filter && styles.chipOn]} onPress={() => setFilter('')}>
            <Text style={[styles.chipTxt, !filter && styles.chipTxtOn]}>Alle fag</Text>
          </TouchableOpacity>
          {subjects.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, filter === s.id && styles.chipOn]}
              onPress={() => setFilter(s.id)}
            >
              <Text style={[styles.chipTxt, filter === s.id && styles.chipTxtOn]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      {isAdmin && (
        <TouchableOpacity style={styles.cta} onPress={() => setOpen(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.ctaTxt}>Ny undervisningsplan</Text>
        </TouchableOpacity>
      )}
      {shown.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="clipboard-outline" size={36} color={c.muted} />
          <Text style={styles.emptyTitle}>Ingen planer ennå</Text>
          <Text style={styles.emptySub}>Legg inn mål og innhold for øktene i hvert fag.</Text>
        </View>
      ) : shown.map((p) => (
        <View key={p.id} style={styles.card}>
          <Text style={styles.meta}>
            {p.dateKey} · {bySubject[p.subjectId]?.name || 'Fag'}
            {p.weekNumber ? ` · uke ${p.weekNumber}` : ''}
          </Text>
          <Text style={styles.title}>{p.title}</Text>
          {(p.objectives || []).length > 0 && (
            <View style={{ marginTop: 8 }}>
              {(p.objectives || []).map((o, i) => (
                <Text key={i} style={styles.obj}>• {o}</Text>
              ))}
            </View>
          )}
          {!!p.description && <Text style={styles.bodyTxt}>{p.description}</Text>}
          {!!p.teacherName && <Text style={styles.teacher}>Ansvarlig: {p.teacherName}</Text>}
          {isAdmin && (
            <TouchableOpacity
              style={styles.del}
              onPress={() => deleteLessonPlan(classroomId, p.id).catch((e) => Alert.alert('Feil', e?.message))}
            >
              <Text style={styles.delTxt}>Slett</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Undervisningsplan</Text>
              <Text style={styles.label}>Tittel</Text>
              <TextInput style={styles.input} value={form.title} onChangeText={(t) => setForm((f) => ({ ...f, title: t }))} placeholder="Øktens tema" />
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
              <Text style={styles.label}>Dato (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={form.dateKey} onChangeText={(t) => setForm((f) => ({ ...f, dateKey: t }))} />
              <Text style={styles.label}>Læringsmål (ett per linje)</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={form.objectives}
                onChangeText={(t) => setForm((f) => ({ ...f, objectives: t }))}
                multiline
                placeholder={'Eleven kan…\nEleven viser…'}
              />
              <Text style={styles.label}>Innhold</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={form.description}
                onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
                multiline
              />
              <Text style={styles.label}>Ressurser</Text>
              <TextInput style={styles.input} value={form.resources} onChangeText={(t) => setForm((f) => ({ ...f, resources: t }))} />
              <TouchableOpacity style={styles.save} onPress={save} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Lagre plan</Text>}
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
  lead: { color: c.muted, fontWeight: '600', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.line,
  },
  chipOn: { backgroundColor: c.brandSoft, borderColor: c.brand },
  chipTxt: { color: c.muted, fontWeight: '800', fontSize: 12 },
  chipTxtOn: { color: c.brand },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.brand, borderRadius: 14, paddingVertical: 12, marginBottom: 14,
  },
  ctaTxt: { color: '#fff', fontWeight: '900' },
  empty: {
    alignItems: 'center', padding: 24, backgroundColor: c.surface,
    borderRadius: 16, borderWidth: 1, borderColor: c.line,
  },
  emptyTitle: { marginTop: 8, color: c.ink, fontWeight: '800', fontSize: 16 },
  emptySub: { marginTop: 6, color: c.muted, textAlign: 'center', fontWeight: '600' },
  card: {
    backgroundColor: c.surface, borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: c.line,
  },
  meta: { color: c.tint, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  title: { color: c.ink, fontWeight: '900', fontSize: 17, marginTop: 4 },
  obj: { color: c.ink, fontWeight: '600', fontSize: 13, lineHeight: 20 },
  bodyTxt: { color: c.muted, fontWeight: '600', marginTop: 8, lineHeight: 20 },
  teacher: { color: c.muted, fontWeight: '700', fontSize: 12, marginTop: 8 },
  del: { marginTop: 8, alignSelf: 'flex-start' },
  delTxt: { color: c.danger, fontWeight: '800', fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(26,39,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '90%',
  },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: c.ink, marginBottom: 8 },
  label: { color: c.ink, fontWeight: '800', fontSize: 12, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: c.bg, borderRadius: 14, padding: 12, color: c.ink, fontWeight: '700',
    borderWidth: 1, borderColor: c.line,
  },
  save: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16, marginBottom: 20 },
  saveTxt: { color: '#fff', fontWeight: '900' },
});
