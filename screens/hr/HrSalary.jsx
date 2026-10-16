import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  choiceLabel,
  currentSalaryFor,
  formatMoney,
  formatNbDate,
  localIsoDate,
  normalizeSalary,
  plannedSalariesFor,
  salarySeriesWithPercents,
  SALARY_KINDS,
} from '../../src/hr/model';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle, SalarySparkline,
} from './HrShared';

export default function HrSalary({
  colors, hr, canWrite, onSaveSalaries, lockedEmployeeId,
}) {
  const emptySalaryDraft = () => ({
    kind: 'actual',
    effectiveDate: localIsoDate(),
    annualAmount: '',
    reason: '',
    notes: '',
    memo: '',
    employeeVisible: true,
  });
  const activeId = String(lockedEmployeeId || '');
  const [draft, setDraft] = useState(emptySalaryDraft);

  useEffect(() => {
    setDraft(emptySalaryDraft());
    // Ny person skal starte med tomt lønnsskjema.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);
  const series = useMemo(() => salarySeriesWithPercents(activeId, hr.salaries), [activeId, hr.salaries]);
  const planned = useMemo(() => plannedSalariesFor(activeId, hr.salaries), [activeId, hr.salaries]);
  const current = useMemo(() => currentSalaryFor(activeId, hr.salaries), [activeId, hr.salaries]);

  const nextYearPreview = useMemo(() => {
    if (!current || !draft.annualAmount) return null;
    const amount = Number(String(draft.annualAmount).replace(/\s/g, '').replace(',', '.'));
    if (!(amount > 0) || !(current.annualAmount > 0)) return null;
    const pct = Math.round(((amount - current.annualAmount) / current.annualAmount) * 1000) / 10;
    return { amount, pct };
  }, [current, draft.annualAmount]);

  function saveDraft() {
    if (!canWrite || !activeId) return;
    const amount = Number(String(draft.annualAmount).replace(/\s/g, '').replace(',', '.'));
    if (!(amount > 0) || !draft.effectiveDate) return;
    const draftSnapshot = { ...draft };
    const targetId = activeId;
    onSaveSalaries?.((salaries) => {
      const prev = currentSalaryFor(targetId, salaries);
      const row = normalizeSalary({
        ...draftSnapshot,
        employeeId: targetId,
        annualAmount: amount,
        previousAmount: prev?.annualAmount || 0,
        memo: draftSnapshot.memo || draftSnapshot.notes,
        employeeVisible: !!draftSnapshot.employeeVisible,
      });
      return [row, ...(salaries || []).filter((item) => item.id !== row.id)];
    });
    setDraft(emptySalaryDraft());
  }

  return (
    <View style={styles.page} nativeID="hr-salary">
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Lønn"
          subtitle="Historikk, prosentutvikling og plan for neste år — på denne personen"
        />
        {!activeId ? (
          <EmptyHint colors={colors} text="Velg en medarbeider." />
        ) : (
          <>
            <Text style={[styles.current, { color: colors.ink }]}>
              {current
                ? `Gjeldende: ${formatMoney(current.annualAmount, current.currency)} fra ${formatNbDate(current.effectiveDate)}`
                : 'Ingen lønn registrert ennå'}
            </Text>
            <SalarySparkline colors={colors} series={series} showPercent />
            {series.map((row) => (
              <View key={row.id} style={[styles.rowBlock, { borderColor: colors.line }]}>
                <Text style={[styles.line, { color: colors.ink }]}>
                  {`${formatNbDate(row.effectiveDate)} · ${formatMoney(row.annualAmount, row.currency)}`}
                  {row.changePercent != null
                    ? ` · ${row.changePercent > 0 ? '+' : ''}${row.changePercent} %`
                    : ''}
                </Text>
                {row.reason ? (
                  <Text style={[styles.meta, { color: colors.muted }]}>{row.reason}</Text>
                ) : null}
                {(row.memo || row.notes) ? (
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {`Memo: ${row.memo || row.notes}`}
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        )}
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Planlagte justeringer (neste år)" />
        {planned.length === 0 ? (
          <EmptyHint colors={colors} text="Ingen planlagte justeringer." />
        ) : planned.map((row) => (
          <View key={row.id} style={[styles.rowBlock, { borderColor: colors.line }]}>
            <Text style={[styles.line, { color: colors.ink }]}>
              {`${formatNbDate(row.effectiveDate)} · ${formatMoney(row.annualAmount, row.currency)}`}
              {row.changePercent != null
                ? ` · ${row.changePercent > 0 ? '+' : ''}${row.changePercent} %`
                : ''}
            </Text>
            {row.reason ? <Text style={[styles.meta, { color: colors.muted }]}>{row.reason}</Text> : null}
            {(row.memo || row.notes) ? (
              <Text style={[styles.meta, { color: colors.muted }]}>{`Memo: ${row.memo || row.notes}`}</Text>
            ) : null}
          </View>
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
          {nextYearPreview ? (
            <Text style={[styles.preview, { color: colors.brand }]}>
              {`Endring mot gjeldende: ${nextYearPreview.pct > 0 ? '+' : ''}${nextYearPreview.pct} %`}
            </Text>
          ) : null}
          <HrField
            colors={colors}
            label="Begrunnelse"
            value={draft.reason}
            onChangeText={(reason) => setDraft((prev) => ({ ...prev, reason }))}
            placeholder="F.eks. årlig justering"
          />
          <HrField
            colors={colors}
            label="Memo knyttet til bevegelsen"
            value={draft.memo}
            onChangeText={(memo) => setDraft((prev) => ({ ...prev, memo }))}
            multiline
            placeholder="Bakgrunn, forhandling, forutsetninger…"
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
  line: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  meta: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 12, lineHeight: 17 },
  preview: { fontSize: 14, fontWeight: '600' },
  rowBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    gap: 2,
  },
});
