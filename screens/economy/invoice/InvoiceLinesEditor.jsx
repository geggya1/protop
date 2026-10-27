/**
 * Rediger fakturalinjer i et utkast: periode, tekst, antall, enhet, pris, påslag, rabatt
 * og konto med mva. Linjer kan flyttes, kopieres, slettes og legges til.
 * Adm.-kostnaden beregnes av innstillingene og er låst.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptionPicker from '../../../components/OptionPicker';
import {
  LINE_SECTIONS,
  LINE_UNITS,
  emptyManualLine,
  newLineId,
  normalizeLine,
  sectionsOf,
} from '../../../src/economy/invoiceLines.js';
import { accountOptionLabel } from '../../../src/economy/companyChart.js';
import { vatCodeForAccount } from '../../../src/economy/invoiceDraft.js';
import { Button } from '../billing/ui';

function numText(value) {
  if (value === '' || value == null) return '';
  return String(value).replace('.', ',');
}

function parseNum(value) {
  const raw = String(value ?? '').replace(/\s/g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  return (Number(value) || 0).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Tekstfelt som viser det som skrives mens feltet er i bruk, så «10,» ikke blir «10». */
function Cell({ value, onChange, colors, width, flex, align = 'left', editable = true, label, placeholder = '' }) {
  const [draft, setDraft] = useState(null);
  return (
    <TextInput
      value={draft ?? value}
      onChangeText={(text) => {
        setDraft(text);
        onChange(text);
      }}
      onBlur={() => setDraft(null)}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      accessibilityLabel={label}
      style={[
        styles.cell,
        { width, flex: width ? undefined : (flex || 1), textAlign: align, borderColor: colors.line, color: colors.ink, backgroundColor: editable ? colors.card : (colors.sunken || colors.bg) },
      ]}
    />
  );
}

