import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { issueNeedsAction, issueTally, reviewHeadline, reviewSections } from '../src/imports/review';

const AMBER = '#9a6700';

export default function ImportReview({
  colors,
  nativeID,
  lead,
  rows,
  busy,
  confirmLabel,
  onToggle,
  onConfirm,
  onCancel,
  renderRowExtra,
}) {
  const danger = colors.danger || '#b42318';
  const sections = reviewSections(rows);
  const ready = (rows || []).filter((row) => row.severity !== 'block' && row.included).length;
  return (
    <View nativeID={nativeID} style={{ gap: 12 }}>
      <Text style={{ color: colors.ink }}>{reviewHeadline(rows)}</Text>
      {issueTally(rows).map(([issue, count]) => (
        <Text key={issue} style={{ color: issueNeedsAction(issue) ? danger : AMBER, fontWeight: '600' }}>
          {`${count} · ${issue}`}
        </Text>
      ))}
      <Text style={{ color: colors.muted }}>{lead}</Text>
      {sections.map(([id, title, sectionRows]) => (
        <View key={id} style={{ gap: 8 }}>
          <Text style={{ color: id === 'block' ? danger : id === 'review' ? AMBER : colors.ink, fontWeight: '700' }}>
            {title}
          </Text>
          {sectionRows.map((row) => {
            const border = row.severity === 'block' ? danger : row.severity === 'review' ? AMBER : colors.line;
            return (
              <View
                key={row.id}
                style={{
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 12,
                  gap: 6,
                  borderColor: border,
                  backgroundColor: colors.card,
                  opacity: row.included || row.severity === 'block' ? 1 : 0.55,
                }}
              >
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.title}</Text>
                {!!row.meta && <Text style={{ color: colors.muted }}>{row.meta}</Text>}
                {(row.issues || []).map((issue) => (
                  <Text
                    key={issue}
                    style={{ color: row.severity === 'block' || issueNeedsAction(issue) ? danger : AMBER, fontWeight: '600' }}
                  >
                    {issue}
                  </Text>
                ))}
                {typeof renderRowExtra === 'function' ? renderRowExtra(row) : null}
                {row.severity === 'block' ? (
                  <Text style={{ color: danger }}>Blir ikke importert.</Text>
                ) : (
                  <TouchableOpacity onPress={() => onToggle(row.id)} accessibilityRole="button">
                    <Text style={{ color: colors.brand }}>{row.included ? 'Ta ut av importen' : 'Ta med likevel'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <TouchableOpacity onPress={onCancel} accessibilityRole="button" style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={{ color: colors.ink }}>Avbryt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onConfirm}
          disabled={busy || !ready}
          accessibilityRole="button"
          style={{ backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, opacity: busy || !ready ? 0.6 : 1 }}
        >
          <Text style={{ color: '#fff' }}>{busy ? 'Lagrer…' : confirmLabel(ready)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ImportResult({ colors, result }) {
  if (!result) return null;
  const danger = colors.danger || '#b42318';
  return (
    <View nativeID="import-result" style={{ borderWidth: 1, borderColor: result.complete ? colors.line : danger, borderRadius: 12, padding: 12, gap: 6, backgroundColor: colors.card }}>
      <Text style={{ color: result.complete ? colors.ink : danger, fontWeight: '700' }}>
        {result.complete
          ? `Alle ${result.saved} er importert.`
          : `Importert ${result.saved} av ${result.total}.`}
      </Text>
      {issueTally(result.attention).map(([issue, count]) => (
        <Text key={issue} style={{ color: issueNeedsAction(issue) ? danger : AMBER, fontWeight: '600' }}>
          {`${count} · ${issue}`}
        </Text>
      ))}
      {result.missed.length ? <Text style={{ color: danger, fontWeight: '700' }}>Ikke importert</Text> : null}
      {result.missed.map((row) => (
        <Text key={`miss-${row.name}-${row.reason}`} style={{ color: danger }}>
          {`${row.name}: ${row.reason}`}
        </Text>
      ))}
      {result.attention.length ? <Text style={{ color: AMBER, fontWeight: '700' }}>Importert med avvik</Text> : null}
      {result.attention.map((row) => (
        <Text key={`att-${row.name}`} style={{ color: AMBER }}>
          {`${row.name}: ${row.issues.join(' ')}`}
        </Text>
      ))}
    </View>
  );
}
