/**
 * Det den ansatte selv kan se fra HR-modulen — synlige memo, oppgaver,
 * samtaler, kontrakter og lønn. Vises på Min side / egen ansattprofil.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  choiceLabel,
  employeeVisibleSlice,
  formatMoney,
  formatNbDate,
  salarySeriesWithPercents,
  TASK_STATUSES,
} from '../../src/hr/model';
import { loadEmployeeHrSlice } from '../../src/hr/storage';
import { EmptyHint, HrCard, HrSectionTitle, RowLink, SalarySparkline } from './HrShared';

export default function EmployeeHrSelfService({ colors, companyId, employeeId }) {
  const [slice, setSlice] = useState(null);

  useEffect(() => {
    let live = true;
    if (!companyId || !employeeId) {
      setSlice(null);
      return undefined;
    }
    loadEmployeeHrSlice(companyId, employeeId).then((next) => {
      if (live) setSlice(next);
    }).catch(() => {
      if (live) setSlice(employeeVisibleSlice({}, employeeId));
    });
    return () => { live = false; };
  }, [companyId, employeeId]);

  if (!employeeId) return null;
  if (!slice) {
    return (
      <HrCard colors={colors}>
        <Text style={{ color: colors.muted }}>Henter HR-info …</Text>
      </HrCard>
    );
  }

  const hasAnything = (
    slice.tasks.length
    || slice.memos.length
    || slice.reviews.length
    || slice.salaries.length
    || slice.contracts.length
    || slice.cases.length
    || (slice.files || []).length
  );

  return (
    <View style={styles.page} nativeID="employee-hr-self" id="employee-hr-self">
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Fra HR"
          subtitle="Oppgaver, notater og lønn som er delt med deg"
        />
        {!hasAnything ? (
          <EmptyHint colors={colors} text="Ingen delte HR-oppføringer for deg ennå." />
        ) : null}

        {slice.tasks.length ? (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: colors.ink }]}>Oppgaver</Text>
            {slice.tasks.map((row) => (
              <RowLink
                key={row.id}
                colors={colors}
                title={row.title}
                subtitle={row.description}
                meta={choiceLabel(TASK_STATUSES, row.status)}
                icon="checkbox-outline"
                onPress={() => {}}
              />
            ))}
          </View>
        ) : null}

        {slice.reviews.length ? (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: colors.ink }]}>Medarbeidersamtaler</Text>
            {slice.reviews.map((row) => (
              <RowLink
                key={row.id}
                colors={colors}
                title={formatNbDate(row.date) || 'Samtale'}
                subtitle={row.summary || row.goals}
                icon="chatbubble-ellipses-outline"
                onPress={() => {}}
              />
            ))}
          </View>
        ) : null}

        {slice.memos.length ? (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: colors.ink }]}>Notater</Text>
            {slice.memos.map((row) => (
              <RowLink
                key={row.id}
                colors={colors}
                title={row.title}
                subtitle={row.body}
                icon="document-text-outline"
                onPress={() => {}}
              />
            ))}
          </View>
        ) : null}

        {slice.contracts.length ? (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: colors.ink }]}>Ansettelseskontrakt</Text>
            {slice.contracts.map((row) => (
              <RowLink
                key={row.id}
                colors={colors}
                title={row.title}
                subtitle={`Fra ${formatNbDate(row.startDate)}${row.endDate ? ` til ${formatNbDate(row.endDate)}` : ''}`}
                icon="ribbon-outline"
                onPress={() => {}}
              />
            ))}
          </View>
        ) : null}

        {slice.salaries.length ? (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: colors.ink }]}>Lønn</Text>
            <SalarySparkline
              colors={colors}
              series={salarySeriesWithPercents(employeeId, slice.salaries)}
              showPercent
            />
            {salarySeriesWithPercents(employeeId, slice.salaries).map((row) => (
              <Text key={row.id} style={[styles.salaryLine, { color: colors.muted }]}>
                {`${formatNbDate(row.effectiveDate)} · ${formatMoney(row.annualAmount, row.currency)}${row.changePercent != null ? ` · ${row.changePercent > 0 ? '+' : ''}${row.changePercent} %` : ''}`}
              </Text>
            ))}
            {slice.salaries.filter((s) => s.kind === 'planned').map((row) => (
              <Text key={row.id} style={[styles.salaryLine, { color: colors.muted }]}>
                {`${formatNbDate(row.effectiveDate)} · ${formatMoney(row.annualAmount, row.currency)} (planlagt)`}
              </Text>
            ))}
          </View>
        ) : null}

        {slice.cases.length ? (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: colors.ink }]}>Oppfølging</Text>
            {slice.cases.map((row) => (
              <RowLink
                key={row.id}
                colors={colors}
                title={row.title}
                subtitle={row.description}
                icon="flag-outline"
                onPress={() => {}}
              />
            ))}
          </View>
        ) : null}

        {(slice.files || []).length ? (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: colors.ink }]}>Dokumenter</Text>
            {slice.files.map((row) => (
              <RowLink
                key={row.id}
                colors={colors}
                title={row.name}
                subtitle={row.kind || 'Dokument'}
                icon="document-attach-outline"
                onPress={() => {}}
              />
            ))}
          </View>
        ) : null}
      </HrCard>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12 },
  block: { gap: 2, marginTop: 4 },
  blockTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  salaryLine: { fontSize: 13, lineHeight: 18 },
});
