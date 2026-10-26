import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import { HrChip } from '../hr/HrShared';

export const OK_INK = '#1d7a3e';

export function dateText(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Dato som «2027-01-11» vist som «11. jan. 2027». */
export function dayText(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key || '')) ? dateText(`${key}T12:00:00`) : '';
}

export function StatusChip({ status, colors }) {
  const tone = status?.tone || 'info';
  const look = tone === 'ok'
    ? { backgroundColor: '#e3f4e8', borderColor: '#9fd3ae', color: OK_INK }
    : tone === 'warn'
      ? { backgroundColor: FOCUS_FIELD_BG, borderColor: FOCUS_FIELD_BORDER, color: FOCUS_FIELD_INK }
      : { backgroundColor: colors.sunken || colors.bg, borderColor: colors.line, color: colors.muted };
  return (
    <View style={[styles.chip, { backgroundColor: look.backgroundColor, borderColor: look.borderColor }]}>
      <Text style={{ color: look.color, fontSize: 12, fontWeight: '600' }}>{status?.label || ''}</Text>
    </View>
  );
}

const HEAD_ROWS = [
  [['Dokument-ID', 'docId'], ['Versjon', 'version'], ['Opprettet', 'created'], ['Sist endret', 'changed']],
  [['Dokumenteier', 'owner'], ['Godkjent av', 'approvedBy'], ['Godkjent', 'approved'], null],
];

/** Dokumenthodet slik det står øverst i PDF-en. Beregnes av dokumentstyringen og kan ikke skrives inn. */
export function HeaderGrid({ header, colors }) {
  if (!header) return null;
  return (
    <View style={[styles.grid, { borderColor: colors.line }]}>
      {HEAD_ROWS.map((row, r) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={r} style={styles.gridRow}>
          {row.map((cell, c) => (
            // eslint-disable-next-line react/no-array-index-key
            <View key={c} style={[styles.cell, { borderColor: colors.line }]}>
              {cell ? (
                <>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{cell[0]}</Text>
                  <Text style={{ color: header[cell[1]] ? colors.ink : colors.muted, fontWeight: '600' }}>{header[cell[1]] || '–'}</Text>
                </>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function ChoiceChips({ colors, options, value, onChange, disabled = false }) {
  return (
    <View style={styles.chips}>
      {options.map((row) => (
        <HrChip key={row.id} colors={colors} label={row.label} active={row.id === value} onPress={disabled ? undefined : () => onChange(row.id)} />
      ))}
    </View>
  );
}

/** Velg personer (uid og navn). multiple gir flervalg. */
export function PersonChips({ colors, people, value, onChange, multiple = false, emptyLabel = '', disabled = false }) {
  const picked = new Set((multiple ? value || [] : [value].filter(Boolean)).map((row) => row.uid));
  function toggle(person) {
    if (disabled) return;
    if (!multiple) {
      onChange(picked.has(person.uid) ? { uid: '', name: '' } : person);
      return;
    }
    onChange(picked.has(person.uid) ? value.filter((row) => row.uid !== person.uid) : [...(value || []), person]);
  }
  return (
    <View style={styles.chips}>
      {emptyLabel && !multiple ? (
        <HrChip colors={colors} label={emptyLabel} active={!picked.size} onPress={disabled ? undefined : () => onChange({ uid: '', name: '' })} />
      ) : null}
      {people.map((person) => (
        <HrChip key={person.uid} colors={colors} label={person.name} active={picked.has(person.uid)} onPress={disabled ? undefined : () => toggle(person)} />
      ))}
      {!people.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen ansatte med brukerkonto ennå. Inviter dem under Ansatte.</Text> : null}
    </View>
  );
}

export function Label({ colors, children }) {
  return <Text style={[styles.label, { color: colors.muted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  grid: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { flexGrow: 1, flexBasis: 120, paddingHorizontal: 8, paddingVertical: 5, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, gap: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 4 },
});
