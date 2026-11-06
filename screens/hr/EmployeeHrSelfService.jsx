import { lazyScreen } from '../../src/ui/lazyScreen';
/**
 * Det den ansatte selv kan se fra HR-modulen — medarbeidersamtalen (forberede og signere),
 * dokumenter å lese og signere, synlige memo, oppgaver, samtaler, kontrakter og lønn. Vises på Min side.
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
import MyDocuments from '../doccontrol/MyDocuments';
import HrAccessLog from './HrAccessLog';
import { EmployeeControlMeasures } from './ControlMeasuresCard';
import EmployeeSurveyCard from './EmployeeSurveyCard';
import EmployeeReviewCard from './EmployeeReviewCard';
import { useOptionalApp } from '../../src/context/AppContext';
const EmptyHint = lazyScreen(() => import('./HrShared'), { name: 'EmptyHint', pick: 'EmptyHint', silent: true });
const HrCard = lazyScreen(() => import('./HrShared'), { name: 'HrCard', pick: 'HrCard', silent: true });
const HrSectionTitle = lazyScreen(() => import('./HrShared'), { name: 'HrSectionTitle', pick: 'HrSectionTitle', silent: true });
const RowLink = lazyScreen(() => import('./HrShared'), { name: 'RowLink', pick: 'RowLink', silent: true });
const SalarySparkline = lazyScreen(() => import('./HrShared'), { name: 'SalarySparkline', pick: 'SalarySparkline', silent: true });

export default function EmployeeHrSelfService({
  colors, companyId, employeeId, showDocuments = true, showSurvey = true,
}) {
  const [slice, setSlice] = useState(null);
  const uid = useOptionalApp()?.uid || '';

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
      {/* Medarbeidersamtale: forberedelse (frivillig), signering og signert kopi. */}
      <EmployeeReviewCard colors={colors} companyId={companyId} uid={uid} />
      {/* Dokumentene står under Gjøremål når personen har en ansattpost i bedriften. */}
      {showDocuments ? <MyDocuments colors={colors} employeeId={employeeId} /> : null}
      {/* Åpen medarbeiderundersøkelse: svaret lagres anonymt. Bare for egne ansatte. */}
      {showSurvey ? <EmployeeSurveyCard colors={colors} companyId={companyId} uid={uid} /> : null}
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
      <EmployeeControlMeasures colors={colors} companyId={companyId} />
      <HrAccessLog
        colors={colors}
        familyId={companyId}
        employeeId={employeeId}
        title="Innsyn i dine opplysninger"
        subtitle="Hvem i bedriften som har åpnet HR-mappen, lønnen, fraværet eller personnummeret ditt, og når."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12 },
  block: { gap: 2, marginTop: 4 },
  blockTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  salaryLine: { fontSize: 13, lineHeight: 18 },
});
