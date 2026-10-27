/**
 * Antall med tilgang i hver gruppe i Tilgangsstyring, vist i overskriften:
 * «Ansatt i CONSULT1 AS (18)», «Fagansvar (1)», «Eksternt (13)».
 * Med tilgang = aktive (deaktiverte har ingen rettigheter). Slettede telles ikke.
 * Tallet er summen av aktive i gruppens nivåer, og hver person telles én gang per gruppe.
 */
import { accessLevelSections, accountDeactivated, groupEmployeesByLevel } from './companyAccess.js';

export function sectionHeadcounts(employees) {
  const active = (employees || []).filter((employee) => (
    employee?.company?.status !== 'deleted' && !accountDeactivated(employee)
  ));
  const { buckets } = groupEmployeesByLevel(active);
  const counts = {};
  for (const section of accessLevelSections()) {
    const ids = new Set();
    for (const level of section.levels) {
      for (const employee of buckets[level.id] || []) ids.add(employee.id);
    }
    counts[section.id] = ids.size;
  }
  return counts;
}
