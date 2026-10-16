import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { excelDateKind, excelSerialToIso } from '../anbud/customerImport.js';
import {
  absenceColumnField,
  absenceFingerprint,
  buildAbsenceImportReview,
  companyAbsenceRow,
  mapAbsenceType,
  normalizeAbsenceStatus,
  planAbsenceImport,
  readAbsenceTable,
  toggleAbsenceReviewRow,
} from './absenceImport.js';
import { emptyProjectState, importAbsences } from '../project/engine.js';

{
  assert.equal(absenceColumnField('Dato'), 'date');
  assert.equal(absenceColumnField('Medarbeider'), 'employeeName');
  assert.equal(absenceColumnField('Eksternt ansattnummer'), 'employeeNumber');
  assert.equal(absenceColumnField('Type'), 'typeLabel');
  assert.equal(absenceColumnField('Fraværsprosent'), 'percent');
  assert.equal(absenceColumnField('Status'), 'status');
  assert.equal(absenceColumnField('Vurdert av'), 'assessedBy');
  assert.equal(absenceColumnField('Beskrivelse'), 'description');
  assert.equal(absenceColumnField('Timer'), 'hours');
  assert.equal(absenceColumnField('Timer med lønn'), 'paidHours');
  assert.equal(absenceColumnField('Avtalte timer'), '');
  assert.equal(absenceColumnField('Avtalte arbeidsdager minus ferie'), '');
  assert.equal(absenceColumnField('Kjønn'), '');
}

{
  assert.equal(mapAbsenceType('Ferie'), 'ferie');
  assert.equal(mapAbsenceType('Sykdom med sykemelding'), 'syk_melding');
  assert.equal(mapAbsenceType('Sykdom med egenmelding'), 'egenmelding');
  assert.equal(mapAbsenceType('Foreldrepermisjon'), 'foreldre');
  assert.equal(mapAbsenceType('Avspasering'), 'avspasering');
  assert.equal(mapAbsenceType('Sykt barn'), 'sykt_barn');
  assert.equal(mapAbsenceType('Annet fravær uten lønn'), 'annet_uten');
  assert.equal(mapAbsenceType('Interntid - Smartplan (Ikke til timebank)'), 'intern_smart');
  assert.equal(mapAbsenceType('Permittert'), 'permittert');
  assert.equal(mapAbsenceType('Reisetid - Frøya (Ikke til lønn) (Annet fravær)'), 'reise_uten_lonn');
  assert.equal(mapAbsenceType('Legebesøk med lønn'), 'lege_med');
  assert.equal(mapAbsenceType('Sykefravær uten lønn'), 'syk_uten');
}

{
  assert.equal(normalizeAbsenceStatus('Pending approval'), 'registrert');
  assert.equal(normalizeAbsenceStatus('Approved'), 'godkjent');
  assert.equal(normalizeAbsenceStatus('Locked'), 'låst');
}

{
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Håvard', lastName: 'Gidskehaug' },
    company: { externalEmployeeNumber: '' },
  }];
  const row = companyAbsenceRow({
    date: '44925',
    employeeName: 'Håvard Gidskehaug',
    typeLabel: 'Ferie',
    status: 'Pending approval',
    hours: '0.3333333333333333',
    description: 'Ferie',
  }, { employees });
  assert.equal(row.severity, 'ok');
  assert.equal(row.entry.employeeId, 'emp1');
  assert.equal(row.entry.type, 'ferie');
  assert.equal(row.entry.hours, 8);
  assert.equal(row.entry.status, 'registrert');
  assert.ok(row.entry.date.startsWith('202'));
  assert.ok(absenceFingerprint(row.entry));
}

