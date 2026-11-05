import React, { useMemo } from 'react';
import { View } from 'react-native';
import { displayName } from '../../src/employees/model';
import { hrControlCells } from '../../src/hr/directory';
import { HrCard, HrSectionTitle } from './HrShared';
import { HrFilterBar, HrTable, useHrDirectory } from './HrDirectory';

const PAGES = {
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
};

export default function HrControl({
  colors, page = 'oppfolging', employees, hr, entries, onOpenEmployee,
}) {
  const spec = PAGES[page] || PAGES.oppfolging;
  const dir = useHrDirectory(employees, spec.staffOnly ? { lockedKind: 'internal' } : undefined);
  const rows = useMemo(() => dir.rows.map((employee) => ({
    employee,
    cells: hrControlCells(employee, { hr, entries }),
  })), [dir.rows, hr, entries]);

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
    </View>
  );
}

