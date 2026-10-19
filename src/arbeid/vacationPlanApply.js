/**
 * Skriver ferieplanens sum inn som startsaldo, og legger inn faste datoer
 * bedriften har valgt å fordele (inneklemte dager) som planlagt ferie.
 */
import { addAbsence } from '../project/engine.js';
import { setAbsenceAdjustment } from './timesheetState.js';
import { isPlanningEmployee, normalizeVacationPlan, vacationQuota, weekdayKeys } from './vacationPlan.js';

export function applyVacationPlan(state, planInput, employees, { today = '', dayHours = 8, assignDates = false } = {}) {
  const plan = normalizeVacationPlan(planInput);
  let next = state;
  const people = (employees || []).filter(isPlanningEmployee);
  for (const employee of people) {
    const quota = vacationQuota(employee, plan, { absences: next.absences, today, dayHours });
    const saved = setAbsenceAdjustment(next, {
      employeeId: employee.id,
      typeId: 'ferie',
      kind: 'opening',
      days: quota.total,
      date: `${plan.year}-01-01`,
      note: `Ferieplan ${plan.year}`,
    });
    if (!saved.ok) return saved;
    next = saved.state;
  }
  if (!assignDates) return { ok: true, state: next };
  for (const extra of plan.fixedExtras) {
    if (!extra.assign) continue;
    const dates = weekdayKeys(extra.from, extra.to);
    for (const employee of people) {
      for (const date of dates) {
        const exists = (next.absences || []).some((row) => (
          row.employeeId === employee.id && row.date === date && (row.type || 'ferie') === 'ferie'
        ));
        if (exists) continue;
        const added = addAbsence(next, {
          employeeId: employee.id,
          employeeName: employee.person
            ? [employee.person.firstName, employee.person.lastName].filter(Boolean).join(' ')
            : '',
          date,
          hours: dayHours,
          type: 'ferie',
          description: extra.label,
          status: 'registrert',
        });
        if (!added.ok) return added;
        next = added.state;
      }
    }
  }
  return { ok: true, state: next };
}
