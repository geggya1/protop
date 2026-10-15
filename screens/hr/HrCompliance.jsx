import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import {
  COMPLIANCE_CATALOG,
  COMPLIANCE_SOURCES,
  complianceSummary,
  ensureEmployeeCompliance,
} from '../../src/hr/compliance';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle,
} from './HrShared';

const STATUS = [
  { id: 'ok', label: 'OK' },
  { id: 'missing', label: 'Mangler' },
  { id: 'overdue', label: 'Forfalt' },
  { id: 'na', label: 'Ikke aktuelt' },
];

export default function HrCompliance({
  colors, employees, hr, canWrite, onPatch, selectedEmployeeId, onSelectEmployee,
}) {
  const people = useMemo(
    () => (employees || []).filter((e) => e?.company?.status !== 'deleted'),
    [employees],
  );
  const [employeeId, setEmployeeId] = useState(selectedEmployeeId || people[0]?.id || '');
  const [sourceFilter, setSourceFilter] = useState('all');
  const activeId = employeeId || selectedEmployeeId || '';

  const rows = useMemo(
    () => ensureEmployeeCompliance(hr.compliance || [], activeId),
    [hr.compliance, activeId],
  );
  const visible = sourceFilter === 'all'
    ? rows
    : rows.filter((row) => row.source === sourceFilter);
  const summary = complianceSummary(rows);

  function setStatus(catalogId, status) {
    if (!canWrite || !activeId) return;
    const nextRows = ensureEmployeeCompliance(hr.compliance || [], activeId).map((row) => (
      row.catalogId === catalogId
        ? {
          ...row,
          status,
          completedAt: status === 'ok' ? new Date().toISOString().slice(0, 10) : '',
          updatedAt: new Date().toISOString(),
        }
        : row
    ));
    const others = (hr.compliance || []).filter((row) => row.employeeId !== activeId);
    onPatch?.({ compliance: [...others, ...nextRows] });
  }

  function setNote(catalogId, note) {
    if (!canWrite || !activeId) return;
    const nextRows = ensureEmployeeCompliance(hr.compliance || [], activeId).map((row) => (
      row.catalogId === catalogId ? { ...row, note, updatedAt: new Date().toISOString() } : row
    ));
    const others = (hr.compliance || []).filter((row) => row.employeeId !== activeId);
    onPatch?.({ compliance: [...others, ...nextRows] });
  }

  return (
    <View style={styles.page}>
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Lovpålagt og ISO-oppfølging"
          subtitle="AML, internkontroll, ISO 9001 / 14001 / 45001 og GDPR — per ansatt"
        />
        <View style={styles.chips}>
          {people.map((emp) => (
            <HrChip
              key={emp.id}
              colors={colors}
              label={displayName(emp)}
              active={emp.id === activeId}
              onPress={() => {
                setEmployeeId(emp.id);
                onSelectEmployee?.(emp.id);
              }}
            />
          ))}
        </View>
        {!activeId ? (
          <EmptyHint colors={colors} text="Velg en medarbeider." />
        ) : (
          <Text style={[styles.summary, { color: colors.ink }]}>
            {`Required OK: ${summary.ok}/${summary.total} (${summary.pct} %) · Mangler: ${summary.missing}`}
          </Text>
        )}
      </HrCard>

      {activeId ? (
        <HrCard colors={colors}>
          <View style={styles.chips}>
            <HrChip colors={colors} label="Alle" active={sourceFilter === 'all'} onPress={() => setSourceFilter('all')} />
            {COMPLIANCE_SOURCES.map((src) => (
              <HrChip
                key={src.id}
                colors={colors}
                label={src.label}
                active={sourceFilter === src.id}
                onPress={() => setSourceFilter(src.id)}
              />
            ))}
          </View>

          {visible.map((row) => {
            const cat = COMPLIANCE_CATALOG.find((c) => c.id === row.catalogId);
            return (
              <View key={row.catalogId} style={[styles.item, { borderColor: colors.line }]}>
                <Text style={[styles.itemTitle, { color: colors.ink }]}>
                  {row.label}{cat?.required ? ' *' : ''}
                </Text>
                {cat?.hint ? (
                  <Text style={[styles.itemHint, { color: colors.muted }]}>{cat.hint}</Text>
                ) : null}
                <View style={styles.chips}>
                  {STATUS.map((s) => (
                    <HrChip
                      key={s.id}
                      colors={colors}
                      label={s.label}
                      active={row.status === s.id}
                      onPress={() => setStatus(row.catalogId, s.id)}
                    />
                  ))}
                </View>
                {canWrite ? (
                  <HrField
                    colors={colors}
                    label="Notat / bevis"
                    value={row.note || ''}
                    onChangeText={(note) => setNote(row.catalogId, note)}
                  />
                ) : null}
              </View>
            );
          })}
        </HrCard>
      ) : null}

      {canWrite && activeId ? (
        <HrButton
          colors={colors}
          label="Marker alle påkrevde som OK"
          primary
          onPress={() => {
            const nextRows = ensureEmployeeCompliance(hr.compliance || [], activeId).map((row) => {
              const cat = COMPLIANCE_CATALOG.find((c) => c.id === row.catalogId);
              if (!cat?.required) return row;
              return {
                ...row,
                status: 'ok',
                completedAt: new Date().toISOString().slice(0, 10),
                updatedAt: new Date().toISOString(),
              };
            });
            const others = (hr.compliance || []).filter((row) => row.employeeId !== activeId);
            onPatch?.({ compliance: [...others, ...nextRows] });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summary: { fontSize: 15, fontWeight: '600' },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  itemHint: { fontSize: 12, lineHeight: 17 },
});
