import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SERIES_KINDS, normalizeSeries, rangeLabel, seriesConflict, suggestSeries } from '../../src/intercompany/numberSeries';
import { setNumberSeries } from '../../src/intercompany/client';

function RangeInput({ value, onChange, colors, disabled, nativeID }) {
  const v = value || {};
  const field = (key, placeholder) => (
    <TextInput
      nativeID={nativeID ? `${nativeID}-${key}` : undefined}
      value={v[key] == null ? '' : String(v[key])}
      onChangeText={(text) => onChange({ ...v, [key]: text.replace(/\D/g, '') })}
      editable={!disabled}
      keyboardType="number-pad"
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
    />
  );
  return (
    <View style={styles.range}>
      {field('from', 'Fra')}
      <Text style={{ color: colors.muted }}>–</Text>
      {field('to', 'Til')}
    </View>
  );
}

/**
 * Nummerserier i konsernet. Morselskapet fordeler prosjekt- og kundenummer mellom seg selv og
 * datterselskapene, så numrene ikke kolliderer på tvers. Datterselskaper ser sin egen serie.
 * companies: [{ id, name }] med morselskapet først (bare når vi er mor). family: valgt selskap.
 */
export default function NumberSeriesPanel({ familyId, family, companies = [], canEdit, colors }) {
  const own = normalizeSeries(family?.numberSeries);
  const isParent = companies.length > 1;
  const saved = family?.konsernNumberSeries?.companies || {};
  const initial = useMemo(() => Object.fromEntries(companies.map((row) => [row.id, normalizeSeries(saved[row.id])])), [companies, saved]);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => { if (!editing) setDraft(initial); }, [initial, editing]);

  const names = Object.fromEntries(companies.map((row) => [row.id, row.name]));

  async function save() {
    const conflict = seriesConflict(draft, names);
    if (conflict) {
      setError(conflict);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await setNumberSeries({ companyId: familyId, assignments: draft });
      setEditing(false);
      setNote('Nummerseriene er lagret. Nye prosjekter og kunder i hvert selskap får nummer i sin serie.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lagre nummerseriene.');
    } finally {
      setBusy(false);
    }
  }

  if (!isParent) {
    if (!Object.keys(own).length) return null;
    return (
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="ic-number-series">
        <View style={styles.head}>
          <Ionicons name="list-outline" size={18} color={colors.brandInk} />
          <Text style={[styles.title, { color: colors.ink }]}>Nummerserie i konsernet</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {`Satt av ${family?.numberSeries?.setByName || 'morselskapet'}. Nye prosjekter og kunder får nummer i serien.`}
        </Text>
        {SERIES_KINDS.map((kind) => (own[kind.id] ? (
          <View key={kind.id} style={styles.line}>
            <Text style={{ color: colors.muted, flex: 1 }}>{kind.label}</Text>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{rangeLabel(own[kind.id])}</Text>
          </View>
        ) : null))}
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="ic-number-series">
      <View style={styles.head}>
        <Ionicons name="list-outline" size={18} color={colors.brandInk} />
        <Text style={[styles.title, { color: colors.ink, flex: 1 }]}>Nummerserier i konsernet</Text>
        {canEdit && !editing ? (
          <Pressable nativeID="ic-series-edit" onPress={() => { setEditing(true); setNote(''); }} style={[styles.btn, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Fordel serier</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Gi hvert selskap sin egen serie for prosjekt- og kundenummer, så numrene aldri kolliderer i konsernet.
      </Text>
      <View style={[styles.row, styles.headerRow, { borderColor: colors.line }]}>
        <Text style={[styles.colName, { color: colors.muted }]}>Selskap</Text>
        {SERIES_KINDS.map((kind) => <Text key={kind.id} style={[styles.col, { color: colors.muted }]}>{kind.label}</Text>)}
      </View>
      {companies.map((company, index) => (
        <View key={company.id} style={[styles.row, { borderColor: colors.line }]}>
          <View style={styles.colName}>
            <Text style={{ color: colors.ink, fontWeight: '600' }} numberOfLines={1}>{company.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{index === 0 ? 'Morselskap' : 'Datterselskap'}</Text>
          </View>
          {SERIES_KINDS.map((kind) => (
            <View key={kind.id} style={styles.col}>
              {editing ? (
                <RangeInput
                  nativeID={`ic-series-${index}-${kind.id}`}
                  value={draft[company.id]?.[kind.id]}
                  onChange={(range) => setDraft((cur) => ({ ...cur, [company.id]: { ...(cur[company.id] || {}), [kind.id]: range } }))}
                  colors={colors}
                  disabled={busy}
                />
              ) : (
                <Text style={{ color: initial[company.id]?.[kind.id] ? colors.ink : colors.muted }}>
                  {rangeLabel(initial[company.id]?.[kind.id]) || 'Ikke satt'}
                </Text>
              )}
            </View>
          ))}
        </View>
      ))}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}
      {editing ? (
        <View style={styles.actions}>
          <Pressable nativeID="ic-series-suggest" onPress={() => setDraft(suggestSeries(companies.map((row) => row.id)))} style={[styles.btn, { borderColor: colors.line }]}>
            <Ionicons name="sparkles-outline" size={14} color={colors.ink} />
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Foreslå 10 000 per selskap</Text>
          </Pressable>
          <Pressable nativeID="ic-series-save" disabled={busy} onPress={save} style={[styles.btn, { backgroundColor: colors.brand, borderColor: colors.brand, opacity: busy ? 0.6 : 1 }]}>
            <Text style={{ color: colors.onBrand, fontWeight: '600' }}>{busy ? 'Lagrer…' : 'Lagre serier'}</Text>
          </Pressable>
          <Pressable onPress={() => { setEditing(false); setError(''); }} style={[styles.btn, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink }}>Avbryt</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, flexWrap: 'wrap' },
  headerRow: { paddingVertical: 4 },
  colName: { flex: 1.2, minWidth: 140 },
  col: { flex: 1, minWidth: 160, fontSize: 12 },
  range: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: 15, width: 90 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, minHeight: 38, paddingHorizontal: 14, justifyContent: 'center' },
});
