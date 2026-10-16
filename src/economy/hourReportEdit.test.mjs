import assert from 'node:assert/strict';
import { emptyProjectState } from '../project/engine.js';
import { applyReportEntryChange, applyReportEntryDelete, reportEntryEditor } from './hourReportEdit.js';

function base() {
  return {
    ...emptyProjectState(),
    projects: [{
      id: 'p1',
      number: '10640',
      name: 'Myklebust barnehage',
      client: 'Sola Kommune',
      status: 'aktiv',
      workSettings: { requireDescription: true },
    }],
    activities: [{ id: 'a1', projectId: 'p1', name: 'Hovedaktivitet' }],
    timeEntries: [
      {
        id: 't1',
        projectId: 'p1',
        employeeId: 'e1',
        employeeName: 'Geir Ove Andersen',
        customerName: 'Sola Kommune',
        date: '2026-10-16',
        hours: 1,
        billableHours: 1,
        description: '20',
        activityId: 'a1',
        activityName: 'Hovedaktivitet',
        status: 'registrert',
      },
      {
        id: 't2',
        projectId: 'p1',
        employeeId: 'e1',
        date: '2026-10-16',
        hours: 5,
        description: '12',
        status: 'registrert',
      },
    ],
  };
}

{
  const state = base();
  const editor = reportEntryEditor(state, state.timeEntries[0]);
  assert.equal(editor.project.name, 'Myklebust barnehage');
  assert.equal(editor.locked, false);
  assert.equal(editor.activities[0].id, 'a1');
  const saved = applyReportEntryChange(state, editor, [{
    id: 't1',
    hours: '2:30',
    description: 'Befaring',
    activityId: 'a1',
    activityName: 'Hovedaktivitet',
  }]);
  assert.equal(saved.ok, true);
  assert.equal(saved.state.timeEntries.find((row) => row.id === 't1').hours, 2.5);
  assert.equal(saved.state.timeEntries.find((row) => row.id === 't1').description, 'Befaring');
  assert.equal(saved.state.timeEntries.find((row) => row.id === 't2').hours, 5);
}

{
  const state = base();
  state.timesheetLocks = [{ employeeId: 'e1', throughDate: '2026-10-16' }];
  const editor = reportEntryEditor(state, state.timeEntries[0]);
  assert.equal(editor.locked, true);
  const saved = applyReportEntryChange(state, editor, [{
    id: 't1',
    hours: 3,
    description: 'Endret',
  }]);
  assert.equal(saved.ok, false);
}

{
  const state = base();
  const editor = reportEntryEditor(state, state.timeEntries[0]);
  const removed = applyReportEntryDelete(state, ['t1']);
  assert.equal(removed.ok, true);
  assert.equal(removed.state.timeEntries.some((row) => row.id === 't1'), false);
  assert.equal(removed.state.timeEntries.some((row) => row.id === 't2'), true);
  const cleared = applyReportEntryChange(state, editor, [{ id: 't1', hours: 0, description: '' }]);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.state.timeEntries.some((row) => row.id === 't1'), false);
}

console.log('hourReportEdit.test.mjs: ok');
