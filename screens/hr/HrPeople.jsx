import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  displayName, formatNbDate as empFormatNbDate, periodLabel,
} from '../../src/employees/model';
import { hrControlCells } from '../../src/hr/directory';
import {
  formatNbDate,
  upcomingPeopleEvents,
  yearsBetween,
} from '../../src/hr/model';
import { HrButton, HrCard, HrChip, HrSectionTitle, RowLink } from './HrShared';
import { HrFilterBar, HrTable, useHrDirectory } from './HrDirectory';
import HrContracts from './HrContracts';
import HrSalary from './HrSalary';
import HrFollowUp from './HrFollowUp';
import HrCompliance from './HrCompliance';

// Lønn vises bare fra HR → Lønn, ikke som fane i personellmappen.
const SHEETS = [
  { id: 'oversikt', label: 'Oversikt' },
  { id: 'avtale', label: 'Avtale' },
  { id: 'oppfolging', label: 'Oppfølging' },
  { id: 'compliance', label: 'Lovpålagt' },
];
const SHEET_IDS = [...SHEETS.map((item) => item.id), 'lonn'];

// «sheet» er fanen som åpnes når man trykker i kolonnen.
// Rødt betyr at noe mangler. Hver kolonne sier selv hva, så «Mangler» gjentas ikke på tvers.

const COLUMNS = [
  { key: 'name', label: 'Navn', width: 190, value: (row) => displayName(row.employee) },
  { key: 'kind', label: 'Type', width: 90, value: (row) => row.cells.kindLabel },
  { key: 'check', label: 'Lovpålagt', width: 200, sheet: 'compliance', value: (row) => row.cells.checklist, warn: (row) => row.cells.checklistMissing > 0 },
  { key: 'contract', label: 'Ansettelsesavtale', width: 150, sheet: 'avtale', value: (row) => (row.cells.contract === 'Mangler' ? 'Ingen avtale' : row.cells.contract), warn: (row) => row.cells.contract === 'Mangler' },
  { key: 'review', label: 'Medarbeidersamtale', width: 160, sheet: 'oppfolging', value: (row) => (row.cells.review === 'Mangler' ? 'Ingen samtale' : row.cells.review), warn: (row) => row.cells.review === 'Mangler' },
  { key: 'util', label: 'Fakturerbarhet', width: 130, value: (row) => row.cells.utilization },
  { key: 'cases', label: 'Åpne saker', width: 110, sheet: 'oppfolging', value: (row) => row.cells.openCases, warn: (row) => Number(row.cells.openCases) > 0 },
];

