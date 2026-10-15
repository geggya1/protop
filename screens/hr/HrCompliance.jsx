import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import {
  COMPLIANCE_CATALOG,
  COMPLIANCE_SOURCES,
  companyComplianceOverview,
  complianceSummary,
  ensureEmployeeCompliance,
  syncComplianceFromEvidence,
} from '../../src/hr/compliance';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle, RowLink,
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

  const overview = useMemo(
    () => companyComplianceOverview(people, hr.compliance, {
      contracts: hr.contracts,
      reviews: hr.reviews,
      applyEvidence: true,
    }),
    [people, hr.compliance, hr.contracts, hr.reviews],
  );
  const totalMissing = overview.reduce((sum, row) => sum + row.missing, 0);
  const [noteDrafts, setNoteDrafts] = useState({});

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

  function selectEmployee(id) {
    setEmployeeId(id);
    onSelectEmployee?.(id);
    setNoteDrafts({});
  }

  function setStatus(catalogId, status) {
    if (!canWrite || !activeId) return;
    onPatch?.((state) => {
      const nextRows = ensureEmployeeCompliance(state.compliance || [], activeId).map((row) => (
        row.catalogId === catalogId
          ? {
            ...row,
            status,
            completedAt: status === 'ok' ? new Date().toISOString().slice(0, 10) : '',
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

  function syncAll() {
    if (!canWrite) return;
    onPatch?.((state) => {
      let compliance = state.compliance || [];
      for (const emp of people) {
        compliance = syncComplianceFromEvidence(compliance, {
          employeeId: emp.id,
          contracts: state.contracts || [],
          reviews: state.reviews || [],
        });
      }
      return { compliance };
    });
    showSaveToast?.('Compliance synket for alle');
  }

  return (
    <View style={styles.page} nativeID="hr-compliance">
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Lovpålagt og ISO-oppfølging"
          subtitle="AML, internkontroll, ISO 9001 / 14001 / 45001 og GDPR — selskapsoversikt og per ansatt"
        />
        <Text style={[styles.summary, { color: colors.ink }]}>
          {`${totalMissing} påkrevde mangler på tvers · ${people.length} ansatte`}
        </Text>
        {canWrite ? (
          <HrButton
            colors={colors}
            label="Synk alle fra avtaler/samtaler"
            icon="sync-outline"
            onPress={syncAll}
          />
        ) : null}
        {overview.filter((row) => row.missing > 0).slice(0, 12).map((row) => {
          const person = people.find((e) => e.id === row.employeeId);
          return (
            <RowLink
              key={row.employeeId}
              colors={colors}
              title={person ? displayName(person) : row.employeeId}
              subtitle={row.gaps.slice(0, 4).join(' · ') || 'Mangler'}
              meta={`${row.ok}/${row.total} · ${row.pct} %`}
              onPress={() => selectEmployee(row.employeeId)}
            />
          );
        })}
        {overview.every((row) => row.missing === 0) ? (
          <EmptyHint colors={colors} text="Ingen gap i påkrevde punkter — eller ingen ansatte valgt ennå." />
        ) : null}
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Per ansatt" />
        <View style={styles.chips}>
          {people.map((emp) => (
            <HrChip
              key={emp.id}
              colors={colors}
              label={displayName(emp)}
              active={emp.id === activeId}
              onPress={() => selectEmployee(emp.id)}
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
                  completedAt: new Date().toISOString().slice(0, 10),
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
