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
  listenSubjects, listenTimetableSlots, createTimetableSlot, deleteTimetableSlot,
  expandTimetableSlots, weekRangeKeys, monthRangeKeys, yearRangeKeys, WEEKDAYS,
  isClassroomAdmin,
} from '../../src/utils/classroom';
import { addDays, dateKey, parseDateKey } from '../../src/utils/dates';
import { useApp } from '../../src/context/AppContext';

const KINDS = [
  { id: 'subject', label: 'Fag' },
  { id: 'lunch', label: 'Lunsj' },
  { id: 'break', label: 'Pause' },
];

function formatMonth(d) {
  return d.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
}

export default function ClassroomTimetableScreen({ classroomId, classroom }) {
  const { uid } = useApp();
  const [staff, setStaff] = useState([]);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const [mode, setMode] = useState('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [subjects, setSubjects] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    weekday: 1,
    startTime: '08:00',
    endTime: '12:00',
    kind: 'subject',
    subjectId: '',
    title: '',
    location: '',
    fromDate: dateKey(new Date()),
    toDate: dateKey(new Date(new Date().getFullYear(), 11, 20)),
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const a = listenSubjects(classroomId, setSubjects);
    const b = listenTimetableSlots(classroomId, (list) => {
      setSlots(list);
      setLoading(false);
    });
    const c = onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setStaff([]));
    return () => { a(); b(); c(); };
  }, [classroomId]);

  const range = useMemo(() => {
    if (mode === 'month') return monthRangeKeys(anchor);
    if (mode === 'year') return yearRangeKeys(anchor.getFullYear());
    return weekRangeKeys(anchor);
  }, [mode, anchor]);

  const occurrences = useMemo(
    () => expandTimetableSlots(slots, range.start, range.end),
    [slots, range.start, range.end],
  );

  const bySubject = useMemo(
    () => Object.fromEntries(subjects.map((s) => [s.id, s])),
    [subjects],
  );

  const shift = (dir) => {
    const d = new Date(anchor);
    if (mode === 'week') d.setDate(d.getDate() + dir * 7);
    else if (mode === 'month') d.setMonth(d.getMonth() + dir);
    else d.setFullYear(d.getFullYear() + dir);
    setAnchor(d);
  };

  const heading = (() => {
    if (mode === 'week') {
      const { iso } = weekRangeKeys(anchor);
      return `Uke ${iso.week} · ${iso.year}`;
    }
    if (mode === 'month') return formatMonth(anchor);
    return String(anchor.getFullYear());
  })();

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createTimetableSlot(classroomId, {
        ...form,
        subjectId: form.kind === 'subject' ? (form.subjectId || null) : null,
        title: form.kind === 'lunch' ? (form.title || 'Lunsj') : form.title,
        createdBy: uid,
      });
      setOpen(false);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre.');
    } finally {
      setBusy(false);
    }
  };

  const addStandardWeek = async () => {
    if (!isAdmin) return;
    const fromDate = form.fromDate;
    const toDate = form.toDate;
    const morning = subjects[0];
    const afternoon = subjects[1] || subjects[0];
    setBusy(true);
    try {
      for (const day of WEEKDAYS) {
        await createTimetableSlot(classroomId, {
          weekday: day.id, startTime: '08:00', endTime: '12:00', kind: 'subject',
          subjectId: morning?.id || null, title: morning?.name || 'Formiddag',
          fromDate, toDate, repeatsWeekly: true, createdBy: uid,
        });
        await createTimetableSlot(classroomId, {
          weekday: day.id, startTime: '12:00', endTime: '13:00', kind: 'lunch',
          title: 'Lunsj', fromDate, toDate, repeatsWeekly: true, createdBy: uid,
        });
        await createTimetableSlot(classroomId, {
          weekday: day.id, startTime: '13:00', endTime: '15:00', kind: 'subject',
          subjectId: afternoon?.id || null, title: afternoon?.name || 'Ettermiddag',
          fromDate, toDate, repeatsWeekly: true, createdBy: uid,
        });
      }
      Alert.alert('Timeplan lagt inn', 'Standard uke (8–12 fag, 12–13 lunsj, 13–15 fag) gjentas til semesterslutt. Du kan justere hver økt.');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke opprette mal.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;
  }

  const daysToShow = mode === 'year'
    ? null
    : (() => {
      const start = parseDateKey(range.start);
      const end = parseDateKey(range.end);
      const n = Math.round((end - start) / 86400000);
      return Array.from({ length: n + 1 }, (_, i) => dateKey(addDays(start, i)));
    })();

  const yearByMonth = mode === 'year'
    ? Array.from({ length: 12 }, (_, m) => {
      const start = `${range.year}-${String(m + 1).padStart(2, '0')}-01`;
      const last = dateKey(new Date(range.year, m + 1, 0));
      const occ = occurrences.filter((o) => o.dateKey >= start && o.dateKey <= last);
      return { month: m, label: new Date(range.year, m, 1).toLocaleDateString('nb-NO', { month: 'long' }), count: occ.length };
    })
    : [];

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navBtn} onPress={() => shift(-1)}>
          <Ionicons name="chevron-back" size={20} color={c.ink} />
        </TouchableOpacity>
        <Text style={styles.heading}>{heading}</Text>
        <TouchableOpacity style={styles.navBtn} onPress={() => shift(1)}>
          <Ionicons name="chevron-forward" size={20} color={c.ink} />
        </TouchableOpacity>
      </View>
      <View style={styles.modeRow}>
        {['week', 'month', 'year'].map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.modeChip, mode === m && styles.modeOn]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.modeTxt, mode === m && styles.modeTxtOn]}>
              {m === 'week' ? 'Uke' : m === 'month' ? 'Måned' : 'År'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.lead}>
        Timeplanen kan gjentas hver uke fra en startdato til og med semesterslutt. Bla fremover for å se hele året.
      </Text>

      {isAdmin && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.cta} onPress={() => setOpen(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.ctaTxt}>Ny økt</Text>
          </TouchableOpacity>
          {slots.length === 0 && (
            <TouchableOpacity style={styles.ghost} onPress={addStandardWeek} disabled={busy}>
              <Text style={styles.ghostTxt}>Standard uke</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {mode === 'year' ? (
        yearByMonth.map((m) => (
          <TouchableOpacity
            key={m.month}
            style={styles.monthRow}
            onPress={() => {
              setAnchor(new Date(range.year, m.month, 1));
              setMode('month');
            }}
          >
            <Text style={styles.monthName}>{m.label}</Text>
            <Text style={styles.monthCount}>{m.count} økter</Text>
            <Ionicons name="chevron-forward" size={16} color={c.muted} />
          </TouchableOpacity>
        ))
      ) : daysToShow.map((key) => {
        const dayOcc = occurrences.filter((o) => o.dateKey === key);
        const d = parseDateKey(key);
        const wd = WEEKDAYS.find((w) => w.id === (d.getDay() === 0 ? 7 : d.getDay()));
        if (mode === 'week' && !wd) return null;
        return (
          <View key={key} style={styles.dayBlock}>
            <Text style={styles.dayLabel}>
              {wd ? wd.label : d.toLocaleDateString('nb-NO', { weekday: 'long' })} {d.getDate()}.{d.getMonth() + 1}
            </Text>
            {dayOcc.length === 0 ? (
              <Text style={styles.emptyTiny}>—</Text>
            ) : dayOcc.map((slot) => {
              const sub = bySubject[slot.subjectId];
              return (
                <View key={slot.occurrenceId} style={styles.slot}>
                  <View style={[styles.bar, { backgroundColor: sub?.color || (slot.kind === 'lunch' ? '#f59e0b' : c.brand) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.slotTitle}>
                      {slot.title || sub?.name || (slot.kind === 'lunch' ? 'Lunsj' : 'Økt')}
                    </Text>
                    <Text style={styles.slotMeta}>
                      {slot.startTime}–{slot.endTime}
                      {slot.location ? ` · ${slot.location}` : ''}
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert('Slett økt', 'Fjerner den gjentakende økten fra timeplanen.', [
                          { text: 'Avbryt', style: 'cancel' },
                          {
                            text: 'Slett',
                            style: 'destructive',
                            onPress: () => deleteTimetableSlot(classroomId, slot.id).catch((e) => Alert.alert('Feil', e?.message)),
                          },
                        ]);
                      }}
                    >
                      <Ionicons name="close" size={16} color={c.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Ny timeplanøkt</Text>
              <Text style={styles.label}>Ukedag</Text>
              <View style={styles.modeRow}>
                {WEEKDAYS.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.modeChip, form.weekday === d.id && styles.modeOn]}
                    onPress={() => setForm((f) => ({ ...f, weekday: d.id }))}
                  >
                    <Text style={[styles.modeTxt, form.weekday === d.id && styles.modeTxtOn]}>{d.short}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Type</Text>
              <View style={styles.modeRow}>
                {KINDS.map((k) => (
                  <TouchableOpacity
                    key={k.id}
                    style={[styles.modeChip, form.kind === k.id && styles.modeOn]}
                    onPress={() => setForm((f) => ({ ...f, kind: k.id }))}
                  >
                    <Text style={[styles.modeTxt, form.kind === k.id && styles.modeTxtOn]}>{k.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {form.kind === 'subject' && (
                <>
                  <Text style={styles.label}>Fag</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={styles.modeRow}>
                      {subjects.map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.modeChip, form.subjectId === s.id && styles.modeOn]}
                          onPress={() => setForm((f) => ({ ...f, subjectId: s.id, title: s.name }))}
                        >
                          <Text style={[styles.modeTxt, form.subjectId === s.id && styles.modeTxtOn]}>{s.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}
              <Text style={styles.label}>Fra kl.</Text>
              <TextInput style={styles.input} value={form.startTime} onChangeText={(t) => setForm((f) => ({ ...f, startTime: t }))} placeholder="08:00" />
              <Text style={styles.label}>Til kl.</Text>
              <TextInput style={styles.input} value={form.endTime} onChangeText={(t) => setForm((f) => ({ ...f, endTime: t }))} placeholder="12:00" />
              <Text style={styles.label}>Tittel (valgfritt)</Text>
              <TextInput style={styles.input} value={form.title} onChangeText={(t) => setForm((f) => ({ ...f, title: t }))} placeholder="Norsk" />
              <Text style={styles.label}>Sted (valgfritt)</Text>
              <TextInput style={styles.input} value={form.location} onChangeText={(t) => setForm((f) => ({ ...f, location: t }))} placeholder="Rom 12" />
              <Text style={styles.label}>Fra dato (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={form.fromDate} onChangeText={(t) => setForm((f) => ({ ...f, fromDate: t }))} />
              <Text style={styles.label}>Til og med dato</Text>
              <TextInput style={styles.input} value={form.toDate} onChangeText={(t) => setForm((f) => ({ ...f, toDate: t }))} />
              <Text style={styles.hint}>Økten gjentas hver uke i perioden.</Text>
              <TouchableOpacity style={styles.save} onPress={save} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Lagre og gjenta ukentlig</Text>}
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
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center',
  },
  heading: { color: c.ink, fontWeight: '900', fontSize: 18, textTransform: 'capitalize' },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  modeChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.line,
  },
  modeOn: { backgroundColor: c.brandSoft, borderColor: c.brand },
  modeTxt: { color: c.muted, fontWeight: '800', fontSize: 12 },
  modeTxtOn: { color: c.brand },
  lead: { color: c.muted, fontWeight: '600', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.brand, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
  },
  ctaTxt: { color: '#fff', fontWeight: '900' },
  ghost: {
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, justifyContent: 'center',
  },
  ghostTxt: { color: c.ink, fontWeight: '800' },
  dayBlock: { marginBottom: 14 },
  dayLabel: { color: c.ink, fontWeight: '800', fontSize: 13, marginBottom: 6, textTransform: 'capitalize' },
  emptyTiny: { color: c.muted, fontWeight: '600', marginLeft: 4 },
  slot: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: 12, padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: c.line,
  },
  bar: { width: 6, alignSelf: 'stretch', borderRadius: 4 },
  slotTitle: { color: c.ink, fontWeight: '800', fontSize: 14 },
  slotMeta: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 1 },
  monthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  monthName: { flex: 1, color: c.ink, fontWeight: '800', textTransform: 'capitalize' },
  monthCount: { color: c.muted, fontWeight: '700', fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(26,39,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '88%',
  },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: c.ink, marginBottom: 8 },
  label: { color: c.ink, fontWeight: '800', fontSize: 12, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: c.bg, borderRadius: 14, padding: 12, color: c.ink, fontWeight: '700',
    borderWidth: 1, borderColor: c.line,
  },
  hint: { color: c.muted, fontWeight: '600', fontSize: 12, marginVertical: 10 },
  save: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 20 },
  saveTxt: { color: '#fff', fontWeight: '900' },
});
