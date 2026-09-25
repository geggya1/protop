import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { isGroupAdmin } from '../../src/utils/groups';
import { listenGroupTasks, createGroupTask, toggleGroupTask } from '../../src/platform/platformCore';

export default function PlatformTasksScreen({ config, groupId, group }) {
  const c = config.theme;
  const { uid } = useApp();
  const isAdmin = isGroupAdmin(group, uid);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenGroupTasks(groupId, (list) => {
      setTasks(list || []);
      setLoading(false);
    });
  }, [groupId]);

  const add = async () => {
    try {
      await createGroupTask({ groupId, title, authorUid: uid });
      setTitle('');
      setAdding(false);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke legge til oppgave.');
    }
  };

  const toggle = async (task) => {
    try {
      await toggleGroupTask(groupId, task.id, !task.done);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke oppdatere.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <ScrollView contentContainerStyle={[styles.body, { backgroundColor: c.bg }]}>
      <TouchableOpacity style={[styles.addBar, { backgroundColor: c.brand }]} onPress={() => setAdding(!adding)}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addTxt}>Ny oppgave</Text>
      </TouchableOpacity>

      {adding && (
        <View style={[styles.form, { backgroundColor: c.surface, borderColor: c.line }]}>
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Oppgave" placeholderTextColor={c.muted} value={title} onChangeText={setTitle} />
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.brand }]} onPress={add}>
            <Text style={styles.saveTxt}>Legg til</Text>
          </TouchableOpacity>
        </View>
      )}

      {open.length > 0 && (
        <>
          <Text style={[styles.section, { color: c.muted }]}>Å gjøre ({open.length})</Text>
          {open.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[styles.row, { backgroundColor: c.surface, borderColor: c.line }]}
              onPress={() => toggle(task)}
            >
              <Ionicons name="ellipse-outline" size={22} color={c.brand} />
              <Text style={[styles.taskTitle, { color: c.ink }]}>{task.title}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <Text style={[styles.section, { color: c.muted }]}>Ferdig ({done.length})</Text>
          {done.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[styles.row, { backgroundColor: c.surface, borderColor: c.line, opacity: 0.7 }]}
              onPress={() => toggle(task)}
            >
              <Ionicons name="checkmark-circle" size={22} color={c.success} />
              <Text style={[styles.taskTitle, styles.done, { color: c.muted }]}>{task.title}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 8, paddingBottom: 32 },
  addBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, marginBottom: 8 },
  addTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  form: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn: {
    alignSelf: 'flex-start', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '400' },
  section: { fontSize: 11, fontWeight: '400', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  taskTitle: { fontSize: 15, fontWeight: '400', flex: 1 },
  done: { textDecorationLine: 'line-through' },
});
