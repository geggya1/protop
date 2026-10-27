import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import OptionPicker from '../../components/OptionPicker';

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

/** Ett valg. Felles velger: knapper ved 1–4 valg, nedtrekk ved 5 eller flere. */
export function ChoiceChips({ options, value, onChange, disabled = false, title = '' }) {
  return (
    <OptionPicker
      options={options}
      value={value}
      onChange={(id) => { if (id !== '' && id != null) onChange(id); }}
      clearable={false}
      disabled={disabled}
      title={title}
    />
  );
}

const NOBODY = '__ingen__';

/**
 * Velg personer (uid og navn). multiple gir flervalg.
 * emptyLabel er et eget valg for «ingen valgt», for eksempel «Administrator» som godkjenner.
 */
export function PersonChips({ colors, people, value, onChange, multiple = false, emptyLabel = '', disabled = false, title = '' }) {
  if (!people.length) {
    return <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen ansatte med brukerkonto ennå. Inviter dem under Ansatte.</Text>;
  }
  const byUid = new Map(people.map((row) => [row.uid, row]));
  const options = people.map((row) => ({ id: row.uid, label: row.name }));
  if (multiple) {
    return (
      <OptionPicker
        options={options}
        value={(value || []).map((row) => row.uid)}
        onChange={(ids) => onChange(ids.map((id) => byUid.get(id)).filter(Boolean))}
        multiple
        placeholder="Ingen valgt"
        disabled={disabled}
        title={title}
      />
    );
  }
  const list = emptyLabel ? [{ id: NOBODY, label: emptyLabel }, ...options] : options;
  return (
    <OptionPicker
      options={list}
      value={value?.uid || (emptyLabel ? NOBODY : '')}
      onChange={(id) => {
        if (!id || id === NOBODY) onChange({ uid: '', name: '' });
        else if (byUid.has(id)) onChange(byUid.get(id));
      }}
      clearable={false}
      placeholder="Velg person"
      disabled={disabled}
      title={title}
    />
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
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 4 },
});
