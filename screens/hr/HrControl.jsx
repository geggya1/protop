import React, { useMemo } from 'react';
import { View } from 'react-native';
import { displayName } from '../../src/employees/model';
import { hrControlCells } from '../../src/hr/directory';
import { filterHrEmployees } from '../../src/hr/model';
import { HrCard, HrSectionTitle } from './HrShared';
import { HrFilterBar, HrTable, useHrDirectory } from './HrDirectory';
import HrHmsCards from './HrHmsCards';
import HrPayGap from './HrPayGap';
import HrAccessLog from './HrAccessLog';
import ControlMeasuresCard from './ControlMeasuresCard';

const PAGES = {
  avtaler: {
    title: 'Ansettelsesavtaler',
    subtitle: 'Oversikt på tvers av ansatte. Avtalen registreres inne på den enkelte.',
    sheet: 'avtale',
    staffOnly: true,
    columns: [
      { key: 'name', label: 'Navn', width: 200, value: (row) => displayName(row.employee) },
      { key: 'title', label: 'Avtale', width: 180, value: (row) => row.cells.contractTitle, warn: (row) => row.cells.contractTitle === 'Mangler' },
      { key: 'aml', label: 'AML', width: 90, value: (row) => row.cells.contractAml, warn: (row) => row.cells.contract === 'Mangler' },
      { key: 'from', label: 'Fra dato', width: 110, value: (row) => row.cells.contractFrom },
      { key: 'status', label: 'Status', width: 110, value: (row) => row.cells.contractStatus, warn: (row) => row.cells.contractStatus === 'Mangler' },
    ],
  },
  lonn: {
    title: 'Lønn',
    subtitle: 'Gjeldende lønn og neste plan. Registrering skjer inne på den enkelte.',
    sheet: 'lonn',
    staffOnly: true,
    columns: [
      { key: 'name', label: 'Navn', width: 200, value: (row) => displayName(row.employee) },
      { key: 'salary', label: 'Gjeldende lønn', width: 160, value: (row) => row.cells.salary, warn: (row) => row.cells.salary === 'Mangler' },
      { key: 'from', label: 'Fra', width: 120, value: (row) => row.cells.salaryFrom },
      { key: 'plan', label: 'Neste plan', width: 220, value: (row) => row.cells.nextPlan },
    ],
  },
  oppfolging: {
    title: 'Oppfølging',
    subtitle: 'Åpne saker, siste medarbeidersamtale og oppgaver for egne ansatte. Innleide og eksterne følges opp under Innleid personell.',
    sheet: 'oppfolging',
    staffOnly: true,
    columns: [
      { key: 'name', label: 'Navn', width: 200, value: (row) => displayName(row.employee) },
      { key: 'cases', label: 'Åpne saker', width: 110, value: (row) => row.cells.openCases, warn: (row) => Number(row.cells.openCases) > 0 },
      { key: 'review', label: 'Siste samtale', width: 160, value: (row) => row.cells.review, warn: (row) => row.cells.review === 'Mangler' },
      { key: 'tasks', label: 'Åpne oppgaver', width: 140, value: (row) => row.cells.openTasks },
    ],
  },
  compliance: {
    title: 'Lovpålagt',
    subtitle: 'Sjekkliste for egne ansatte: skriftlig avtale, verneutstyr, HMS-kort og personvern. Avtalen og HMS-kortet fyller inn det som kan bevises. Åpne raden for å krysse av resten. Medarbeidersamtaler følges opp under Oppfølging, kompetanse og opplæring i ISO / K-HMS.',
    sheet: 'compliance',
    staffOnly: true,
    columns: [
      { key: 'name', label: 'Navn', width: 190, value: (row) => displayName(row.employee) },
      { key: 'pct', label: 'Dekning', width: 90, value: (row) => row.cells.checklistPct },
      {
        key: 'gaps',
        label: 'Mangler',
        width: 420,
        value: (row) => row.cells.checklistGaps,
        warn: (row) => row.cells.checklistMissing > 0,
      },
      { key: 'open', label: '', width: 130, value: () => 'Åpne sjekkliste' },
    ],
  },
};

export default function HrControl({
  colors, page = 'avtaler', employees, hr, entries, onOpenEmployee, company = null,
  familyId = '', canSeeAccessLog = false, canWrite = false, onPatch,
}) {
  const spec = PAGES[page] || PAGES.avtaler;
  const dir = useHrDirectory(employees, spec.staffOnly ? { lockedKind: 'internal' } : undefined);
  const rows = useMemo(() => {
    const mapped = dir.rows.map((employee) => ({
      employee,
      cells: hrControlCells(employee, { hr, entries }),
    }));
    if (page !== 'compliance') return mapped;
    return mapped.sort((a, b) => (
      b.cells.checklistMissing - a.cells.checklistMissing
      || displayName(a.employee).localeCompare(displayName(b.employee), 'nb')
    ));
  }, [dir.rows, hr, entries, page]);

  const openRow = (row) => onOpenEmployee?.(row.employee.id, spec.sheet);
  return (
    <View nativeID={`hr-control-${page}`}>
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title={spec.title}
          subtitle={`${spec.subtitle} ${rows.length} i listen.`}
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
          showKind={!spec.staffOnly}
        />
        <HrTable
          colors={colors}
          columns={spec.columns}
          rows={rows}
          rowKey={(row) => row.employee.id}
          emptyText="Ingen ansatte i dette utvalget."
          onPressRow={openRow}
        />
      </HrCard>
      {page === 'compliance' ? (
        // HMS-kort gjelder alle som arbeider på byggeplassen, også innleide og eksterne.
        // Derfor hele personalet her, ikke bare radene i sjekklisten over (egne ansatte og søket).
        <HrHmsCards colors={colors} employees={filterHrEmployees(employees, 'all')} hr={hr} entries={entries} company={company} canWrite={canWrite} onPatch={onPatch} />
      ) : null}
      {page === 'compliance' && familyId ? <ControlMeasuresCard colors={colors} familyId={familyId} canWrite={canWrite} /> : null}
      {page === 'compliance' && canSeeAccessLog && familyId ? <HrAccessLog colors={colors} familyId={familyId} /> : null}
      {page === 'lonn' ? <HrPayGap colors={colors} employees={rows.map((row) => row.employee)} hr={hr} /> : null}
    </View>
  );
}

