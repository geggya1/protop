import React, { useState } from 'react';
import {
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import {
  EARNINGS_GROUPS,
  VARIABLE_FIELDS,
  addCustomVariable,
  addStandardLine,
  removeCustomVariable,
  removeStandardLine,
  setVariable,
  updateCustomVariable,
  updateStandardLine,
} from '../../src/economy/earnings';

function parsePlain(text) {
  const n = Number(String(text ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function formatPlain(value) {
  return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function FieldInput({ value, onCommit, colors, nativeID, label, editable = true }) {
  const [text, setText] = useState(formatPlain(value));
  React.useEffect(() => { setText(formatPlain(value)); }, [value]);
  if (!editable) {
    return <Text style={{ color: colors.ink, width: 120, textAlign: 'right' }}>{formatPlain(value)}</Text>;
  }
  return (
    <TextInput
      nativeID={nativeID}
      value={text}
      onChangeText={setText}
      onBlur={() => onCommit(parsePlain(text))}
      accessibilityLabel={label}
      keyboardType="decimal-pad"
      style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
    />
  );
}

function displayValue(unit, value) {
  if (unit === 'percent') return (Number(value) || 0) * 100;
  return Number(value) || 0;
}

function storedValue(unit, value) {
  return unit === 'percent' ? value / 100 : value;
}

export default function EarningsSettings({ settings, canEdit = false, onChange, colors }) {
  const [label, setLabel] = useState('');
  const [unit, setUnit] = useState('amount');
  const [value, setValue] = useState('');
  const [lineLabel, setLineLabel] = useState('');
  const [lineGroup, setLineGroup] = useState('overhead');
  const [lineKind, setLineKind] = useState('input');
  const [lineAmount, setLineAmount] = useState('');
  const [lineBase, setLineBase] = useState('direct');

  function commitBuiltIn(field, number) {
    onChange(setVariable(settings, field.id, storedValue(field.unit, number)));
  }

  function addVariable() {
    const name = label.trim();
    if (!name) return;
    onChange(addCustomVariable(settings, {
      label: name,
      unit,
      value: storedValue(unit, parsePlain(value)),
    }));
    setLabel('');
    setValue('');
  }

  function addLine() {
    const name = lineLabel.trim();
    if (!name) return;
    onChange(addStandardLine(settings, {
      label: name,
      group: lineGroup,
      kind: lineKind,
      defaultAmount: lineKind === 'percent' ? 0 : parsePlain(lineAmount),
      percent: lineKind === 'percent' ? parsePlain(lineAmount) / 100 : null,
      base: lineBase,
    }));
    setLineLabel('');
    setLineAmount('');
  }

  return (
    <View nativeID="earnings-settings" style={styles.wrap}>
      <Text style={[styles.title, { color: colors.ink }]}>Variabler</Text>
      <Text style={{ color: colors.muted, lineHeight: 18 }}>
        Her setter bedriften satser som gjelder alle. Lønn, stilling og timer hentes fra systemet og kan ikke skrives inn her.
      </Text>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        {VARIABLE_FIELDS.map((field) => (
          <View key={field.id} style={styles.line}>
            <View style={styles.grow}>
              <Text style={{ color: colors.ink }}>{field.label}</Text>
              {field.hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{field.hint}</Text> : null}
            </View>
            <FieldInput
              value={displayValue(field.unit, settings.variables[field.id])}
              colors={colors}
              editable={canEdit}
              nativeID={`earnings-var-${field.id}`}
              label={field.label}
              onCommit={(number) => commitBuiltIn(field, number)}
            />
            <Text style={{ color: colors.muted, width: 28 }}>{field.unit === 'percent' ? '%' : ''}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.group, { color: colors.ink }]}>Egne variabler</Text>
        {(settings.customVariables || []).map((row) => (
          <View key={row.id} nativeID={`earnings-custom-${row.id}`} style={styles.line}>
            <Text style={[styles.grow, { color: colors.ink }]}>{row.label}</Text>
            <FieldInput
              value={displayValue(row.unit, row.value)}
              colors={colors}
              editable={canEdit}
              nativeID={`earnings-custom-value-${row.id}`}
              label={row.label}
              onCommit={(number) => onChange(updateCustomVariable(settings, row.id, { value: storedValue(row.unit, number) }))}
            />
            {canEdit ? (
              <TouchableOpacity onPress={() => onChange(removeCustomVariable(settings, row.id))} accessibilityRole="button" accessibilityLabel={`Fjern ${row.label}`}>
                <Text style={{ color: colors.danger || '#b42318' }}>Fjern</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {!settings.customVariables?.length ? <Text style={{ color: colors.muted }}>Ingen egne variabler.</Text> : null}
        {canEdit ? (
          <View style={styles.gap}>
            <TextInput
              nativeID="earnings-new-variable"
              value={label}
              onChangeText={setLabel}
              placeholder="Navn på variabel"
              placeholderTextColor={colors.placeholder}
              style={[styles.text, { color: colors.ink, borderColor: colors.line }]}
            />
            <View style={styles.row}>
              {[
                ['amount', 'Beløp'],
                ['percent', 'Prosent'],
                ['number', 'Tall'],
              ].map(([id, name]) => (
                <TouchableOpacity key={id} onPress={() => setUnit(id)} accessibilityRole="button" style={[styles.chip, { borderColor: unit === id ? colors.brand : colors.line }]}>
                  <Text style={{ color: unit === id ? colors.brand : colors.ink }}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <FieldInput value={parsePlain(value)} colors={colors} nativeID="earnings-new-variable-value" label="Verdi" onCommit={(number) => setValue(String(number))} />
            <TouchableOpacity nativeID="earnings-add-variable" onPress={addVariable} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
              <Text style={styles.primaryText}>Legg til variabel</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.group, { color: colors.ink }]}>Standardfelt for alle</Text>
        {settings.standardLines.map((row) => (
          <View key={row.id} nativeID={`earnings-standard-${row.id}`} style={[styles.line, !row.enabled && { opacity: 0.45 }]}>
            <View style={styles.grow}>
              <Text style={{ color: colors.ink }}>{row.label}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {EARNINGS_GROUPS.find((group) => group.id === row.group)?.label || row.group}
                {row.kind === 'formula' ? ' · formel' : row.kind === 'salary' ? ' · fra lønn' : row.kind === 'percent' ? ` · ${formatPlain((row.percent || 0) * 100)} %` : ''}
              </Text>
            </View>
            {row.kind === 'input' ? (
              <FieldInput
                value={row.defaultAmount}
                colors={colors}
                editable={canEdit}
                nativeID={`earnings-standard-amount-${row.id}`}
                label={row.label}
                onCommit={(number) => onChange(updateStandardLine(settings, row.id, { defaultAmount: number }))}
              />
            ) : null}
            {canEdit ? (
              <TouchableOpacity
                onPress={() => onChange(updateStandardLine(settings, row.id, { enabled: !row.enabled }))}
                accessibilityRole="button"
                accessibilityLabel={row.enabled ? `Skjul ${row.label} for alle` : `Vis ${row.label} for alle`}
              >
                <Text style={{ color: colors.brand }}>{row.enabled ? 'I bruk' : 'Av'}</Text>
              </TouchableOpacity>
            ) : null}
            {canEdit && !row.locked ? (
              <TouchableOpacity onPress={() => onChange(removeStandardLine(settings, row.id))} accessibilityRole="button" accessibilityLabel={`Slett ${row.label}`}>
                <Text style={{ color: colors.danger || '#b42318' }}>Slett</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {canEdit ? (
          <View style={styles.gap}>
            <TextInput
              nativeID="earnings-new-line"
              value={lineLabel}
              onChangeText={setLineLabel}
              placeholder="Nytt standardfelt"
              placeholderTextColor={colors.placeholder}
              style={[styles.text, { color: colors.ink, borderColor: colors.line }]}
            />
            <View style={styles.row}>
              {EARNINGS_GROUPS.map((group) => (
                <TouchableOpacity key={group.id} onPress={() => setLineGroup(group.id)} accessibilityRole="button" style={[styles.chip, { borderColor: lineGroup === group.id ? colors.brand : colors.line }]}>
                  <Text style={{ color: lineGroup === group.id ? colors.brand : colors.ink, fontSize: 12 }}>{group.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => setLineKind('input')} accessibilityRole="button" style={[styles.chip, { borderColor: lineKind === 'input' ? colors.brand : colors.line }]}>
                <Text style={{ color: lineKind === 'input' ? colors.brand : colors.ink }}>Beløp</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLineKind('percent')} accessibilityRole="button" style={[styles.chip, { borderColor: lineKind === 'percent' ? colors.brand : colors.line }]}>
                <Text style={{ color: lineKind === 'percent' ? colors.brand : colors.ink }}>Prosent</Text>
              </TouchableOpacity>
            </View>
            {lineKind === 'percent' ? (
              <View style={styles.row}>
                {[
                  ['salary', 'Av lønn'],
                  ['direct', 'Av direkte kostnad'],
                  ['holiday', 'Av feriepenger'],
                ].map(([id, name]) => (
                  <TouchableOpacity key={id} onPress={() => setLineBase(id)} accessibilityRole="button" style={[styles.chip, { borderColor: lineBase === id ? colors.brand : colors.line }]}>
                    <Text style={{ color: lineBase === id ? colors.brand : colors.ink, fontSize: 12 }}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <FieldInput value={parsePlain(lineAmount)} colors={colors} nativeID="earnings-new-line-amount" label="Standardsats" onCommit={(number) => setLineAmount(String(number))} />
            <TouchableOpacity nativeID="earnings-add-line" onPress={addLine} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
              <Text style={styles.primaryText}>Legg til standardfelt</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, width: '100%' },
  title: { fontSize: 22, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  group: { fontSize: 16, fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 160 },
  input: { width: 120, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#fff4cc', textAlign: 'right' },
  text: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  gap: { gap: 8 },
  primary: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  primaryText: { color: '#fff', fontWeight: '700' },
});
