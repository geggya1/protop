/**
 * Åpne og lagre én føring fra Timerapport.
 * Endringen gjelder bare den valgte raden, ikke andre føringer samme dag.
 */
import { parseHours } from '../arbeid/hours.js';
import { isDateLocked, lockThroughDate } from '../arbeid/locks.js';
import { deleteTimeEntry, upsertTimeEntry } from '../project/engine.js';

export function reportEntryEditor(state, row) {
  if (!row?.id) return null;
  const projects = state?.projects || [];
  const project = projects.find((item) => item.id === row.projectId && item.status !== 'arkivert')
    || projects.find((item) => item.id === row.projectId)
    || {
      id: row.projectId || '',
      name: row.projectName || '',
      number: row.projectNumber || '',
      client: row.customerName || '',
      customerId: row.customerId || '',
      workSettings: {},
    };
  const activities = (state?.activities || []).filter((item) => item.projectId === project.id);
  const locked = row.status === 'låst'
    || !!row.invoiceId
    || isDateLocked(lockThroughDate(state?.timesheetLocks, row.employeeId), row.date);
  return { row, project, activities, locked };
}

export function applyReportEntryChange(state, editing, blocks) {
  if (!editing?.row?.id) return { ok: false, error: 'Føringen finnes ikke.', state };
  const list = Array.isArray(blocks) ? blocks : [blocks];
  let next = state;
  for (const payload of list) {
    if (!payload) continue;
    const hours = parseHours(payload.hours);
    const description = String(payload.description || '').trim();
    const id = payload.id || editing.row.id;
    if (!(hours > 0) && !description) {
      if (!payload.id && !editing.row.id) continue;
      const removed = deleteTimeEntry(next, id);
      if (!removed.ok) return removed;
      next = removed.state;
      continue;
    }
    const saved = upsertTimeEntry(next, {
      id,
      projectId: payload.projectId || editing.project?.id || editing.row.projectId,
      employeeId: editing.row.employeeId,
      employeeName: editing.row.employeeName,
      customerId: editing.row.customerId,
      customerName: editing.row.customerName,
      customerNumber: editing.row.customerNumber,
      date: payload.date || editing.row.date,
      hours,
      description,
      internalNote: payload.internalNote,
      activityId: payload.activityId || editing.row.activityId,
      activityName: payload.activityName || editing.row.activityName,
      timeType: payload.timeType || editing.row.timeType || 'ordinary',
      clockIn: payload.clockIn,
      clockOut: payload.clockOut,
    });
    if (!saved.ok) return saved;
    next = saved.state;
  }
  return { ok: true, state: next };
}

export function applyReportEntryDelete(state, ids) {
  let next = state;
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!list.length) return { ok: false, error: 'Føringen finnes ikke.', state };
  for (const id of list) {
    const removed = deleteTimeEntry(next, id);
    if (!removed.ok) return removed;
    next = removed.state;
  }
  return { ok: true, state: next };
}
