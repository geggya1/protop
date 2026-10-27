import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  COMPLIANCE_CATALOG,
  COMPLIANCE_SOURCES,
  complianceSummary,
  ensureEmployeeCompliance,
  syncComplianceFromEvidence,
} from '../../src/hr/compliance';
import { localIsoDate } from '../../src/hr/model';
import { showSaveToast } from '../../src/ui/saveToast';
import OptionPicker from '../../components/OptionPicker';
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
  colors, hr, canWrite, onPatch, lockedEmployeeId,
}) {
  const activeId = String(lockedEmployeeId || '');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [noteDrafts, setNoteDrafts] = useState({});

  useEffect(() => {
    setNoteDrafts({});
  }, [activeId]);

  const rows = useMemo(() => {
    if (!activeId) return [];
    const sourced = syncComplianceFromEvidence(hr.compliance || [], {
      employeeId: activeId,
      contracts: hr.contracts || [],
      reviews: hr.reviews || [],
    });
    return ensureEmployeeCompliance(sourced, activeId);
  }, [hr.compliance, hr.contracts, hr.reviews, activeId]);
  const visible = sourceFilter === 'all'
    ? rows
    : rows.filter((row) => row.source === sourceFilter);
  const summary = complianceSummary(rows);

  function noteKey(catalogId, empId = activeId) {
    return `${empId || ''}:${catalogId}`;
  }

  function setStatus(catalogId, status) {
    if (!canWrite || !activeId) return;
    onPatch?.((state) => {
      const nextRows = ensureEmployeeCompliance(state.compliance || [], activeId).map((row) => (
        row.catalogId === catalogId
          ? {
            ...row,
            status,
            completedAt: status === 'ok' ? localIsoDate() : '',
            updatedAt: new Date().toISOString(),
          }
          : row
      ));
      const others = (state.compliance || []).filter((row) => row.employeeId !== activeId);
      return { compliance: [...others, ...nextRows] };
    });
  }

  function commitNote(catalogId) {
    if (!canWrite || !activeId) return;
    const note = noteDrafts[noteKey(catalogId)];
    if (note == null) return;
    onPatch?.((state) => {
      const nextRows = ensureEmployeeCompliance(state.compliance || [], activeId).map((row) => (
        row.catalogId === catalogId ? { ...row, note, updatedAt: new Date().toISOString() } : row
      ));
      const others = (state.compliance || []).filter((row) => row.employeeId !== activeId);
      return { compliance: [...others, ...nextRows] };
    });
  }

  function syncFromEvidence() {
    if (!canWrite || !activeId) return;
    onPatch?.((state) => {
      const compliance = syncComplianceFromEvidence(state.compliance || [], {
        employeeId: activeId,
        contracts: state.contracts || [],
        reviews: state.reviews || [],
      });
      return { compliance };
    });
    showSaveToast?.('Compliance synket fra avtaler og samtaler');
  }

  return (
    <View style={styles.page} nativeID="hr-compliance">
      {!activeId ? (
        <HrCard colors={colors}>
          <EmptyHint colors={colors} text="Velg en ansatt i personellisten for å se sjekklisten." />
        </HrCard>
      ) : (
        <HrCard colors={colors}>
          <HrSectionTitle
            colors={colors}
            title="Lovpålagt og ISO"
            subtitle="Sjekkliste for denne personen"
          />
          <Text style={[styles.summary, { color: colors.ink }]}>
            {`OK: ${summary.ok}/${summary.total} (${summary.pct} %) · Mangler: ${summary.missing}`}
          </Text>
        </HrCard>
      )}

      {activeId ? (
        <HrCard colors={colors}>
          <OptionPicker
            options={COMPLIANCE_SOURCES}
            value={sourceFilter === 'all' ? '' : sourceFilter}
            onChange={(id) => setSourceFilter(id || 'all')}
            placeholder="Alle kilder"
            clearLabel="Alle kilder"
            title="Kilde"
          />
          {canWrite ? (
            <HrButton
              colors={colors}
              label="Synk fra avtale + samtale"
              icon="sync-outline"
              onPress={syncFromEvidence}
            />
          ) : null}

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
                  <>
                    <HrField
                      colors={colors}
                      label="Notat / bevis"
                      value={noteDrafts[noteKey(row.catalogId)] ?? row.note ?? ''}
                      onChangeText={(note) => setNoteDrafts((prev) => ({
                        ...prev,
                        [noteKey(row.catalogId)]: note,
                      }))}
                    />
                    <HrButton
                      colors={colors}
                      label="Lagre notat"
                      onPress={() => commitNote(row.catalogId)}
                    />
                  </>
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
            onPatch?.((state) => {
              const nextRows = ensureEmployeeCompliance(state.compliance || [], activeId).map((row) => {
                const cat = COMPLIANCE_CATALOG.find((c) => c.id === row.catalogId);
                if (!cat?.required) return row;
                return {
                  ...row,
                  status: 'ok',
                  completedAt: localIsoDate(),
                  updatedAt: new Date().toISOString(),
                };
              });
              const others = (state.compliance || []).filter((row) => row.employeeId !== activeId);
              return { compliance: [...others, ...nextRows] };
            });
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
