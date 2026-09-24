import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  createClassworkItem, updateClassworkItem, classworkTypeMeta, listenClassTopics, listenSubjects,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

export default function ClassroomClassworkEditorScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { uid, activeProfile, familyId } = useApp();
  const classroomId = route.params?.classroomId || familyId;
  const editing = route.params?.item || null;
  const type = editing?.type || route.params?.type || 'assignment';
  const meta = classworkTypeMeta(type);

  const [title, setTitle] = useState(editing?.title || '');
  const [instructions, setInstructions] = useState(editing?.instructions || '');
  const [dueDate, setDueDate] = useState(editing?.dueDate || '');
  const [scheduledDate, setScheduledDate] = useState(editing?.scheduledDate || '');
  const [maxPoints, setMaxPoints] = useState(
    editing?.maxPoints != null ? String(editing.maxPoints) : (type === 'assignment' ? '100' : ''),
  );
  const [linkUrl, setLinkUrl] = useState(editing?.links?.[0]?.url || '');
  const [topicId, setTopicId] = useState(editing?.topicId || null);
  const [subjectId, setSubjectId] = useState(editing?.subjectId || null);
  const [topics, setTopics] = useState(route.params?.topics || []);
  const [subjects, setSubjects] = useState(route.params?.subjects || []);
  const [students, setStudents] = useState([]);
  const [pickedStudents, setPickedStudents] = useState(() => {
    const ids = editing?.assignedStudentIds || [];
    return Object.fromEntries(ids.map((id) => [id, true]));
  });
  const [assignAll, setAssignAll] = useState(!(editing?.assignedStudentIds || []).length);
  const [optionsText, setOptionsText] = useState((editing?.options || []).join('\n'));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classroomId) return undefined;
    const a = listenClassTopics(classroomId, setTopics);
    const b = listenSubjects(classroomId, setSubjects);
    const cUnsub = onSnapshot(collection(db, 'families', classroomId, 'children'), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.deleted !== true && s.active !== false)
        .sort((x, y) => (x.name || '').localeCompare(y.name || '', 'nb')));
    });
    return () => { a(); b(); cUnsub(); };
  }, [classroomId]);

  const save = async (status = 'published') => {
    if (busy) return;
    setBusy(true);
    try {
      const assignedStudentIds = assignAll
        ? []
        : Object.keys(pickedStudents).filter((id) => pickedStudents[id]);
      if (!assignAll && !assignedStudentIds.length) {
        throw new Error('Velg minst én elev, eller «Hele klassen».');
      }
      const payload = {
        type,
        title,
        instructions,
        topicId,
        subjectId,
        dueDate: dueDate.trim() || null,
        scheduledDate: scheduledDate.trim() || null,
        maxPoints: maxPoints.trim() === '' ? null : Number(maxPoints),
        links: linkUrl.trim() ? [{ url: linkUrl.trim(), title: linkUrl.trim() }] : [],
        options: type === 'question'
          ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean)
          : [],
        questionType: type === 'question'
          ? (optionsText.trim() ? 'mc' : 'short')
          : null,
        assignedStudentIds,
        status,
        createdBy: uid,
        createdByName: activeProfile?.name || '',
      };
      if (editing?.id) {
        await updateClassworkItem(classroomId, editing.id, payload);
      } else {
        await createClassworkItem(classroomId, payload);
      }
      nav.goBack();
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Klassearbeid</Text>
          <Text style={styles.title}>{editing ? 'Rediger' : `Ny ${meta.label.toLowerCase()}`}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Som i Google Classroom: tittel, instruksjoner, frist, poeng, emne og hvem som får oppgaven.
        </Text>
        <Text style={styles.label}>Tittel</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="F.eks. Les kapittel 3 og svar"
          placeholderTextColor={c.muted}
        />
        <Text style={styles.label}>Instruksjoner</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Hva skal elevene gjøre?"
          placeholderTextColor={c.muted}
          multiline
        />
        {type !== 'material' ? (
          <>
            <Text style={styles.label}>Frist (ÅÅÅÅ-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="2026-09-15"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
            />
            <Text style={styles.label}>Poeng (valgfritt)</Text>
            <TextInput
              style={styles.input}
              value={maxPoints}
              onChangeText={setMaxPoints}
              placeholder="100"
              placeholderTextColor={c.muted}
              keyboardType="numeric"
            />
          </>
        ) : null}
        <Text style={styles.label}>Planlegg publisering (valgfritt, ÅÅÅÅ-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={scheduledDate}
          onChangeText={setScheduledDate}
          placeholder="Tom = synlig med en gang"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
        />
        <Text style={styles.label}>Lenke / ressurs (valgfritt)</Text>
        <TextInput
          style={styles.input}
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder="https://…"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
        />
        {type === 'question' ? (
          <>
            <Text style={styles.label}>Svaralternativer (ett per linje — tomt = fritekst)</Text>
            <TextInput
              style={[styles.input, styles.area]}
              value={optionsText}
              onChangeText={setOptionsText}
              placeholder={'A\nB\nC'}
              placeholderTextColor={c.muted}
              multiline
            />
          </>
        ) : null}

        <Text style={styles.label}>Tildeles</Text>
        <TouchableOpacity
          style={[styles.chip, assignAll && styles.chipOn]}
          onPress={() => setAssignAll(true)}
        >
          <Text style={[styles.chipTxt, assignAll && styles.chipTxtOn]}>Hele klassen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, !assignAll && styles.chipOn]}
          onPress={() => setAssignAll(false)}
        >
          <Text style={[styles.chipTxt, !assignAll && styles.chipTxtOn]}>Utvalgte elever</Text>
        </TouchableOpacity>
        {!assignAll ? students.map((s) => {
          const on = !!pickedStudents[s.id];
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setPickedStudents((p) => ({ ...p, [s.id]: !on }))}
            >
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{s.name || 'Elev'}</Text>
            </TouchableOpacity>
          );
        }) : null}

        <Text style={styles.label}>Emne</Text>
        <TouchableOpacity
          style={[styles.chip, !topicId && styles.chipOn]}
          onPress={() => setTopicId(null)}
        >
          <Text style={[styles.chipTxt, !topicId && styles.chipTxtOn]}>Uten emne</Text>
        </TouchableOpacity>
        {topics.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.chip, topicId === t.id && styles.chipOn]}
            onPress={() => setTopicId(t.id)}
          >
            <Text style={[styles.chipTxt, topicId === t.id && styles.chipTxtOn]}>{t.name}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Fag</Text>
        <TouchableOpacity
          style={[styles.chip, !subjectId && styles.chipOn]}
          onPress={() => setSubjectId(null)}
        >
          <Text style={[styles.chipTxt, !subjectId && styles.chipTxtOn]}>Ingen</Text>
        </TouchableOpacity>
        {subjects.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.chip, subjectId === s.id && styles.chipOn]}
            onPress={() => setSubjectId(s.id)}
          >
            <Text style={[styles.chipTxt, subjectId === s.id && styles.chipTxtOn]}>{s.name}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.save, (!title.trim() || busy) && { opacity: 0.45 }]}
          onPress={() => save('published')}
          disabled={!title.trim() || busy}
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveTxt}>{editing ? 'Lagre og publiser' : 'Publiser'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.draft, (!title.trim() || busy) && { opacity: 0.45 }]}
          onPress={() => save('draft')}
          disabled={!title.trim() || busy}
        >
          <Text style={styles.draftTxt}>Lagre som utkast</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line,
  },
  back: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  kicker: { color: c.tint, fontWeight: '800', fontSize: 11, textTransform: 'uppercase' },
  title: { color: c.ink, fontWeight: '900', fontSize: 18 },
  body: { padding: 16, paddingBottom: 40 },
  hint: { color: c.muted, fontWeight: '600', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  label: { color: c.muted, fontWeight: '800', fontSize: 12, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.line,
    paddingHorizontal: 12, paddingVertical: 12, color: c.ink, fontWeight: '600',
  },
  area: { minHeight: 90, textAlignVertical: 'top' },
  chip: {
    backgroundColor: c.surface, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: c.line, marginBottom: 6,
  },
  chipOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  chipTxt: { color: c.ink, fontWeight: '700' },
  chipTxtOn: { color: c.brand },
  save: {
    marginTop: 20, backgroundColor: c.brand, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  saveTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  draft: {
    marginTop: 10, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: c.line, backgroundColor: c.surface,
  },
  draftTxt: { color: c.brand, fontWeight: '800', fontSize: 15 },
});
