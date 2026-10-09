import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours, parseHours } from '../../src/arbeid/hours.js';
import { TIME_TYPES } from '../../src/arbeid/overtime.js';

const QUICK = ['0:30', '1:00', '2:00', '4:00', '7:30', '8:00'];

/**
 * Popup for å registrere timer på prosjekt+dag (inspirert av Moment).
 */
export default function TimeEntryModal({
  visible,
  colors,
  project,
  dateLabel,
  activities = [],
  initial,
  requireDescription = true,
  onSave,
  onDelete,
  onClose,
}) {
  const [hours, setHours] = useState('0:00');
  const [description, setDescription] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [activityId, setActivityId] = useState('');
  const [timeType, setTimeType] = useState('ordinary');
  const [showInternal, setShowInternal] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setHours(formatHours(initial?.hours || 0));
    setDescription(initial?.description || '');
    setInternalNote(initial?.internalNote || '');
    setActivityId(initial?.activityId || activities[0]?.id || '');
    setTimeType(initial?.timeType || 'ordinary');
    setShowInternal(!!initial?.internalNote);
    setError('');
    setShowMenu(false);
  }, [visible, initial, activities]);

  function submit() {
    const value = parseHours(hours);
    if (value < 0) {
      setError('Timer kan ikke være negative.');
      return;
    }
    if (requireDescription && value > 0 && !description.trim()) {
      setError('Beskrivelse av utført arbeid er påkrevd.');
      return;
    }
    onSave?.({
      id: initial?.id,
      hours: value,
      description: description.trim(),
      internalNote: internalNote.trim(),
      activityId,
      activityName: activities.find((row) => row.id === activityId)?.name || 'Hovedaktivitet',
      timeType,
    });
  }

  if (!visible) return null;

  const body = (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.project, { color: colors.ink }]} numberOfLines={2}>
            #{project?.number} {project?.name}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{dateLabel}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowMenu((v) => !v)} hitSlop={8} accessibilityRole="button">
          <Ionicons name="settings-outline" size={20} color={colors.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} hitSlop={8} style={{ marginLeft: 10 }} accessibilityRole="button">
          <Ionicons name="close" size={22} color={colors.ink} />
        </TouchableOpacity>
      </View>

      {showMenu ? (
        <View style={[styles.menu, { borderColor: colors.line, backgroundColor: colors.sunken || colors.card }]}>
          <TouchableOpacity onPress={() => { setShowInternal(true); setShowMenu(false); }}>
            <Text style={{ color: colors.ink, paddingVertical: 8 }}>Vis internt notat</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setShowQuick((v) => !v); setShowMenu(false); }}>
            <Text style={{ color: colors.ink, paddingVertical: 8 }}>
              {showQuick ? 'Skjul' : 'Vis'} hurtigvalg for timer
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.muted }]}>Timer</Text>
      <TextInput
        value={hours}
        onChangeText={setHours}
        placeholder="0:00"
        placeholderTextColor={colors.placeholder}
        keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.sunken || '#fff' }]}
        autoFocus
      />

      {showQuick ? (
        <View style={styles.quickRow}>
          {QUICK.map((item) => (
            <TouchableOpacity
              key={item}
              onPress={() => setHours(item)}
              style={[styles.quick, { borderColor: colors.line, backgroundColor: colors.bg }]}
            >
              <Text style={{ color: colors.ink, fontSize: 12 }}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.muted }]}>Beskrivelse av utført arbeid</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Eksternt notat — synlig for kunde"
        placeholderTextColor={colors.placeholder}
        multiline
        style={[styles.area, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.sunken || '#fff' }]}
      />

      {showInternal ? (
        <>
          <Text style={[styles.label, { color: colors.muted }]}>Internt notat</Text>
          <TextInput
            value={internalNote}
            onChangeText={setInternalNote}
            placeholder="Kun synlig internt"
            placeholderTextColor={colors.placeholder}
            multiline
            style={[styles.area, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.sunken || '#fff' }]}
          />
        </>
      ) : null}

      <Text style={[styles.label, { color: colors.muted }]}>Timeart</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {TIME_TYPES.map((row) => {
          const on = row.id === timeType;
          return (
            <TouchableOpacity
              key={row.id}
              onPress={() => setTimeType(row.id)}
              style={[
                styles.chip,
                {
                  borderColor: on ? colors.brand : colors.line,
                  backgroundColor: on ? `${colors.brand}18` : colors.bg,
                },
              ]}
            >
              <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 13 }}>{row.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={[styles.label, { color: colors.muted }]}>Aktivitet</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {(activities.length ? activities : [{ id: '', name: 'Hovedaktivitet' }]).map((row) => {
          const on = (row.id || '') === (activityId || '');
          return (
            <TouchableOpacity
              key={row.id || 'main'}
              onPress={() => setActivityId(row.id || '')}
              style={[
                styles.chip,
                {
                  borderColor: on ? colors.brand : colors.line,
                  backgroundColor: on ? `${colors.brand}18` : colors.bg,
                },
              ]}
            >
              <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 13 }}>{row.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {error ? <Text style={{ color: colors.danger || '#b42318', marginBottom: 8 }}>{error}</Text> : null}

      <View style={styles.actions}>
        {initial?.id ? (
          <TouchableOpacity
            onPress={() => onDelete?.(initial.id)}
            style={[styles.iconBtn, { borderColor: colors.line }]}
            accessibilityRole="button"
            accessibilityLabel="Slett"
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger || '#b42318'} />
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
        <TouchableOpacity
          onPress={onClose}
          style={[styles.btn, { backgroundColor: colors.sunken || colors.bg, borderWidth: 1, borderColor: colors.line }]}
        >
          <Text style={{ color: colors.ink }}>Avbryt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={submit}
          style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.brand }]}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation?.()} style={styles.wrap}>
          {body}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  wrap: {
    width: '100%',
    maxWidth: 440,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  project: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  label: { fontSize: 12, marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  area: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 88,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  quick: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnPrimary: { flex: 1.2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
});
