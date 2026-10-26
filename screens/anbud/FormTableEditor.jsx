import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  TABLE_COLUMN_TYPES,
  tableColumn,
  tableRow,
} from '../../src/anbud/formBuilder';

function move(list, index, delta) {
  const next = list.slice();
  const to = index + delta;
  if (to < 0 || to >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
}

/** Linjer → rader. «# Overskrift» eller en linje som slutter på kolon blir mellomoverskrift. */
export function rowsFromLines(textValue, columnId) {
  return String(textValue || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const group = line.match(/^#\s*(.+)$/) || line.match(/^(.{2,80}):$/);
      if (group) return tableRow(group[1].trim());
      return tableRow({ [columnId]: line.replace(/^(?:[-•*]|\d+[.)])\s+/, '') });
    });
}

export default function FormTableEditor({ field, colors, onPatch }) {
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const columns = field.columns || [];
  const rows = field.rows || [];
  const presetColumns = columns.filter((col) => col.type !== 'check' && col.type !== 'mark');
  const firstFixed = columns.find((col) => col.type === 'fixed') || presetColumns[0];

  function setColumns(next) {
    onPatch({ columns: next });
  }

  function patchColumn(index, part) {
    setColumns(columns.map((col, i) => (i === index ? { ...col, ...part } : col)));
  }

  function cycleType(index) {
    const col = columns[index];
    const order = TABLE_COLUMN_TYPES.map((row) => row.id);
    const type = order[(order.indexOf(col.type) + 1) % order.length];
    patchColumn(index, {
      type,
      options: type === 'mark' ? (col.options?.length >= 2 ? col.options : ['J', 'N', 'I']) : [],
      width: type === 'mark' ? 2 : (type === 'check' ? 1 : (type === 'fixed' ? 4 : 3)),
    });
  }

  function patchRow(index, part) {
    onPatch({ rows: rows.map((row, i) => (i === index ? { ...row, ...part } : row)) });
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.kicker, { color: colors.muted }]}>Kolonner</Text>
      {columns.map((col, index) => {
        const meta = TABLE_COLUMN_TYPES.find((row) => row.id === col.type);
        return (
          <View key={col.id} style={[styles.colRow, { borderColor: colors.line }]}>
            <TextInput
              value={col.label}
              onChangeText={(label) => patchColumn(index, { label })}
              placeholder="Kolonnenavn"
              placeholderTextColor={colors.placeholder}
              style={[styles.line, { color: colors.ink, borderBottomColor: colors.line }]}
            />
            <TouchableOpacity onPress={() => cycleType(index)} accessibilityRole="button" accessibilityLabel={`Kolonnetype ${meta?.label}`} style={[styles.chip, { backgroundColor: colors.sunken }]}>
              <Text style={{ color: colors.ink, fontSize: 12 }}>{meta?.label || col.type}</Text>
            </TouchableOpacity>
            {col.type === 'mark' ? (
              <TextInput
                value={(col.options || []).join(', ')}
                onChangeText={(value) => patchColumn(index, { options: value.split(',').map((row) => row.trim()).filter(Boolean).slice(0, 6) })}
                placeholder="J, N, I"
                placeholderTextColor={colors.placeholder}
                style={[styles.options, { color: colors.ink, borderBottomColor: colors.line }]}
              />
            ) : null}
            <TouchableOpacity onPress={() => setColumns(move(columns, index, -1))} accessibilityRole="button" accessibilityLabel="Flytt kolonne til venstre">
              <Ionicons name="arrow-back" size={16} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setColumns(move(columns, index, 1))} accessibilityRole="button" accessibilityLabel="Flytt kolonne til høyre">
              <Ionicons name="arrow-forward" size={16} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setColumns(columns.filter((_, i) => i !== index))} accessibilityRole="button" accessibilityLabel={`Slett kolonne ${col.label}`}>
              <Ionicons name="close" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        );
      })}
      {columns.length < MAX_TABLE_COLUMNS ? (
        <TouchableOpacity onPress={() => setColumns([...columns, tableColumn('text', 'Ny kolonne')])} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Legg til kolonne</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 12 }}>Trykk på typen for å bytte. «Fast tekst» står i malen. «Ett av valgene» gir små knapper, for eksempel J, N og I.</Text>

      <Text style={[styles.kicker, { color: colors.muted, marginTop: 6 }]}>Rader i malen ({rows.length})</Text>
      {rows.map((row, index) => (
        <View key={row.id} style={styles.rowLine}>
          {typeof row.group === 'string' && !row.cells ? (
            <TextInput
              value={row.group}
              onChangeText={(group) => patchRow(index, { group })}
              placeholder="Mellomoverskrift"
              placeholderTextColor={colors.placeholder}
              style={[styles.line, styles.groupInput, { color: colors.ink, borderBottomColor: colors.line, backgroundColor: '#dce6f1' }]}
            />
          ) : (
            presetColumns.map((col) => (
              <TextInput
                key={col.id}
                value={row.cells?.[col.id] || ''}
                onChangeText={(value) => patchRow(index, { cells: { ...(row.cells || {}), [col.id]: value } })}
                placeholder={col.type === 'fixed' ? col.label : `${col.label} (forhåndsutfylt)`}
                placeholderTextColor={colors.placeholder}
                multiline={col.type === 'fixed'}
                style={[styles.line, { flex: col.width || 3, color: colors.ink, borderBottomColor: colors.line }]}
              />
            ))
          )}
          <TouchableOpacity onPress={() => onPatch({ rows: move(rows, index, -1) })} accessibilityRole="button" accessibilityLabel="Flytt rad opp">
            <Ionicons name="arrow-up" size={16} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onPatch({ rows: move(rows, index, 1) })} accessibilityRole="button" accessibilityLabel="Flytt rad ned">
            <Ionicons name="arrow-down" size={16} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onPatch({ rows: rows.filter((_, i) => i !== index) })} accessibilityRole="button" accessibilityLabel="Slett rad">
            <Ionicons name="close" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ))}
      {rows.length < MAX_TABLE_ROWS ? (
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => onPatch({ rows: [...rows, tableRow({})] })} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Legg til rad</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onPatch({ rows: [...rows, tableRow('Ny mellomoverskrift')] })} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Legg til mellomoverskrift</Text>
          </TouchableOpacity>
          {firstFixed ? (
            <TouchableOpacity onPress={() => setPasteOpen((open) => !open)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Lim inn mange rader</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {pasteOpen && firstFixed ? (
        <View style={{ gap: 6 }}>
          <TextInput
            value={paste}
            onChangeText={setPaste}
            multiline
            placeholder={'Én linje per rad i «' + (firstFixed.label || 'kolonne') + '».\n# Overskrift gir mellomoverskrift.'}
            placeholderTextColor={colors.placeholder}
            style={[styles.paste, { color: colors.ink, borderColor: colors.line }]}
          />
          <TouchableOpacity
            onPress={() => {
              const added = rowsFromLines(paste, firstFixed.id);
              onPatch({ rows: [...rows, ...added].slice(0, MAX_TABLE_ROWS) });
              setPaste('');
              setPasteOpen(false);
            }}
            accessibilityRole="button"
            style={[styles.pasteButton, { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: '#fff' }}>Legg til radene</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Text style={{ color: colors.ink }}>Utfyller kan legge til rader</Text>
        <Switch value={field.allowAdd !== false} onValueChange={(allowAdd) => onPatch({ allowAdd })} />
      </View>
      <TextInput
        value={field.legend || ''}
        onChangeText={(legend) => onPatch({ legend })}
        placeholder="Forklaring under tabellen, for eksempel J = Utbedret · N = Ikke utbedret · I = Ikke relevant"
        placeholderTextColor={colors.placeholder}
        style={[styles.line, { color: colors.ink, borderBottomColor: colors.line }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  colRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  line: { flex: 1, minWidth: 80, borderBottomWidth: 1, paddingVertical: 4, fontSize: 14 },
  groupInput: { fontWeight: '700', paddingHorizontal: 6 },
  options: { width: 110, borderBottomWidth: 1, paddingVertical: 4, fontSize: 14 },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  paste: { minHeight: 120, borderWidth: 1, borderRadius: 10, padding: 8, fontSize: 14, textAlignVertical: 'top' },
  pasteButton: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
});