{
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Geir', lastName: 'Andersen' },
    company: {},
  }];
  const plan = planAbsenceImport([], employees, [
    {
      date: '2024-07-01',
      employeeName: 'Geir Andersen',
      typeLabel: 'Ferie',
      hours: '8',
      description: 'Sommerferie',
    },
    {
      date: '2024-07-01',
      employeeName: 'Ukjent Person',
      typeLabel: 'Ferie',
      hours: '8',
    },
  ]);
  assert.equal(plan.rows[0].severity, 'ok');
  assert.equal(plan.rows[1].severity, 'review');
  const review = buildAbsenceImportReview(plan);
  assert.equal(review.readyCount, 1);
  assert.ok(review.okRows.length === 1);
  assert.ok(review.reviewCards.length >= 1);

  const dropped = toggleAbsenceReviewRow(new Set(), review.okRows[0], plan);
  assert.ok(dropped.has('0'));
  assert.equal(buildAbsenceImportReview(plan, { dropped }).readyCount, 0);
}

{
  const state = emptyProjectState();
  const result = importAbsences(state, [
    {
      employeeId: 'emp1',
      employeeName: 'Geir Andersen',
      date: '2024-07-01',
      hours: 8,
      type: 'ferie',
      description: 'Sommerferie',
      importFingerprint: '2024-07-01|emp1|ferie|8|sommerferie',
    },
    {
      employeeId: 'emp1',
      employeeName: 'Geir Andersen',
      date: '2024-07-01',
      hours: 8,
      type: 'ferie',
      description: 'Sommerferie',
      importFingerprint: '2024-07-01|emp1|ferie|8|sommerferie',
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.added.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.state.absences.length, 1);
}

{
  // Selv-lukkende tomme celler i xlsx skal ikke forskyve Status/Timer.
  const { readFileSync, existsSync } = await import('node:fs');
  const sample = '/home/ubuntu/.cursor/projects/workspace/uploads/frav_r_d51e.xlsx';
  if (existsSync(sample)) {
    const bytes = new Uint8Array(readFileSync(sample));
    const rows = await readAbsenceTable(bytes, 'fravær.xlsx');
    assert.ok(rows.length > 100);
    const first = rows[0];
    assert.equal(first.employeeName, 'Håvard Gidskehaug');
    assert.equal(first.typeLabel, 'Ferie');
    assert.equal(first.status, 'Pending approval');
    assert.ok(!first.percent);
    assert.ok(Number(first.hours) > 0 && Number(first.hours) < 1);
  }
}

{
  assert.equal(excelDateKind('dd.MM.yyyy'), 'date');
  assert.equal(excelDateKind('dd.MM.yyyy HH:mm'), 'datetime');
  assert.equal(excelDateKind('[h]:mm'), '');
  assert.equal(excelDateKind('#,##0.00%'), '');
  assert.equal(excelSerialToIso(44925, { date1904: true }), '2026-12-31');
  assert.equal(excelSerialToIso(44925, { date1904: false }), '2022-12-30');
  const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/fravaer-1904.xlsx');
  const rows = await readAbsenceTable(new Uint8Array(readFileSync(fixture)), 'fravær.xlsx');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-12-31');
  assert.equal(rows[0].employeeName, 'Håvard Gidskehaug');
  assert.equal(rows[0].typeLabel, 'Ferie');
  assert.ok(Number(rows[0].hours) > 0 && Number(rows[0].hours) < 1);
}

{
  // Moment-eksport bruker Excel 1904-datoer (workbookPr date1904="true").
  // Serienummer 44925 er 31.12.2026, ikke 30.12.2022 fra 1900-systemet.
  const { readFileSync, existsSync } = await import('node:fs');
  const sample = '/home/ubuntu/.cursor/projects/workspace/uploads/frav_r_2be1.xlsx';
  if (existsSync(sample)) {
    const bytes = new Uint8Array(readFileSync(sample));
    const rows = await readAbsenceTable(bytes, 'fravær.xlsx');
    assert.ok(rows.length > 1000);
    assert.equal(rows[0].date, '2026-12-31');
    assert.equal(rows[0].employeeName, 'Håvard Gidskehaug');
    assert.equal(rows[0].typeLabel, 'Ferie');
    assert.ok(rows.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)));
    assert.ok(rows.some((row) => row.date.startsWith('2016-')));
    assert.ok(!rows.some((row) => row.date < '2016-01-01' || row.date > '2027-01-01'));
  }
}

console.log('absenceImport.test.mjs: ok');
