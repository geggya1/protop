import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { emptyProjectState } from '../../src/project/engine';
import {
  loadProjectState,
  peekProjectState,
  saveProjectState,
} from '../../src/project/storage';
import {
  deleteRedDay,
  importHolidayYear,
  setFullDayHours,
  upsertRedDay,
} from '../../src/arbeid/timesheetState.js';

/** Røde dager og normaldag for selskapet. Lagres i prosjektstate sammen med timelisten. */
export default function CompanyCalendarSettings({ familyId, colors: colorsProp, canEdit }) {
  const theme = useColors();
  const colors = colorsProp || theme;
  const [state, setState] = useState(() => peekProjectState(familyId) || emptyProjectState());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [portion, setPortion] = useState('full');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    loadProjectState(familyId, { hours: false }).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setHours(String(loaded.fullDayHours || 8));
    });
    return () => { live = false; };
  }, [familyId]);

  async function commit(result, success) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setError('');
    setNote(success);
    try {
      await saveProjectState(result.state, familyId);
    } catch {
      setError('Kunne ikke lagre kalenderen.');
    }
  }

  const rows = [...(state.redDays || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 24);

  return (
    <View style={[styles.box, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="company-calendar">
      <Text style={[styles.title, { color: colors.ink }]}>Kalender og røde dager</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>
        Importer norske helligdager, eller legg inn egne røde dager og hele eller halve fridager.
        Firmaets utstyr bookes som egne kalendere under Utstyr. Der styrer øverste leder og administrator hvem som kan booke.
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Standard arbeidsdag (timer)</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>
        Nye medarbeidere får denne dagen mandag til fredag. En tidsplan som er lagret på personen, endres ikke når standarden oppdateres.
      </Text>
      <View style={styles.row}>
        <TextInput
          value={hours}
          onChangeText={setHours}
          editable={canEdit}
          style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
          accessibilityLabel="Normaldag"
        />
        {canEdit ? (
          <TouchableOpacity
            onPress={() => commit(setFullDayHours(state, hours), 'Normaldag oppdatert.')}
            style={[styles.btn, { backgroundColor: colors.brand }]}
          >
            <Text style={styles.btnText}>Lagre</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.row}>
        <TextInput
          value={year}
          onChangeText={setYear}
          editable={canEdit}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, maxWidth: 100 }]}
          accessibilityLabel="År for helligdager"
        />
        {canEdit ? (
          <TouchableOpacity
            onPress={() => commit(importHolidayYear(state, year), `Helligdager for ${year} er importert.`)}
            style={[styles.btn, { backgroundColor: colors.brand }]}
            nativeID="import-holidays"
          >
            <Text style={styles.btnText}>Importer norske helligdager</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>Egen dag (ÅÅÅÅ-MM-DD)</Text>
      <TextInput value={date} onChangeText={setDate} editable={canEdit} placeholder="2026-12-24" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line }]} />
      <TextInput value={name} onChangeText={setName} editable={canEdit} placeholder="Navn, f.eks. julaften" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line }]} />
      <View style={styles.row}>
        {['full', 'half'].map((id) => (
          <TouchableOpacity
            key={id}
            onPress={() => setPortion(id)}
            style={[styles.chip, { borderColor: portion === id ? colors.brand : colors.line, backgroundColor: portion === id ? `${colors.brand}18` : 'transparent' }]}
          >
            <Text style={{ color: colors.ink }}>{id === 'half' ? 'Halv dag' : 'Hel dag / rød dag'}</Text>
          </TouchableOpacity>
        ))}
        {canEdit ? (
          <TouchableOpacity
            onPress={() => commit(upsertRedDay(state, { date, name, portion, kind: 'dayoff' }), 'Dagen er lagt inn.')}
            style={[styles.btn, { backgroundColor: colors.brand }]}
            nativeID="add-red-day"
          >
            <Text style={styles.btnText}>Legg til</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
      {rows.map((row) => (
        <View key={row.id} style={[styles.day, { borderBottomColor: colors.line }]}>
          <Text style={{ color: colors.ink, flex: 1 }}>{row.date} · {row.name} · {row.portion === 'half' ? 'halv' : 'hel'}</Text>
          {canEdit ? (
            <TouchableOpacity onPress={() => commit(deleteRedDay(state, row.id), 'Dagen er fjernet.')} accessibilityLabel={`Fjern ${row.name}`}>
              <Text style={{ color: colors.danger || '#b42318' }}>Fjern</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8, marginTop: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 120 },
  btn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  day: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
});
