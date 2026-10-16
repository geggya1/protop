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
    subtitle: 'Åpne saker, siste medarbeidersamtale og oppgaver for egne ansatte.',
    sheet: 'oppfolging',
    splitExternal: true,
    columns: [
      { key: 'name', label: 'Navn', width: 200, value: (row) => displayName(row.employee) },
      { key: 'cases', label: 'Åpne saker', width: 110, value: (row) => row.cells.openCases, warn: (row) => Number(row.cells.openCases) > 0 },
      { key: 'review', label: 'Siste samtale', width: 160, value: (row) => row.cells.review, warn: (row) => row.cells.review === 'Mangler' },
      { key: 'tasks', label: 'Åpne oppgaver', width: 140, value: (row) => row.cells.openTasks },
    ],
    externalColumns: [
      { key: 'name', label: 'Navn', width: 200, value: (row) => displayName(row.employee) },
      { key: 'kind', label: 'Type', width: 110, value: (row) => row.cells.kindLabel },
      { key: 'cases', label: 'Åpne saker', width: 110, value: (row) => row.cells.openCases, warn: (row) => Number(row.cells.openCases) > 0 },
      { key: 'tasks', label: 'Åpne oppgaver', width: 140, value: (row) => row.cells.openTasks },
    ],
  },
  compliance: {
    title: 'Lov og ISO',
    subtitle: 'Sjekkliste for egne ansatte: skriftlig avtale, HMS, kompetanse og personvern. Avtale og gjennomført medarbeidersamtale fyller inn det som kan bevises. Åpne raden for å krysse av resten.',
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
  colors, page = 'avtaler', employees, hr, entries, onOpenEmployee,
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
  if (spec.splitExternal) {
    const internalRows = rows.filter((row) => row.cells.kind !== 'external');
    const externalRows = rows.filter((row) => row.cells.kind === 'external');
    return (
      <View nativeID={`hr-control-${page}`} style={styles.stack}>
        <HrCard colors={colors}>
          <HrSectionTitle
            colors={colors}
            title={spec.title}
            subtitle={`${spec.subtitle} ${internalRows.length} i listen.`}
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
            columns={spec.columns}
            rows={internalRows}
            rowKey={(row) => row.employee.id}
            emptyText="Ingen ansatte i dette utvalget."
            onPressRow={openRow}
          />
        </HrCard>
        <HrCard colors={colors}>
          <View nativeID="hr-follow-external">
            <HrSectionTitle
              colors={colors}
              title="Eksterne"
              subtitle={`Egen oppfølging, atskilt fra medarbeiderne. Saker og oppgaver. ${externalRows.length} i listen.`}
            />
            <HrTable
              colors={colors}
              columns={spec.externalColumns}
              rows={externalRows}
              rowKey={(row) => row.employee.id}
              emptyText="Ingen eksterne i dette utvalget."
              onPressRow={openRow}
            />
          </View>
        </HrCard>
      </View>
    );
  }

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

const styles = { stack: { gap: 14 } };
