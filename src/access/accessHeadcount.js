/**
 * Oversikt øverst i Tilgangsstyring: hvor mange ansatte og eksterne som har tilgang, totalt og per gruppe.
 * «Med tilgang» = aktive (deaktiverte har ingen rettigheter). Slettede telles ikke.
 * Ansatt eller ekstern følger personellgruppen (innleid regnes som ekstern), som ellers i appen.
 * En person med flere nivå står i hver gruppe som er huket av, men telles én gang i summen.
 */
import { accessLevelSections, accountDeactivated, groupEmployeesByLevel } from './companyAccess.js';
import { kindOf } from '../employees/employmentFlags.js';

function tally(rows) {
  let staff = 0;
  let external = 0;
  for (const employee of rows || []) {
    if (kindOf(employee) === 'staff') staff += 1;
    else external += 1;
  }
  return { staff, external, total: staff + external };
}

export function accessHeadcount(employees) {
  const live = (employees || []).filter((employee) => employee?.company?.status !== 'deleted');
  const active = live.filter((employee) => !accountDeactivated(employee));
  const { buckets, unplaced } = groupEmployeesByLevel(active);
  return {
    total: tally(active),
    deactivated: live.length - active.length,
    unplaced: tally(unplaced),
    sections: accessLevelSections().map((section) => ({
      id: section.id,
      levels: section.levels.map((level) => ({
        id: level.id,
        order: level.order,
        label: level.label,
        ...tally(buckets[level.id]),
      })),
    })),
  };
}
