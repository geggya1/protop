/**
 * Vedlikehold, anlegg og avvik på en privat bolig.
 * Famac-lignende FDV, kuttet ned til det en familie faktisk bruker.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { Mute } from './ui';
import {
  TASK_CADENCES,
  TASK_PRIORITIES,
  SYSTEM_KINDS,
  missingStarterTasks,
  markTaskDone,
  markIssueFixed,
  markSystemServiced,
  watchItems,
  todayKey,
  formatCareDate,
  priorityMeta,
  cadenceMeta,
  systemKindMeta,
  newCareId,
  nextDueAfter,
} from '../src/utils/boligCare';

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function RowActions({ children }) {
  return <View style={styles.rowActions}>{children}</View>;
}

export default function BoligenCareSections({
  bolig,
  holdings = [],
  saving = false,
  onSave,
  formRequest = null,
  onFormHandled,
}) {
  const today = todayKey();
  const [form, setForm] = useState(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [cadence, setCadence] = useState('yearly');
  const [priority, setPriority] = useState('prevent');
  const [kind, setKind] = useState('heatpump');
  const [severity, setSeverity] = useState('normal');

  const watch = useMemo(
    () => (bolig ? watchItems(bolig, today, holdings) : []),
    [bolig, today, holdings],
  );
  const tasks = bolig?.tasks || [];
  const systems = bolig?.systems || [];
  const issues = bolig?.issues || [];
  const starterLeft = missingStarterTasks(tasks).length;

  useEffect(() => {
    if (!formRequest) return;
    setForm(formRequest);
    setTitle('');
    setNotes('');
    onFormHandled?.();
  }, [formRequest, onFormHandled]);

  const closeForm = () => {
    if (saving) return;
    setForm(null);
    setTitle('');
    setNotes('');
  };

  const saveForm = async () => {
    if (!bolig || !title.trim() || saving) return;
    if (form === 'task') {
      await onSave?.({
        tasks: [
          ...tasks,
          {
            id: newCareId('task'),
            title: title.trim(),
            notes: notes.trim(),
            cadence,
            priority,
            nextDueKey: today,
            status: 'open',
            history: [],
          },
        ],
      });
    } else if (form === 'system') {
      await onSave?.({
        systems: [
          ...systems,
          {
            id: newCareId('sys'),
            name: title.trim(),
            kind,
            notes: notes.trim(),
            serviceMonths: 12,
            nextServiceKey: nextDueAfter(today, 'yearly'),
          },
        ],
      });
    } else if (form === 'issue') {
      await onSave?.({
        issues: [
          ...issues,
          {
            id: newCareId('issue'),
            title: title.trim(),
            notes: notes.trim(),
            severity,
            status: 'open',
            openedKey: today,
          },
        ],
      });
    }
    closeForm();
  };

  const addStarter = async () => {
    const extra = missingStarterTasks(tasks);
    if (!extra.length || saving) return;
    await onSave?.({ tasks: [...tasks, ...extra] });
  };

  if (!bolig) return null;

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Passer på</Text>
        <Mute>Garanti, service og det som bør gjøres før det blir dyrt.</Mute>
        {watch.length ? watch.map((item) => (
          <Text
            key={item.id}
            style={[
              styles.watchLine,
              item.tone === 'overdue' && styles.watchOverdue,
              item.tone === 'soon' && styles.watchSoon,
            ]}
          >
            {item.label}
          </Text>
        )) : (
          <Mute>Ingenting haster akkurat nå.</Mute>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.sectionTitle}>Vedlikehold</Text>
          <TouchableOpacity onPress={() => setForm('task')} accessibilityLabel="Ny vedlikeholdsoppgave">
            <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
          </TouchableOpacity>
        </View>
        <Mute>Kryss av når det er gjort. Årlige oppgaver kommer tilbake neste gang.</Mute>
        {starterLeft ? (
          <TouchableOpacity style={styles.starterBtn} onPress={addStarter} disabled={saving}>
            <Text style={styles.starterTxt}>
              {saving ? 'Legger inn…' : `Legg inn startpakke (${starterLeft})`}
            </Text>
          </TouchableOpacity>
        ) : null}
        {tasks.map((task) => (
          <View key={task.id} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, task.status === 'done' && styles.doneTitle]}>
                {task.title}
              </Text>
              <Text style={styles.meta}>
                {[
                  priorityMeta(task.priority).label,
                  cadenceMeta(task.cadence).label,
                  task.nextDueKey && task.status !== 'done' ? formatCareDate(task.nextDueKey) : null,
                  task.lastDoneKey ? `sist ${formatCareDate(task.lastDoneKey)}` : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {task.status !== 'done' ? (
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => onSave?.({ tasks: tasks.map((row) => (row.id === task.id ? markTaskDone(row, today) : row)) })}
                disabled={saving}
                accessibilityLabel={`Merk ${task.title} som utført`}
              >
                <Text style={styles.doneTxt}>Utført</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.meta}>Ferdig</Text>
            )}
          </View>
        ))}
        {!tasks.length ? <Mute>Ingen oppgaver ennå. Startpakken dekker det de fleste glemmer.</Mute> : null}
        {form === 'task' ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="F.eks. Sjekk sluk på badet"
              placeholderTextColor={colors.placeholder}
            />
            <View style={styles.chipRow}>
              {TASK_CADENCES.map((row) => (
                <Chip key={row.id} label={row.label} active={cadence === row.id} onPress={() => setCadence(row.id)} />
              ))}
            </View>
            <View style={styles.chipRow}>
              {TASK_PRIORITIES.map((row) => (
                <Chip key={row.id} label={row.label} active={priority === row.id} onPress={() => setPriority(row.id)} />
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="Kort hvordan, hvis det trengs"
              placeholderTextColor={colors.placeholder}
            />
            <RowActions>
              <TouchableOpacity style={styles.secondaryBtn} onPress={closeForm}><Text style={styles.secondaryTxt}>Avbryt</Text></TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={saveForm} disabled={saving || !title.trim()}>
                <Text style={styles.primaryTxt}>{saving ? 'Lagrer…' : 'Legg til'}</Text>
              </TouchableOpacity>
            </RowActions>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.sectionTitle}>Anlegg</Text>
          <TouchableOpacity onPress={() => setForm('system')} accessibilityLabel="Nytt anlegg">
            <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
          </TouchableOpacity>
        </View>
        <Mute>Varmepumpe, bereder, sikringsskap — med neste service.</Mute>
        {systems.map((system) => (
          <View key={system.id} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{system.name}</Text>
              <Text style={styles.meta}>
                {[
                  systemKindMeta(system.kind).label,
                  system.nextServiceKey ? `service ${formatCareDate(system.nextServiceKey)}` : null,
                  system.lastServiceKey ? `sist ${formatCareDate(system.lastServiceKey)}` : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => onSave?.({
                systems: systems.map((row) => (row.id === system.id ? markSystemServiced(row, today) : row)),
              })}
              disabled={saving}
              accessibilityLabel={`Registrer service på ${system.name}`}
            >
              <Text style={styles.doneTxt}>Service</Text>
            </TouchableOpacity>
          </View>
        ))}
        {!systems.length ? <Mute>Ingen anlegg ennå.</Mute> : null}
        {form === 'system' ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="F.eks. Varmepumpe stue"
              placeholderTextColor={colors.placeholder}
            />
            <View style={styles.chipRow}>
              {SYSTEM_KINDS.map((row) => (
                <Chip key={row.id} label={row.label} active={kind === row.id} onPress={() => setKind(row.id)} />
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="Modell, plassering, hva som ble gjort sist"
              placeholderTextColor={colors.placeholder}
            />
            <RowActions>
              <TouchableOpacity style={styles.secondaryBtn} onPress={closeForm}><Text style={styles.secondaryTxt}>Avbryt</Text></TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={saveForm} disabled={saving || !title.trim()}>
                <Text style={styles.primaryTxt}>{saving ? 'Lagrer…' : 'Legg til'}</Text>
              </TouchableOpacity>
            </RowActions>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.sectionTitle}>Noe å fikse</Text>
          <TouchableOpacity onPress={() => setForm('issue')} accessibilityLabel="Registrer noe å fikse">
            <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
          </TouchableOpacity>
        </View>
        <Mute>Lekkasje, løs list, en lampe som blinker. Ikke et avvikssystem for borettslag.</Mute>
        {issues.filter((issue) => issue.status !== 'fixed').map((issue) => (
          <View key={issue.id} style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{issue.title}</Text>
              <Text style={styles.meta}>{issue.severity === 'high' ? 'Haster' : 'Vanlig'}</Text>
            </View>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => onSave?.({
                issues: issues.map((row) => (row.id === issue.id ? markIssueFixed(row, today) : row)),
              })}
              disabled={saving}
              accessibilityLabel={`Merk ${issue.title} som fikset`}
            >
              <Text style={styles.doneTxt}>Fikset</Text>
            </TouchableOpacity>
          </View>
        ))}
        {issues.some((issue) => issue.status === 'fixed') ? (
          <Mute>
            {`Fikset: ${issues.filter((issue) => issue.status === 'fixed').map((issue) => issue.title).join(', ')}`}
          </Mute>
        ) : null}
        {!issues.length ? <Mute>Ingenting er registrert som ødelagt.</Mute> : null}
        {form === 'issue' ? (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="F.eks. Drypp fra kjøkkenkran"
              placeholderTextColor={colors.placeholder}
            />
            <View style={styles.chipRow}>
              <Chip label="Vanlig" active={severity === 'normal'} onPress={() => setSeverity('normal')} />
              <Chip label="Haster" active={severity === 'high'} onPress={() => setSeverity('high')} />
            </View>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="Hvor, og hva som skjer"
              placeholderTextColor={colors.placeholder}
            />
            <RowActions>
              <TouchableOpacity style={styles.secondaryBtn} onPress={closeForm}><Text style={styles.secondaryTxt}>Avbryt</Text></TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={saveForm} disabled={saving || !title.trim()}>
                <Text style={styles.primaryTxt}>{saving ? 'Lagrer…' : 'Legg til'}</Text>
              </TouchableOpacity>
            </RowActions>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
  },
  sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  watchLine: { color: colors.ink, fontWeight: '500', marginTop: 4 },
  watchOverdue: { color: '#b91c1c' },
  watchSoon: { color: '#b45309' },
  starterBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  starterTxt: { color: colors.brand, fontWeight: '500' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  itemTitle: { color: colors.ink, fontWeight: '500' },
  doneTitle: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  doneBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  doneTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  form: { gap: 8, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.card,
    color: colors.ink,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontWeight: '500', color: colors.muted, fontSize: 12 },
  chipTxtOn: { color: '#fff' },
  rowActions: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.brandSoft,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryTxt: { color: colors.brand, fontWeight: '500' },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryTxt: { color: '#fff', fontWeight: '500' },
});