export default function InvoiceLinesEditor({ lines = [], onChange, colors, chart = [], stacked = false }) {
  const accounts = (chart || []).filter((row) => row.kind === 'sale');
  const accountOptions = accounts.map((row) => ({ id: row.code, label: accountOptionLabel(row) }));

  function update(id, patch) {
    onChange(lines.map((line) => (line.id === id ? normalizeLine({ ...line, ...patch }) : line)));
  }

  function remove(id) {
    onChange(lines.filter((line) => line.id !== id));
  }

  function copy(id) {
    const index = lines.findIndex((line) => line.id === id);
    if (index < 0) return;
    const source = lines[index];
    const clone = normalizeLine({
      ...source,
      id: newLineId('man'),
      manual: true,
      locked: false,
      timeEntryIds: [],
      expenseIds: [],
      tripIds: [],
      saleIds: [],
    });
    onChange([...lines.slice(0, index + 1), clone, ...lines.slice(index + 1)]);
  }

  function move(id, step) {
    const index = lines.findIndex((line) => line.id === id);
    const target = index + step;
    if (index < 0 || target < 0 || target >= lines.length) return;
    const next = [...lines];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    onChange(next);
  }

  function add(section) {
    const account = section === 'expenses' || section === 'trips' || section === 'products' ? '3001' : '3000';
    onChange([...lines, emptyManualLine(section, { account, vatCode: vatCodeForAccount(account, chart) })]);
  }

  const sections = sectionsOf(lines);

  return (
    <View style={{ gap: 16 }}>
      {sections.map((section) => (
        <View key={section.id} style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{section.label}</Text>
          {!stacked ? (
            <View style={styles.head}>
              {[
                ['Start', 96], ['Slutt', 96], ['Tekst', 0], ['Antall', 70], ['Enhet', 70], ['Enhetspris', 96],
                ['Påslag %', 70], ['Rabatt %', 70], ['Totalt eks. mva', 110], ['Mva / konto', 220], ['', 96],
              ].map(([label, width]) => (
                <Text key={label || 'actions'} style={[styles.headCell, { color: colors.muted, width: width || undefined, flex: width ? undefined : 1 }]}>{label}</Text>
              ))}
            </View>
          ) : null}
          {section.lines.map((line) => {
            const locked = line.locked;
            const fromWork = !line.manual && (line.timeEntryIds.length || line.expenseIds.length || line.tripIds.length || line.saleIds.length);
            const actions = (
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => move(line.id, -1)} accessibilityLabel="Flytt opp" hitSlop={6}>
                  <Ionicons name="arrow-up" size={16} color={colors.muted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => move(line.id, 1)} accessibilityLabel="Flytt ned" hitSlop={6}>
                  <Ionicons name="arrow-down" size={16} color={colors.muted} />
                </TouchableOpacity>
                {!locked ? (
                  <TouchableOpacity onPress={() => copy(line.id)} accessibilityLabel="Kopier linjen" hitSlop={6}>
                    <Ionicons name="copy-outline" size={16} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => remove(line.id)}
                  accessibilityLabel={fromWork ? 'Fjern linjen. Postene går tilbake til Til fakturering.' : 'Slett linjen'}
                  hitSlop={6}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger || '#b42318'} />
                </TouchableOpacity>
              </View>
            );
            const picker = (
              <View style={{ width: stacked ? undefined : 220, flex: stacked ? 1 : undefined }}>
                <OptionPicker
                  options={accountOptions}
                  value={line.account}
                  onChange={(code) => code && update(line.id, { account: code, vatCode: vatCodeForAccount(code, chart) })}
                  clearable={false}
                  chipLimit={1}
                  small
                  disabled={locked}
                  accessibilityLabel="Mva og konto"
                />
              </View>
            );
            const fields = [
              <Cell key="ps" label="Start" value={line.periodStart} onChange={(v) => update(line.id, { periodStart: v })} colors={colors} width={stacked ? undefined : 96} placeholder="åååå-mm-dd" editable={!locked} />,
              <Cell key="pe" label="Slutt" value={line.periodEnd} onChange={(v) => update(line.id, { periodEnd: v })} colors={colors} width={stacked ? undefined : 96} placeholder="åååå-mm-dd" editable={!locked} />,
              <Cell key="tx" label="Tekst" value={line.description} onChange={(v) => update(line.id, { description: v })} colors={colors} flex={1} editable={!locked} />,
              <Cell key="qt" label="Antall" value={numText(line.quantity)} onChange={(v) => update(line.id, { quantity: parseNum(v) })} colors={colors} width={stacked ? undefined : 70} align="right" editable={!locked} />,
            ];
            const unit = (
              <View key="un" style={{ width: stacked ? undefined : 70, flex: stacked ? 1 : undefined }}>
                <OptionPicker
                  options={LINE_UNITS}
                  value={line.unit}
                  onChange={(id) => id && update(line.id, { unit: id })}
                  clearable={false}
                  chipLimit={1}
                  small
                  disabled={locked}
                  accessibilityLabel="Enhet"
                />
              </View>
            );
            const rest = [
              <Cell key="up" label="Enhetspris" value={numText(line.unitPrice)} onChange={(v) => update(line.id, { unitPrice: parseNum(v) })} colors={colors} width={stacked ? undefined : 96} align="right" editable={!locked} />,
              <Cell key="mk" label="Påslag %" value={numText(line.markupPercent || '')} onChange={(v) => update(line.id, { markupPercent: parseNum(v) || 0 })} colors={colors} width={stacked ? undefined : 70} align="right" editable={!locked} />,
              <Cell key="dc" label="Rabatt %" value={numText(line.discountPercent || '')} onChange={(v) => update(line.id, { discountPercent: parseNum(v) || 0 })} colors={colors} width={stacked ? undefined : 70} align="right" editable={!locked} />,
              <Text key="sum" style={[styles.sum, { width: stacked ? undefined : 110, color: colors.ink }]}>{money(line.amountExVat)}</Text>,
            ];
            if (stacked) {
              return (
                <View key={line.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
                  {fields[2]}
                  <View style={styles.cardRow}>{fields[0]}{fields[1]}</View>
                  <View style={styles.cardRow}>{fields[3]}{unit}{rest[0]}</View>
                  <View style={styles.cardRow}>{rest[1]}{rest[2]}{rest[3]}</View>
                  <View style={styles.cardRow}>{picker}{actions}</View>
                  {locked ? <Text style={{ color: colors.muted, fontSize: 12 }}>Beregnes fra innstillingene for adm.-kostnader.</Text> : null}
                </View>
              );
            }
            return (
              <View key={line.id} style={[styles.row, { borderBottomColor: colors.line }]}>
                {fields}
                {unit}
                {rest}
                {picker}
                <View style={{ width: 96 }}>{actions}</View>
              </View>
            );
          })}
          <Text style={{ color: colors.ink, fontWeight: '700', alignSelf: 'flex-end' }}>
            {`Totalt ${money(section.amountExVat)}`}
          </Text>
        </View>
      ))}
      <View style={styles.addRow}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Legg til fakturalinje:</Text>
        {LINE_SECTIONS.filter((row) => row.id !== 'admin').map((row) => (
          <Button key={row.id} label={row.label} icon="add" tone="ghost" small colors={colors} onPress={() => add(row.id)} nativeID={`invoice-add-line-${row.id}`} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 6, paddingBottom: 4 },
  headCell: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 6, fontSize: 13, minWidth: 0 },
  sum: { textAlign: 'right', fontWeight: '600', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'flex-end' },
  card: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  cardRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
