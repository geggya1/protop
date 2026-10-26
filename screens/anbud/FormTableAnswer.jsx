import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addTableRow,
  removeTableRow,
  setTableCell,
  tableRowFilled,
  tableRows,
} from '../../src/anbud/formBuilder';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER } from '../../src/forms/highlight';

/** Bredde der tabellen vises som rutenett. Smalere skjerm får ett kort per rad. */
const GRID_MIN = 620;

function MarkButtons({ column, value, colors, onChange, disabled }) {
  return (
    <View style={styles.marks}>
      {column.options.map((option) => {
        const on = value === option;
        return (
          <TouchableOpacity
            key={option}
            disabled={disabled}
            onPress={() => onChange(on ? '' : option)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${column.label || 'Valg'} ${option}`}
            style={[styles.mark, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : colors.card }]}
          >
            <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12, fontWeight: '600' }}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CheckCell({ value, colors, onChange, disabled, label }) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!value }}
      accessibilityLabel={label}
      style={[styles.check, { borderColor: value ? colors.brand : colors.ink, backgroundColor: value ? colors.brand : colors.card }]}
    >
      {value ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
    </TouchableOpacity>
  );
}

function Cell({ column, row, colors, onCell, readOnly }) {
  const preset = row.preset?.[column.id] || '';
  const value = row.cells?.[column.id];
  if (column.type === 'fixed' && !row.added) {
    return <Text style={[styles.fixed, { color: colors.ink }]}>{preset}</Text>;
  }
  if (column.type === 'mark') {
    return <MarkButtons column={column} value={value} colors={colors} disabled={readOnly} onChange={(next) => onCell(row.id, column.id, next)} />;
  }
  if (column.type === 'check') {
    return <CheckCell value={value === true} colors={colors} disabled={readOnly} label={column.label} onChange={(next) => onCell(row.id, column.id, next)} />;
  }
  if (readOnly) return <Text style={{ color: colors.ink }}>{value || preset || ''}</Text>;
  return (
    <TextInput
      value={value !== undefined ? String(value) : ''}
      onChangeText={(next) => onCell(row.id, column.id, next)}
      placeholder={preset || (column.type === 'date' ? 'dd.mm.åååå' : column.label)}
      placeholderTextColor={colors.placeholder}
      multiline={column.type === 'long'}
      keyboardType={column.type === 'number' ? 'decimal-pad' : 'default'}
      style={[styles.input, column.type === 'long' && styles.inputTall, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
    />
  );
}

export default function FormTableAnswer({ field, colors, onChange, readOnly = false, highlight = true, caption = true }) {
  const [width, setWidth] = useState(0);
  const columns = field?.columns || [];
  const rows = tableRows(field);
  const grid = width >= GRID_MIN;

  function onCell(rowId, columnId, next) {
    onChange(setTableCell(field, rowId, columnId, next));
  }

  const rowBg = (row) => (highlight && !readOnly && !tableRowFilled(field, row) ? FOCUS_FIELD_BG : 'transparent');

  return (
    <View style={{ gap: 6 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {caption ? <Text style={[styles.caption, { color: colors.ink }]}>{field.label}{field.required ? ' *' : ''}</Text> : null}
      {field.help ? <Text style={{ color: colors.muted, fontSize: 12 }}>{field.help}</Text> : null}
      {grid ? (
        <View style={[styles.table, { borderColor: colors.line }]}>
          <View style={[styles.headRow, { backgroundColor: '#1f3b5c' }]}>
            {columns.map((col) => (
              <Text key={col.id} style={[styles.headCell, { flex: col.width || 3 }]} numberOfLines={2}>{col.label}</Text>
            ))}
            {field.allowAdd && !readOnly ? <View style={{ width: 28 }} /> : null}
          </View>
          {rows.map((row) => (row.group ? (
            <View key={row.id} style={[styles.groupRow, { backgroundColor: '#dce6f1' }]}>
              <Text style={{ color: '#14283f', fontWeight: '700' }}>{row.group}</Text>
            </View>
          ) : (
            <View key={row.id} style={[styles.row, { borderBottomColor: colors.line, backgroundColor: rowBg(row) }]}>
              {columns.map((col) => (
                <View key={col.id} style={[styles.cell, { flex: col.width || 3 }, (col.type === 'check' || col.type === 'mark') && styles.center]}>
                  <Cell column={col} row={row} colors={colors} onCell={onCell} readOnly={readOnly} />
                </View>
              ))}
              {field.allowAdd && !readOnly ? (
                <View style={{ width: 28, alignItems: 'center' }}>
                  {row.added ? (
                    <TouchableOpacity onPress={() => onChange(removeTableRow(field, row.id))} accessibilityRole="button" accessibilityLabel="Fjern rad">
                      <Ionicons name="close" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          )))}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {rows.map((row) => {
            if (row.group) {
              return (
                <View key={row.id} style={[styles.groupRow, { backgroundColor: '#dce6f1', borderRadius: 8 }]}>
                  <Text style={{ color: '#14283f', fontWeight: '700' }}>{row.group}</Text>
                </View>
              );
            }
            const titleCols = row.added ? [] : columns.filter((col) => col.type === 'fixed');
            const answerCols = row.added ? columns : columns.filter((col) => col.type !== 'fixed');
            const title = titleCols.map((col) => row.preset?.[col.id]).filter(Boolean).join(' · ');
            return (
              <View
                key={row.id}
                style={[
                  styles.card,
                  {
                    borderColor: rowBg(row) !== 'transparent' ? FOCUS_FIELD_BORDER : colors.line,
                    backgroundColor: rowBg(row) !== 'transparent' ? rowBg(row) : colors.card,
                  },
                ]}
              >
                {title ? <Text style={{ color: colors.ink, fontWeight: '600' }}>{title}</Text> : null}
                {answerCols.map((col) => (
                  <View key={col.id} style={{ gap: 4 }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{col.label}</Text>
                    <Cell column={col} row={row} colors={colors} onCell={onCell} readOnly={readOnly} />
                  </View>
                ))}
                {row.added && !readOnly ? (
                  <TouchableOpacity onPress={() => onChange(removeTableRow(field, row.id))} accessibilityRole="button">
                    <Text style={{ color: colors.danger }}>Fjern rad</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      {field.allowAdd && !readOnly ? (
        <TouchableOpacity onPress={() => onChange(addTableRow(field))} accessibilityRole="button" style={styles.add}>
          <Ionicons name="add" size={16} color={colors.brand} />
          <Text style={{ color: colors.brand }}>Legg til rad</Text>
        </TouchableOpacity>
      ) : null}
      {field.legend ? <Text style={{ color: colors.muted, fontSize: 12 }}>{field.legend}</Text> : null}
      {!columns.length ? <Text style={{ color: colors.muted }}>Tabellen har ingen kolonner.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 15, fontWeight: '600' },
  table: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 6, gap: 6 },
  headCell: { color: '#fff', fontWeight: '600', fontSize: 12 },
  groupRow: { paddingHorizontal: 8, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { minWidth: 0 },
  center: { alignItems: 'center' },
  fixed: { fontSize: 13, lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, fontSize: 13, minHeight: 30 },
  inputTall: { minHeight: 52, textAlignVertical: 'top' },
  marks: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  mark: { minWidth: 28, height: 28, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  check: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 6 },
});
