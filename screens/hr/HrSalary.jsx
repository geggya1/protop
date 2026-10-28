import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  currentSalaryFor,
  formatMoney,
  formatNbDate,
  plannedSalariesFor,
  removeSalary,
  salarySeriesWithPercents,
  upsertSalary,
} from '../../src/hr/model';
import {
  EmptyHint, HrButton, HrCard, HrSectionTitle, SalarySparkline,
} from './HrShared';
import HrSalaryEntryModal from './HrSalaryEntryModal';
import { radius, type } from '../../src/ui/tokens';

function SalaryRow({ colors, row, canWrite, onEdit }) {
  const body = (
    <>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
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
          <Text style={[styles.meta, { color: colors.muted }]}>{`Memo: ${row.memo || row.notes}`}</Text>
        ) : null}
        {row.employeeVisible === false ? (
          <Text style={[styles.meta, { color: colors.muted }]}>Kun HR</Text>
        ) : null}
      </View>
      {canWrite ? (
        <View style={styles.editHint}>
          <Ionicons name="create-outline" size={16} color={colors.brand} />
          <Text style={[styles.editText, { color: colors.brand }]}>Endre</Text>
        </View>
      ) : null}
    </>
  );
  if (!canWrite) {
    return <View style={[styles.rowBlock, { borderColor: colors.line }]}>{body}</View>;
  }
  return (
    <Pressable
      onPress={() => onEdit(row.id)}
      style={({ hovered }) => [
        styles.rowBlock,
        { borderColor: colors.line },
        hovered && { backgroundColor: colors.bg },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Endre lønn fra ${formatNbDate(row.effectiveDate)}`}
      nativeID={`hr-salary-edit-${row.id}`}
    >
      {body}
    </Pressable>
  );
}

export default function HrSalary({
  colors, hr, canWrite, onSaveSalaries, lockedEmployeeId,
}) {
  const activeId = String(lockedEmployeeId || '');
  // null: lukket. { id: '' }: ny post. { id }: endre lagret post.
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    setEditor(null);
  }, [activeId]);
  const series = useMemo(() => salarySeriesWithPercents(activeId, hr.salaries), [activeId, hr.salaries]);
  const planned = useMemo(() => plannedSalariesFor(activeId, hr.salaries), [activeId, hr.salaries]);
  const current = useMemo(() => currentSalaryFor(activeId, hr.salaries), [activeId, hr.salaries]);
  const editing = editor?.id ? (hr.salaries || []).find((row) => row.id === editor.id) || null : null;
  const canEdit = !!(canWrite && activeId);

  function saveEntry(row) {
    if (!canEdit) return;
    const targetId = activeId;
    onSaveSalaries?.((salaries) => upsertSalary(salaries, { ...row, employeeId: targetId }));
    setEditor(null);
  }

  function deleteEntry(id) {
    if (!canEdit || !id) return;
    onSaveSalaries?.((salaries) => removeSalary(salaries, id));
    setEditor(null);
  }

  return (
    <View style={styles.page} nativeID="hr-salary">
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Lønn"
          subtitle="Historikk, prosentutvikling og plan for neste år — på denne personen"
          right={canEdit ? (
            <HrButton
              colors={colors}
              label="Registrer lønn"
              icon="add"
              primary
              onPress={() => setEditor({ id: '' })}
              nativeID="hr-salary-add"
            />
          ) : null}
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
              <SalaryRow key={row.id} colors={colors} row={row} canWrite={canEdit} onEdit={(id) => setEditor({ id })} />
            ))}
          </>
        )}
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Planlagte justeringer (neste år)" />
        {planned.length === 0 ? (
          <EmptyHint colors={colors} text="Ingen planlagte justeringer." />
        ) : planned.map((row) => (
          <SalaryRow key={row.id} colors={colors} row={row} canWrite={canEdit} onEdit={(id) => setEditor({ id })} />
        ))}
      </HrCard>

      {canEdit ? (
        <HrSalaryEntryModal
          visible={!!editor}
          colors={colors}
          employeeId={activeId}
          entry={editing}
          salaries={hr.salaries}
          onClose={() => setEditor(null)}
          onSave={saveEntry}
          onDelete={deleteEntry}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  current: { fontSize: 16, fontWeight: '600' },
  line: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  meta: { fontSize: 13, lineHeight: 18 },
  rowBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderRadius: radius.control,
  },
  editHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editText: { ...type.label },
});
