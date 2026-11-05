import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  displayName, formatNbDate as empFormatNbDate, periodLabel,
} from '../../src/employees/model';
import { hrControlCells, hrKindBucket } from '../../src/hr/directory';
import {
  filterHrEmployees,
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
import HrHmsCards from './HrHmsCards';
import HrPayGap from './HrPayGap';
import HrPayrollSummary from './HrPayrollSummary';
import HrAccessLog from './HrAccessLog';
import ControlMeasuresCard from './ControlMeasuresCard';

// Lønn åpnes fra kolonnen i listen, ikke som fane i personellmappen.
const SHEETS = [
  { id: 'oversikt', label: 'Oversikt' },
  { id: 'avtale', label: 'Avtale' },
  { id: 'oppfolging', label: 'Oppfølging' },
  { id: 'compliance', label: 'Lovpålagt' },
];
const SHEET_IDS = [...SHEETS.map((item) => item.id), 'lonn'];

// Personell er kontrollsiden: avtale, lønn, lovpålagt og oppfølging for hver ansatt på én rad.
// «sheet» er fanen som åpnes når man trykker i kolonnen. «see» er rettigheten kolonnen krever.
// Rødt betyr at noe mangler. Hver kolonne sier selv hva, så «Mangler» gjentas ikke på tvers.
// Listen har bare egne ansatte. Innleide og eksterne ligger under Innleie › Personell.
const COLUMNS = [
  { key: 'name', label: 'Navn', width: 190, value: (row) => displayName(row.employee) },
  {
    key: 'contract', label: 'Avtale', width: 150, sheet: 'avtale', see: 'agreements',
    value: (row) => (row.cells.contract === 'Mangler' ? 'Ingen avtale' : row.cells.contract),
    warn: (row) => row.cells.contract === 'Mangler',
  },
  {
    key: 'salary', label: 'Lønn', width: 150, sheet: 'lonn', see: 'payroll',
    value: (row) => (row.cells.salary === 'Mangler' ? 'Ikke satt' : row.cells.salary),
    warn: (row) => row.cells.salary === 'Mangler',
  },
  { key: 'check', label: 'Lovpålagt', width: 200, sheet: 'compliance', see: 'compliance', value: (row) => row.cells.checklist, warn: (row) => row.cells.checklistMissing > 0 },
  { key: 'review', label: 'Medarbeidersamtale', width: 160, sheet: 'oppfolging', see: 'people', value: (row) => (row.cells.review === 'Mangler' ? 'Ingen samtale' : row.cells.review), warn: (row) => row.cells.review === 'Mangler' },
  { key: 'cases', label: 'Åpne saker', width: 110, sheet: 'oppfolging', see: 'people', value: (row) => row.cells.openCases, warn: (row) => Number(row.cells.openCases) > 0 },
];

const ALL_PARTS = { people: true, agreements: true, payroll: true, compliance: true };

/** Kolonnene den innloggede har rettighet til. Avtale og Lovpålagt fulgte også Personell før. */
export function controlColumns(parts = ALL_PARTS) {
  const see = {
    people: !!parts.people,
    agreements: !!(parts.agreements || parts.people),
    payroll: !!parts.payroll,
    compliance: !!(parts.compliance || parts.people),
  };
  return COLUMNS.filter((col) => !col.see || see[col.see]);
}

export default function HrPeople({
  colors, employees, hr, entries, selectedId, onSelect, canWrite, onPatch, onSheet,
  sheet = 'oversikt', familyId, onSaveSalaries,
  focusCaseId, assigneeUid, assigneeName, onOpenTask, onCreateFollowUpTask,
  isoCompetence, onOpenIso, listPreset = null, onOpenLibraryTemplate, formKit = null,
  parts = ALL_PARTS, company = null, canWriteCompliance = false, onPatchCompliance, canSeeAccessLog = false,
}) {
  const columns = useMemo(() => controlColumns(parts), [parts]);
  const dir = useHrDirectory(employees, { lockedKind: 'internal', preset: listPreset });
  const rows = useMemo(
    () => dir.rows.map((employee) => ({
      employee,
      cells: hrControlCells(employee, { hr, entries }),
    })),
    [dir.rows, hr, entries],
  );
  const selected = (employees || []).find((row) => row.id === selectedId && hrKindBucket(row) !== 'external') || null;
  const activeSheet = SHEET_IDS.includes(sheet) && (sheet !== 'lonn' || parts.payroll) ? sheet : 'oversikt';

  if (!selected) {
    return (
      <View style={styles.page} nativeID="hr-people">
        <HrCard colors={colors}>
          <HrSectionTitle
            colors={colors}
            title="Personell"
            subtitle={`Avtale, lønn, lovpålagt og oppfølging for egne ansatte i én liste. Rødt er det som mangler. ${parts.people ? 'Trykk i en kolonne for å gå rett dit. ' : ''}Innleide og eksterne følges opp under Innleie. ${rows.length} i listen.`}
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
            showKind={false}
          />
          <HrTable
            colors={colors}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.employee.id}
            emptyText="Ingen treff i personaloversikten."
            onPressRow={parts.people ? (row, col) => {
              onSelect?.(row.employee.id);
              onSheet?.(col?.sheet || 'oversikt');
            } : undefined}
          />
        </HrCard>
        {/* Månedens lønnsgrunnlag (overtid, mertid fra timebanken, sykdom, kjøring) til regnskapsfører. */}
        {parts.payroll && familyId ? <HrPayrollSummary colors={colors} familyId={familyId} canWrite={canWrite} /> : null}
        {parts.payroll ? <HrPayGap colors={colors} employees={rows.map((row) => row.employee)} hr={hr} /> : null}
        {parts.compliance ? (
          // HMS-kort gjelder alle som arbeider på byggeplassen, også innleide og eksterne.
          <HrHmsCards colors={colors} employees={filterHrEmployees(employees, 'all')} hr={hr} entries={entries} company={company} canWrite={canWriteCompliance} onPatch={onPatchCompliance || onPatch} />
        ) : null}
        {parts.compliance && familyId ? <ControlMeasuresCard colors={colors} familyId={familyId} canWrite={canWriteCompliance} /> : null}
        {canSeeAccessLog && familyId ? <HrAccessLog colors={colors} familyId={familyId} /> : null}
      </View>
    );
  }

  const cells = hrControlCells(selected, { hr, entries });
  const tenure = yearsBetween(selected?.company?.periodFrom);
  const personFiles = (hr.files || []).filter((row) => row.employeeId === selected.id);
  const personMemos = (hr.memos || []).filter((row) => row.employeeId === selected.id);
  const nextEvents = upcomingPeopleEvents([selected], { withinDays: 366 }).slice(0, 2);

  // Åpnet fra Lønn-kolonnen: bare lønnen, og tilbake til listen. Krever lønnsrettigheten.
  if (activeSheet === 'lonn' && parts.payroll) {
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
            {/* Det som hører til en annen fane, er en snarvei dit. Detaljene står der. */}
            <Fact colors={colors} label="Lovpålagt" value={cells.checklist} warn={cells.checklistMissing > 0} onPress={() => onSheet?.('compliance')} />
            <Fact colors={colors} label="Ansettelsesavtale" value={cells.contract === 'Mangler' ? 'Ingen avtale' : cells.contract} warn={cells.contract === 'Mangler'} onPress={() => onSheet?.('avtale')} />
            <Fact colors={colors} label="Medarbeidersamtale" value={cells.review === 'Mangler' ? 'Ingen samtale' : cells.review} warn={cells.review === 'Mangler'} onPress={() => onSheet?.('oppfolging')} />
            <Fact colors={colors} label="Fakturerbarhet" value={cells.utilization} />
            <Fact colors={colors} label="Saker, oppgaver, memo og filer" value={`${cells.openCases} åpne saker · ${cells.openTasks} oppgaver · ${personMemos.length} memo · ${personFiles.length} filer`} onPress={() => onSheet?.('oppfolging')} />
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
          formKit={formKit}
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
          onOpenLibraryTemplate={onOpenLibraryTemplate}
          familyId={familyId}
          personName={displayName(selected)}
          personBirthDate={selected?.person?.birthDate || ''}
        />
      ) : null}
    </View>
  );
}

function Fact({ colors, label, value, warn, onPress }) {
  const body = (
    <>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: warn ? colors.danger : colors.ink }]}>{value}</Text>
    </>
  );
  if (!onPress) return <View style={styles.fact}>{body}</View>;
  return (
    <Pressable style={styles.fact} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      {body}
    </Pressable>
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
