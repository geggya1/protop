import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import {
  choiceLabel,
  currentSalaryFor,
  formatMoney,
  formatNbDate,
  normalizeSalary,
  plannedSalariesFor,
  salarySeriesFor,
  SALARY_KINDS,
} from '../../src/hr/model';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle, SalarySparkline,
} from './HrShared';

export default function HrSalary({
  colors, employees, hr, canWrite, onSaveSalaries, selectedEmployeeId, onSelectEmployee,
}) {
  const [employeeId, setEmployeeId] = useState(selectedEmployeeId || employees[0]?.id || '');
  const [draft, setDraft] = useState({
    kind: 'actual',
    effectiveDate: new Date().toISOString().slice(0, 10),
    annualAmount: '',
    reason: '',
    notes: '',
    employeeVisible: true,
  });

  const activeId = employeeId || selectedEmployeeId || '';
  const series = useMemo(() => salarySeriesFor(activeId, hr.salaries), [activeId, hr.salaries]);
  const planned = useMemo(() => plannedSalariesFor(activeId, hr.salaries), [activeId, hr.salaries]);
  const current = useMemo(() => currentSalaryFor(activeId, hr.salaries), [activeId, hr.salaries]);

  function saveDraft() {
    if (!canWrite || !activeId) return;
    const amount = Number(String(draft.annualAmount).replace(/\s/g, '').replace(',', '.'));
    if (!(amount > 0) || !draft.effectiveDate) return;
    const row = normalizeSalary({
      ...draft,
      employeeId: activeId,
      annualAmount: amount,
      employeeVisible: !!draft.employeeVisible,
    });
    onSaveSalaries?.([row, ...(hr.salaries || []).filter((item) => item.id !== row.id)]);
    setDraft((prev) => ({ ...prev, annualAmount: '', reason: '', notes: '' }));
  }

  return (
    <View style={styles.page}>
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Lønn"
          subtitle="Historikk, graf over år og plan for fremtidige justeringer"
        />
        <View style={styles.chips}>
          {(employees || []).filter((e) => e?.company?.status !== 'deleted').map((emp) => (
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
          <>
            <Text style={[styles.current, { color: colors.ink }]}>
              {current
                ? `Gjeldende: ${formatMoney(current.annualAmount, current.currency)} fra ${formatNbDate(current.effectiveDate)}`
                : 'Ingen lønn registrert ennå'}
            </Text>
            <SalarySparkline colors={colors} series={series} />
            {series.map((row) => (
              <Text key={row.id} style={[styles.line, { color: colors.muted }]}>
                {`${formatNbDate(row.effectiveDate)} · ${formatMoney(row.annualAmount, row.currency)}${row.reason ? ` · ${row.reason}` : ''}`}
              </Text>
            ))}
          </>
        )}
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Planlagte justeringer" />
        {planned.length === 0 ? (
          <EmptyHint colors={colors} text="Ingen planlagte justeringer." />
        ) : planned.map((row) => (
          <Text key={row.id} style={[styles.line, { color: colors.ink }]}>
            {`${formatNbDate(row.effectiveDate)} · ${formatMoney(row.annualAmount, row.currency)}${row.reason ? ` · ${row.reason}` : ''}`}
          </Text>
        ))}
      </HrCard>

      {canWrite && activeId ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Registrer lønn / plan" />
          <View style={styles.chips}>
            {SALARY_KINDS.map((kind) => (
              <HrChip
                key={kind.id}
                colors={colors}
                label={kind.label}
                active={draft.kind === kind.id}
                onPress={() => setDraft((prev) => ({ ...prev, kind: kind.id }))}
              />
            ))}
          </View>
          <HrField
            colors={colors}
            label="Dato (ÅÅÅÅ-MM-DD)"
            value={draft.effectiveDate}
            onChangeText={(effectiveDate) => setDraft((prev) => ({ ...prev, effectiveDate }))}
          />
          <HrField
            colors={colors}
            label="Årslønn"
            value={String(draft.annualAmount)}
            onChangeText={(annualAmount) => setDraft((prev) => ({ ...prev, annualAmount }))}
            keyboardType="numeric"
          />
          <HrField
            colors={colors}
            label="Begrunnelse"
            value={draft.reason}
            onChangeText={(reason) => setDraft((prev) => ({ ...prev, reason }))}
            placeholder="F.eks. årlig justering"
          />
          <HrField
            colors={colors}
            label="Notat"
            value={draft.notes}
            onChangeText={(notes) => setDraft((prev) => ({ ...prev, notes }))}
            multiline
          />
          <HrChip
            colors={colors}
            label={draft.employeeVisible ? 'Synlig for ansatt' : 'Kun HR'}
            active={!!draft.employeeVisible}
            onPress={() => setDraft((prev) => ({ ...prev, employeeVisible: !prev.employeeVisible }))}
          />
          <HrButton colors={colors} label="Lagre" primary icon="save-outline" onPress={saveDraft} />
          <Text style={[styles.hint, { color: colors.muted }]}>
            Type: {choiceLabel(SALARY_KINDS, draft.kind)}. Synlige poster dukker opp på den ansattes Min side.
          </Text>
        </HrCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  current: { fontSize: 16, fontWeight: '600' },
  line: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 12, lineHeight: 17 },
});
