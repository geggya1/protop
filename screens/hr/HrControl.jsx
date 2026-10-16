import React, { useMemo } from 'react';
import { View } from 'react-native';
import { displayName } from '../../src/employees/model';
import { hrControlCells } from '../../src/hr/directory';
import { HrCard, HrSectionTitle } from './HrShared';
import { HrFilterBar, HrTable, useHrDirectory } from './HrDirectory';

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
    columns: [
      { key: 'name', label: 'Navn', width: 200, value: (row) => displayName(row.employee) },
      { key: 'kind', label: 'Type', width: 100, value: (row) => row.cells.kindLabel },
      { key: 'salary', label: 'Gjeldende lønn', width: 160, value: (row) => row.cells.salary, warn: (row) => row.cells.salary === 'Mangler' },
      { key: 'from', label: 'Fra', width: 120, value: (row) => row.cells.salaryFrom },
      { key: 'plan', label: 'Neste plan', width: 220, value: (row) => row.cells.nextPlan },
    ],
  },
  oppfolging: {
    title: 'Oppfølging',
    subtitle: 'Åpne saker, siste medarbeidersamtale og oppgaver — samlet fra alle ansatte.',
    sheet: 'oppfolging',
    columns: [
      { key: 'name', label: 'Navn', width: 200, value: (row) => displayName(row.employee) },
      { key: 'kind', label: 'Type', width: 100, value: (row) => row.cells.kindLabel },
      { key: 'cases', label: 'Åpne saker', width: 110, value: (row) => row.cells.openCases, warn: (row) => Number(row.cells.openCases) > 0 },
      { key: 'review', label: 'Siste samtale', width: 140, value: (row) => row.cells.review, warn: (row) => row.cells.review === 'Mangler' },
      { key: 'tasks', label: 'Åpne oppgaver', width: 130, value: (row) => row.cells.openTasks },
    ],
  },
  compliance: {
    title: 'Lov og ISO',
    subtitle: 'Kontroll på tvers. Sjekklisten fylles ut inne på den enkelte ansatte.',
    sheet: 'compliance',
    columns: [
      { key: 'name', label: 'Navn', width: 200, value: (row) => displayName(row.employee) },
      { key: 'kind', label: 'Type', width: 100, value: (row) => row.cells.kindLabel },
      { key: 'ok', label: 'OK', width: 80, value: (row) => String(row.cells.checklistOk) },
      { key: 'missing', label: 'Mangler', width: 100, value: (row) => String(row.cells.checklistMissing), warn: (row) => row.cells.checklistMissing > 0 },
      { key: 'pct', label: 'Dekning', width: 100, value: (row) => row.cells.checklistPct },
    ],
  },
};

export default function HrControl({
  colors, page = 'avtaler', employees, hr, entries, onOpenEmployee,
}) {
  const spec = PAGES[page] || PAGES.avtaler;
  const dir = useHrDirectory(employees, spec.staffOnly ? { lockedKind: 'internal' } : undefined);
  const rows = useMemo(
    () => dir.rows.map((employee) => ({
      employee,
      cells: hrControlCells(employee, { hr, entries }),
    })),
    [dir.rows, hr, entries],
  );

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
          onPressRow={(row) => onOpenEmployee?.(row.employee.id, spec.sheet)}
        />
      </HrCard>
    </View>
  );
}
