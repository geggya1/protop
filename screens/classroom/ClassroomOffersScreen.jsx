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
  listenSubjects, listenLessonOffers, createLessonOffer, deleteLessonOffer,
  isClassroomAdmin, staffRoleLabel,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

export default function ClassroomOffersScreen({ classroomId, classroom }) {
  const { uid } = useApp();
  const [parents, setParents] = useState([]);
  const isAdmin = isClassroomAdmin(classroom, uid, parents);
  const [subjects, setSubjects] = useState([]);
  const [offers, setOffers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', subjectId: '', description: '', hoursPerWeek: '3', teacherUids: {} });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const unsubs = [
      listenSubjects(classroomId, setSubjects),
      listenLessonOffers(classroomId, (list) => { setOffers(list); setLoading(false); }),
      onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.active !== false && p.deleted !== true);
        setParents(all);
        setStaff(all.filter((p) => p.staffRole));
      }),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [classroomId]);

  const bySubject = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s])), [subjects]);
  const nameOf = (id) => staff.find((p) => (p.uid || p.id) === id)?.name || 'Lærer';

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createLessonOffer(classroomId, {
        ...form,
        teacherUids: Object.keys(form.teacherUids).filter((id) => form.teacherUids[id]),
        hoursPerWeek: Number(form.hoursPerWeek) || null,
        createdBy: uid,
      });
      setOpen(false);
      setForm({ title: '', subjectId: '', description: '', hoursPerWeek: '3', teacherUids: {} });
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre tilbud.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.lead}>
        Undervisningstilbud — hvilket fag, hvem som er ansvarlig lærer, og omfang.
      </Text>
      {isAdmin && (
        <TouchableOpacity style={styles.cta} onPress={() => setOpen(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.ctaTxt}>Nytt tilbud</Text>
        </TouchableOpacity>
      )}
      {offers.length === 0 ? (
        <Text style={styles.empty}>Ingen undervisningstilbud registrert.</Text>
      ) : offers.map((o) => (
        <View key={o.id} style={styles.card}>
          <Text style={styles.meta}>{bySubject[o.subjectId]?.name || 'Fag'}</Text>
          <Text style={styles.title}>{o.title}</Text>
          {!!o.description && <Text style={styles.desc}>{o.description}</Text>}
          <Text style={styles.sub}>
            {(o.teacherUids || []).map(nameOf).join(', ') || 'Ingen lærer satt'}
            {o.hoursPerWeek ? ` · ${o.hoursPerWeek} t/uke` : ''}
          </Text>
          {isAdmin && (
            <TouchableOpacity onPress={() => deleteLessonOffer(classroomId, o.id)}>
              <Text style={styles.del}>Slett</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ScrollView>
              <Text style={styles.sheetTitle}>Undervisningstilbud</Text>
              <TextInput style={styles.input} value={form.title} onChangeText={(t) => setForm((f) => ({ ...f, title: t }))} placeholder="Tittel" />
              <Text style={styles.label}>Fag</Text>
              <View style={styles.chips}>
                {subjects.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.chip, form.subjectId === s.id && styles.chipOn]}
                    onPress={() => setForm((f) => ({ ...f, subjectId: s.id, title: f.title || s.name }))}
                  >
                    <Text style={[styles.chipTxt, form.subjectId === s.id && styles.chipTxtOn]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Ansvarlig lærer</Text>
              {staff.map((p) => {
                const id = p.uid || p.id;
                const on = !!form.teacherUids[id];
                return (
                  <TouchableOpacity
                    key={id}
                    style={styles.pick}
                    onPress={() => setForm((f) => ({ ...f, teacherUids: { ...f.teacherUids, [id]: !on } }))}
                  >
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? c.brand : c.muted} />
                    <Text style={styles.pickTxt}>{p.name} · {staffRoleLabel(p.staffRole)}</Text>
                  </TouchableOpacity>
                );
              })}
              <Text style={styles.label}>Timer per uke</Text>
              <TextInput style={styles.input} value={form.hoursPerWeek} onChangeText={(t) => setForm((f) => ({ ...f, hoursPerWeek: t }))} keyboardType="numeric" />
              <Text style={styles.label}>Beskrivelse</Text>
              <TextInput
                style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                value={form.description}
                onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
                multiline
              />
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
  desc: { color: c.muted, fontWeight: '600', marginTop: 6, lineHeight: 20 },
  sub: { color: c.muted, fontWeight: '700', fontSize: 12, marginTop: 8 },
  del: { color: c.danger, fontWeight: '800', fontSize: 12, marginTop: 8 },
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
  label: { color: c.ink, fontWeight: '800', fontSize: 12, marginBottom: 6, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: c.bg, borderWidth: 1, borderColor: c.line,
  },
  chipOn: { backgroundColor: c.brandSoft, borderColor: c.brand },
  chipTxt: { color: c.muted, fontWeight: '800', fontSize: 12 },
  chipTxtOn: { color: c.brand },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  pickTxt: { color: c.ink, fontWeight: '700' },
  save: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12, marginBottom: 20 },
  saveTxt: { color: '#fff', fontWeight: '900' },
});
