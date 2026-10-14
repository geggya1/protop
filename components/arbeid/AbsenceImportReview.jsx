import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { reviewHeadline } from '../../src/imports/review';
import { formatDate } from '../../src/economy/invoices.js';
import { formatHours } from '../../src/arbeid/hours.js';
import { suggestEmployees } from '../../src/arbeid/absenceImport.js';
import { displayName } from '../../src/employees/model.js';

const AMBER = '#9a6700';

function ActionBar({ colors, busy, readyCount, onCancel, onConfirm }) {
  return (
    <View style={styles.actions} nativeID="absence-import-actions">
      <TouchableOpacity
        onPress={onCancel}
        accessibilityRole="button"
        style={[styles.btn, { borderColor: colors.line, backgroundColor: colors.card }]}
      >
        <Text style={{ color: colors.ink }}>Avbryt</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onConfirm}
        disabled={busy || !readyCount}
        accessibilityRole="button"
        accessibilityLabel={`Importer ${readyCount} fraværsdager`}
        nativeID="absence-import-confirm"
        style={[styles.btnPrimary, { backgroundColor: colors.brand, opacity: busy || !readyCount ? 0.6 : 1 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {busy ? 'Lagrer…' : `Importer ${readyCount} fraværsdager`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function OkTable({ colors, rows, pageSize, onMore, onToggleRow }) {
  if (!rows.length) return null;
  return (
    <View style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="absence-import-ok-table">
      <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
        {['Dato', 'Medarbeider', 'Type', 'Timer', 'Beskrivelse', ''].map((label) => (
          <Text key={label || 'act'} style={[styles.th, { color: colors.muted }]}>{label}</Text>
        ))}
      </View>
      {rows.slice(0, pageSize).map((row, index) => (
        <View
          key={row.id}
          style={[
            styles.tr,
            {
              borderBottomColor: colors.line,
              backgroundColor: index % 2 ? (colors.sunken || colors.bg) : colors.card,
              opacity: row.included ? 1 : 0.5,
            },
          ]}
        >
          <Text style={[styles.td, styles.dateCol, { color: colors.ink }]}>{formatDate(row.date)}</Text>
          <Text style={[styles.td, { color: colors.ink }]} numberOfLines={2}>{row.employeeName || '—'}</Text>
          <Text style={[styles.td, { color: colors.ink }]} numberOfLines={1}>{row.typeLabel || '—'}</Text>
          <Text style={[styles.td, styles.hoursCol, { color: colors.ink }]}>{formatHours(row.hours)}</Text>
          <Text style={[styles.td, styles.descCol, { color: colors.ink }]} numberOfLines={2}>{row.description || '—'}</Text>
          <TouchableOpacity onPress={() => onToggleRow(row.id)} accessibilityRole="button" style={styles.actCol}>
            <Text style={{ color: colors.brand, fontSize: 12 }}>
              {row.included ? 'Ta ut' : 'Ta med'}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
      {rows.length > pageSize ? (
        <TouchableOpacity onPress={onMore} style={{ padding: 12 }} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontWeight: '600' }}>
            Vis flere ({pageSize} av {rows.length})
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function AbsenceImportReview({
  colors,
  review,
  employees = [],
  busy,
  readyCount = 0,
  linkQuery = {},
  setLinkQuery,
  onToggleCard,
  onToggleOkRow,
  onLinkEmployee,
  onConfirm,
  onCancel,
  title = 'Kontroller fraværsimport',
  lead = 'Fjern rader du ikke vil ha med. Grupper med samme avvik kan tas ut samlet.',
}) {
  const [pageSize, setPageSize] = useState(40);
  const danger = colors.danger || '#b42318';
  const cards = review?.cards || [];
  const okRows = review?.okRows || [];

  const linkSuggestions = useMemo(() => {
    const map = {};
    for (const card of cards) {
      if (!card.needsEmployee) continue;
      const q = linkQuery[card.id] || '';
      map[card.id] = suggestEmployees(employees, {
        employeeName: q || card.employeeName,
        employeeNumber: card.employeeNumber,
      }, 6);
    }
    return map;
  }, [cards, employees, linkQuery]);

  return (
    <View style={{ gap: 12 }} nativeID="absence-import-review">
      <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: colors.ink }}>{reviewHeadline(cards)}</Text>
      <Text style={{ color: colors.muted }}>{lead}</Text>
      <ActionBar colors={colors} busy={busy} readyCount={readyCount} onCancel={onCancel} onConfirm={onConfirm} />

      {cards.map((card) => {
        if (card.list) {
          return (
            <View key={card.id} style={{ gap: 8 }}>
              <View style={styles.cardHead}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{card.title}</Text>
                <TouchableOpacity onPress={() => onToggleCard(card)} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>
                    {card.included ? 'Ta ut alle' : 'Ta med alle'}
                  </Text>
                </TouchableOpacity>
              </View>
              <OkTable
                colors={colors}
                rows={okRows}
                pageSize={pageSize}
                onMore={() => setPageSize((n) => n + 40)}
                onToggleRow={onToggleOkRow}
              />
            </View>
          );
        }

        const locked = card.severity === 'block' || card.locked;
        const border = card.severity === 'block'
          ? danger
          : card.severity === 'review'
            ? AMBER
            : card.severity === 'existing'
              ? (colors.brand || '#175cd3')
              : colors.line;
        return (
          <View
            key={card.id}
            style={{
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 6,
              borderColor: border,
              backgroundColor: colors.card,
              opacity: card.included || locked ? 1 : 0.55,
            }}
          >
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{card.title}</Text>
            {!!card.meta && <Text style={{ color: colors.muted }}>{card.meta}</Text>}
            {(card.issues || []).map((issue) => (
              <Text
                key={issue}
                style={{ color: card.severity === 'block' ? danger : AMBER, fontWeight: '600' }}
              >
                {issue}
              </Text>
            ))}
            {locked ? (
              <Text style={{ color: card.severity === 'existing' ? (colors.brand || '#175cd3') : danger }}>
                {card.severity === 'existing' ? 'Finnes allerede og blir ikke importert.' : 'Blir ikke importert.'}
              </Text>
            ) : (
              <TouchableOpacity onPress={() => onToggleCard(card)} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>
                  {card.included ? 'Ta ut' : 'Ta med'}
                </Text>
              </TouchableOpacity>
            )}
            {card.needsEmployee && card.included && !locked ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                <TextInput
                  value={linkQuery[card.id] || ''}
                  onChangeText={(value) => setLinkQuery((current) => ({ ...current, [card.id]: value }))}
                  placeholder={`Søk medarbeider (${card.employeeName || 'ukjent'})`}
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { borderColor: colors.line, color: colors.ink }]}
                />
                {(linkSuggestions[card.id] || []).map((employee) => (
                  <TouchableOpacity
                    key={employee.id}
                    onPress={() => onLinkEmployee(card.rowIndex, employee)}
                    accessibilityRole="button"
                    style={styles.suggest}
                  >
                    <Text style={{ color: colors.ink }}>{displayName(employee)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      <ActionBar colors={colors} busy={busy} readyCount={readyCount} onCancel={onCancel} onConfirm={onConfirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  btn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  btnPrimary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, paddingHorizontal: 8, gap: 8 },
  head: { paddingVertical: 10 },
  th: { flex: 1, fontSize: 12, fontWeight: '600' },
  td: { flex: 1, fontSize: 13 },
  dateCol: { flex: 0.8, minWidth: 88 },
  hoursCol: { flex: 0.5, minWidth: 56 },
  descCol: { flex: 1.4 },
  actCol: { width: 56, alignItems: 'flex-end' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  suggest: { paddingVertical: 6 },
});