export default function HrPeople({
  colors, employees, hr, entries, selectedId, onSelect, canWrite, onPatch, onSheet,
  sheet = 'oversikt', familyId, onSaveSalaries,
  focusCaseId, assigneeUid, assigneeName, onOpenTask, onCreateFollowUpTask,
  isoCompetence, onOpenIso, listPreset = null, onBackToSalary,
}) {
  const dir = useHrDirectory(employees, { preset: listPreset });
  const rows = useMemo(
    () => dir.rows.map((employee) => ({
      employee,
      cells: hrControlCells(employee, { hr, entries }),
    })),
    [dir.rows, hr, entries],
  );
  const selected = (employees || []).find((row) => row.id === selectedId) || null;
  const activeSheet = SHEET_IDS.includes(sheet) ? sheet : 'oversikt';

  if (!selected) {
    return (
      <View style={styles.page} nativeID="hr-people">
        <HrCard colors={colors}>
          <HrSectionTitle
            colors={colors}
            title="Personell"
            subtitle="Velg en ansatt. Rødt er det som mangler. Trykk i en kolonne for å gå rett til avtale, oppfølging eller lovpålagt."
          />
          <HrFilterBar
            colors={colors}
            query={dir.query}
            onQuery={dir.setQuery}
            status={dir.status}
            onStatus={dir.setStatus}
            kind={dir.kind}
            onKind={dir.setKind}
            counts={dir.counts}
          />
          <HrTable
            colors={colors}
            columns={COLUMNS}
            rows={rows}
            rowKey={(row) => row.employee.id}
            emptyText="Ingen treff i personaloversikten."
            onPressRow={(row, col) => {
              onSelect?.(row.employee.id);
              onSheet?.(col?.sheet || 'oversikt');
            }}
          />
        </HrCard>
      </View>
    );
  }

  const cells = hrControlCells(selected, { hr, entries });
  const tenure = yearsBetween(selected?.company?.periodFrom);
  const personFiles = (hr.files || []).filter((row) => row.employeeId === selected.id);
  const personMemos = (hr.memos || []).filter((row) => row.employeeId === selected.id);
  const nextEvents = upcomingPeopleEvents([selected], { withinDays: 366 }).slice(0, 2);

  // Åpnet fra HR → Lønn: bare lønnen, og tilbake dit.
  if (activeSheet === 'lonn') {
    return (
      <View style={styles.page} nativeID="hr-employee-sheet">
        <HrCard colors={colors}>
          <HrButton
            colors={colors}
            label="Til lønn"
            icon="arrow-back-outline"
            onPress={() => {
              if (onBackToSalary) {
                onBackToSalary();
                return;
              }
              onSelect?.('');
              onSheet?.('oversikt');
            }}
          />
          <HrSectionTitle
            colors={colors}
            title={displayName(selected)}
            subtitle={[selected?.company?.title, cells.kindLabel, periodLabel(selected)].filter(Boolean).join(' · ')}
          />
        </HrCard>
        <HrSalary
          colors={colors}
          hr={hr}
          canWrite={canWrite}
          lockedEmployeeId={selected.id}
          onSaveSalaries={onSaveSalaries}
          familyId={familyId}
        />
      </View>
    );
  }

  return (
    <View style={styles.page} nativeID="hr-employee-sheet">
      <HrCard colors={colors}>
        <HrButton
          colors={colors}
          label="Til personellisten"
          icon="arrow-back-outline"
          onPress={() => {
            onSelect?.('');
            onSheet?.('oversikt');
          }}
        />
        <HrSectionTitle
          colors={colors}
          title={displayName(selected)}
          subtitle={[selected?.company?.title, cells.kindLabel, periodLabel(selected)].filter(Boolean).join(' · ')}
        />
        <View style={styles.chips}>
          {SHEETS.map((item) => (
            <HrChip
              key={item.id}
              nativeID={`hr-sheet-${item.id}`}
              colors={colors}
              label={item.label}
              active={activeSheet === item.id}
              onPress={() => onSheet?.(item.id)}
            />
          ))}
        </View>
      </HrCard>

      {activeSheet === 'oversikt' ? (
        <HrCard colors={colors}>
          <View style={styles.facts}>
            <Fact colors={colors} label="Ansatt dato" value={empFormatNbDate(selected?.company?.periodFrom) || '—'} />
            <Fact colors={colors} label="Ansiennitet" value={tenure != null ? `${tenure} år` : '—'} />
            <Fact colors={colors} label="Fødselsdato" value={empFormatNbDate(selected?.person?.birthDate) || '—'} />
            <Fact colors={colors} label="Lovpålagt" value={cells.checklist} />
            <Fact colors={colors} label="Ansettelsesavtale" value={cells.contract} />
            <Fact colors={colors} label="Medarbeidersamtale" value={cells.review} />
            <Fact colors={colors} label="Fakturerbarhet" value={cells.utilization} />
            <Fact colors={colors} label="Åpne saker" value={cells.openCases} />
            <Fact colors={colors} label="Oppgaver" value={cells.openTasks} />
            <Fact colors={colors} label="Memo" value={String(personMemos.length)} />
            <Fact colors={colors} label="Filer" value={String(personFiles.length)} />
          </View>
          {nextEvents.length ? (
            <View style={styles.block}>
              <Text style={[styles.blockTitle, { color: colors.ink }]}>Neste milepæl</Text>
              {nextEvents.map((event) => (
                <Text key={`${event.type}-${event.date}`} style={[styles.line, { color: colors.muted }]}>
                  {`${event.label} · ${formatNbDate(event.date)} · ${event.days === 0 ? 'i dag' : `${event.days} dager`}`}
                </Text>
              ))}
            </View>
          ) : null}
          {personFiles.slice(0, 4).map((file) => (
            <RowLink
              key={file.id}
              colors={colors}
              title={file.name}
              subtitle={file.kind || 'Dokument'}
              icon="document-attach-outline"
              onPress={() => onSheet?.('oppfolging')}
            />
          ))}
          {personMemos.slice(0, 3).map((memo) => (
            <RowLink
              key={memo.id}
              colors={colors}
              title={memo.title}
              subtitle={memo.body}
              meta={memo.employeeVisible ? 'Synlig' : 'HR'}
              icon="document-text-outline"
              onPress={() => onSheet?.('oppfolging')}
            />
          ))}
          {!canWrite ? (
            <Text style={[styles.line, { color: colors.muted }]}>Du har lesetilgang. Endringer gjøres av leder eller HR.</Text>
          ) : null}
        </HrCard>
      ) : null}

      {activeSheet === 'avtale' ? (
        <HrContracts
          colors={colors}
          employees={employees}
          hr={hr}
          canWrite={canWrite}
          onPatch={onPatch}
          familyId={familyId}
          lockedEmployeeId={selected.id}
        />
      ) : null}

      {activeSheet === 'oppfolging' ? (
        <HrFollowUp
          colors={colors}
          employees={employees}
          hr={hr}
          canWrite={canWrite}
          lockedEmployeeId={selected.id}
          onPatch={onPatch}
          familyId={familyId}
          focusCaseId={focusCaseId}
          assigneeUid={assigneeUid}
          assigneeName={assigneeName}
          onOpenTask={onOpenTask}
          onCreateFollowUpTask={onCreateFollowUpTask}
        />
      ) : null}

      {activeSheet === 'compliance' ? (
        <HrCompliance
          colors={colors}
          hr={hr}
          canWrite={canWrite}
          onPatch={onPatch}
          lockedEmployeeId={selected.id}
          isoCompetence={isoCompetence}
          onOpenIso={onOpenIso}
          onOpenSheet={(id) => onSheet?.(id)}
        />
      ) : null}
    </View>
  );
}

function Fact({ colors, label, value }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { minWidth: '45%', flexGrow: 1, gap: 2 },
  factLabel: { fontSize: 12 },
  factValue: { fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  block: { gap: 4, marginTop: 4 },
  blockTitle: { fontSize: 14, fontWeight: '600' },
  line: { fontSize: 13, lineHeight: 18 },
});
