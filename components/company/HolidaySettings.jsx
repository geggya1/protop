import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveRedDays } from '../../src/arbeid/holidays.js';
import {
  deleteRedDay,
  importHolidayYear,
  setFullDayHours,
  upsertRedDay,
} from '../../src/arbeid/timesheetState.js';
import { SetupFrame, TextAction } from './SetupFrame';
import { useCompanyProject } from './useCompanyProject';

function formatNb(iso) {
  const [year, month, day] = String(iso || '').split('-');
  if (!year || !month || !day) return iso || '';
  return `${day}.${month}.${year}`;
}

function toIso(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

export default function HolidaySettings({ familyId, colors, canEdit }) {
  const project = useCompanyProject(familyId);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [draft, setDraft] = useState(null);
  const [hours, setHours] = useState('');
  const numericYear = Number(year) || new Date().getFullYear();
  const rows = useMemo(
    () => resolveRedDays(project.state, [numericYear]).filter((row) => String(row.date).startsWith(`${numericYear}-`)),
    [project.state, numericYear],
  );

  useEffect(() => {
    setHours(String(project.state.fullDayHours || 8));
  }, [project.state.fullDayHours]);

  function openNew() {
    setDraft({ id: '', date: '', name: '', portion: 'full' });
    project.setError('');
  }

  function openRow(row) {
    setDraft({
      id: row.id,
      date: formatNb(row.date),
      name: row.name,
      portion: row.portion === 'half' ? 'half' : 'full',
    });
  }

  async function saveDay() {
    const ok = await project.commit(upsertRedDay(project.state, {
      id: draft.id,
      date: toIso(draft.date),
      name: draft.name,
      portion: draft.portion,
      kind: 'dayoff',
    }), 'Fridagen er lagret.');
    if (ok) setDraft(null);
  }

  async function removeDay() {
    const ok = await project.commit(deleteRedDay(project.state, draft.id || toIso(draft.date)), 'Fridagen er slettet.');
    if (ok) setDraft(null);
  }

  return (
    <SetupFrame
      colors={colors}
      nativeID="company-holidays"
      crumbs={[
        { label: 'Fravær', tab: 'arbeid', page: 'fravaer' },
        { label: 'Innstillinger', tab: 'arbeid', page: 'fravaer-innstillinger' },
        { label: 'Fridager' },
      ]}
      title="Fridager"
      note={project.note}
      error={project.error}
      action={(
        <View style={styles.tools}>
          {canEdit ? (
            <TextAction filled colors={colors} label="+ Legg til selskapsfridag" onPress={openNew} nativeID="add-company-holiday" />
          ) : null}
          <TextInput
            value={year}
            onChangeText={setYear}
            editable={canEdit}
            accessibilityLabel="År"
            keyboardType="number-pad"
            style={[styles.year, { color: colors.ink, borderColor: colors.line }]}
          />
        </View>
      )}
    >
      <Text style={{ color: colors.muted }}>
        Norske helligdager ligger inne for året og kan importeres på nytt om de er slettet.
        Fridager blir røde i timelisten og tas ut av summen over avtalte timer.
      </Text>
      {canEdit ? (
        <TouchableOpacity
          onPress={() => project.commit(importHolidayYear(project.state, numericYear), `Norske helligdager for ${numericYear} er importert.`)}
          nativeID="import-holidays"
          accessibilityRole="button"
        >
          <Text style={{ color: colors.brand, fontWeight: '400' }}>Importer norske helligdager</Text>
        </TouchableOpacity>
      ) : null}
      {draft ? (
        <View style={[styles.form, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '400' }}>{draft.id ? 'Endre fridag' : 'Ny selskapsfridag'}</Text>
          <TextInput
            value={draft.name}
            onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
            placeholder="Navn, f.eks. julaften"
            placeholderTextColor={colors.placeholder}
            editable={canEdit}
            accessibilityLabel="Navn på fridag"
            style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
          />
          <TextInput
            value={draft.date}
            onChangeText={(date) => setDraft((current) => ({ ...current, date }))}
            placeholder="dd.mm.åååå"
            placeholderTextColor={colors.placeholder}
            editable={canEdit}
            accessibilityLabel="Dato for fridag"
            style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
          />
          <View style={styles.tools}>
            {['full', 'half'].map((portion) => (
              <TouchableOpacity
                key={portion}
                onPress={() => setDraft((current) => ({ ...current, portion }))}
                style={[styles.chip, { borderColor: draft.portion === portion ? colors.brand : colors.line }]}
              >
                <Text style={{ color: colors.ink }}>{portion === 'half' ? 'Halv dag' : 'Hel dag'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.tools}>
            <TextAction label="Avbryt" colors={colors} onPress={() => setDraft(null)} />
            {canEdit ? <TextAction filled label="Lagre" colors={colors} onPress={saveDay} nativeID="save-holiday" /> : null}
            {canEdit && (draft.id || draft.date) ? (
              <TouchableOpacity onPress={removeDay} accessibilityLabel="Slett fridag">
                <Text style={{ color: colors.danger || '#b42318' }}>Slett</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
      <View style={[styles.table, { borderColor: colors.line }]}>
        <View style={[styles.header, { backgroundColor: colors.sunken }]}>
          <Text style={[styles.headerText, { color: colors.ink }]}>Fridag</Text>
        </View>
        {rows.map((row, index) => (
          <View key={row.id} style={[styles.row, { backgroundColor: index % 2 ? colors.sunken : colors.card }]}>
            <View style={styles.name}>
              <Text style={{ color: colors.ink }}>{row.name}</Text>
              {row.source === 'system' ? (
                <View style={[styles.badge, { borderColor: colors.line }]}>
                  <Text style={[styles.badgeText, { color: colors.muted }]}>Systemgenerert</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: colors.ink, width: 110 }}>{formatNb(row.date)}</Text>
            {canEdit ? (
              <TouchableOpacity onPress={() => openRow(row)} accessibilityLabel={`Endre ${row.name}`}>
                <Ionicons name="pencil" size={16} color={colors.brand} />
              </TouchableOpacity>
            ) : <View style={{ width: 16 }} />}
          </View>
        ))}
        {!rows.length ? <Text style={[styles.empty, { color: colors.muted }]}>Ingen fridager dette året.</Text> : null}
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Standard arbeidsdag (timer)</Text>
      <View style={styles.tools}>
        <TextInput
          value={hours}
          onChangeText={setHours}
          editable={canEdit}
          accessibilityLabel="Normaldag"
          style={[styles.year, { color: colors.ink, borderColor: colors.line }]}
        />
        {canEdit ? (
          <TextAction
            filled
            colors={colors}
            label="Lagre normaldag"
            onPress={() => project.commit(setFullDayHours(project.state, hours), 'Normaldag oppdatert.')}
          />
        ) : null}
      </View>
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  year: { borderWidth: 1, borderRadius: 8, minWidth: 88, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  form: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  headerText: { fontWeight: '400' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  name: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  badge: { borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12 },
  empty: { padding: 16 },
});
