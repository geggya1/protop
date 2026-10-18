import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { periodLabel } from '../../src/indeksregulering/engine';
import { formatMoney } from '../../src/indeksregulering/letter';

function cell(value) {
  const text = String(value || '').trim();
  return text || '—';
}

export default function IndexLetterTable({
  rows = [],
  colors,
  title = 'Indeksreguleringer',
  empty = 'Ingen indeksreguleringer er lagret ennå.',
}) {
  const [openId, setOpenId] = useState('');
  return (
    <View nativeID="index-letter-table" style={{ gap: 8 }}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>{title}</Text>
      {!rows.length ? <Text style={{ color: colors.muted }}>{empty}</Text> : null}
      {rows.length ? (
        <View style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View style={[styles.row, styles.head, { borderBottomColor: colors.line }]}>
            {['Dato', 'Avtale', 'Fra', 'Til', 'Økning', 'Brev'].map((label) => (
              <Text key={label} style={[styles.cell, { color: colors.muted, fontSize: 12 }]}>{label}</Text>
            ))}
          </View>
          {rows.map((row) => {
            const open = openId === `${row.contractId}:${row.id}`;
            return (
              <View key={`${row.contractId}:${row.id}`} style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <TouchableOpacity
                  onPress={() => setOpenId(open ? '' : `${row.contractId}:${row.id}`)}
                  accessibilityRole="button"
                  style={styles.row}
                >
                  <Text style={[styles.cell, { color: colors.ink }]}>{cell(row.savedAt)}</Text>
                  <Text style={[styles.cell, { color: colors.ink }]} numberOfLines={2}>{cell(row.contractTitle)}</Text>
                  <Text style={[styles.cell, { color: colors.ink }]}>{periodLabel(row.fromPeriod)}</Text>
                  <Text style={[styles.cell, { color: colors.ink }]}>{periodLabel(row.toPeriod)}</Text>
                  <Text style={[styles.cell, { color: colors.ink }]}>{formatMoney(row.increase)} kr</Text>
                  <Text style={[styles.cell, { color: colors.brand }]}>{row.letterPlain ? (open ? 'Skjul' : 'Vis') : '—'}</Text>
                </TouchableOpacity>
                {open && row.letterPlain ? (
                  <Text selectable style={{ color: colors.ink, lineHeight: 20, padding: 10 }}>{row.letterPlain}</Text>
                ) : null}
                {row.sentAt ? (
                  <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 10, paddingBottom: 8 }}>
                    Sendt {row.sentAt}{row.sentTo ? ` til ${row.sentTo}` : ''}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8 },
  head: { borderBottomWidth: 1 },
  cell: { flex: 1, fontSize: 13, paddingRight: 6 },
});
