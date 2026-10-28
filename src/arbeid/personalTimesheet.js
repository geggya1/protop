/**
 * Personlig timeliste åpnes for innlogget bruker.
 * Kun bedrifter der personen er ansatt (eller har egen timeføringsrett),
 * ikke alle selskaper personen administrerer.
 */
import { allows, accountDeactivated, grantsForEmployee } from '../access/companyAccess.js';
import { ownEmployee } from '../employees/model.js';
import { isLiveOrganization } from '../project/companyOffer.js';
import { visibleCompanyWorkspaces } from '../utils/platformSwitch.js';
import { companyDisplayName } from '../utils/companyName.js';

/**
 * Kan personen føre egne timer i denne bedriften?
 * Krever aktiv ansettelseskobling og write på «Egne timer».
 * Admin uten ansettelse i selskapet gir ikke tilgang.
 */
export function canLogOwnHoursInCompany(company, employees = [], actor = {}) {
  const employee = ownEmployee(employees, {
    uid: actor.uid || '',
    emails: actor.emails || [],
    name: actor.name || '',
  });
  if (!employee || accountDeactivated(employee)) return false;
  const grants = grantsForEmployee(company?.company?.accessPolicy, employee);
  return allows(grants, 'hours', 'read');
}

/**
 * @param {object[]} families
 * @param {object|null} currentFamily
 * @param {{ uid?: string, emails?: string[], name?: string, employeesByCompanyId?: Record<string, object[]> }} [options]
 */
export function personalTimesheetCompanies(families = [], currentFamily = null, options = {}) {
  // Samme skjulte alias som i headeren, så underenheten ikke vises som et ekstra selskap.
  const companies = visibleCompanyWorkspaces(families, options.occupancy);
  const employeesByCompanyId = options.employeesByCompanyId || {};
  const actor = {
    uid: options.uid || '',
    emails: options.emails || [],
    name: options.name || '',
  };
  const eligible = companies.filter((company) => (
    canLogOwnHoursInCompany(company, employeesByCompanyId[company.id] || [], actor)
  ));
  if (!eligible.length) return [];
  if (!isLiveOrganization(currentFamily)) return eligible;
  const rest = eligible.filter((row) => row.id !== currentFamily.id);
  const current = eligible.find((row) => row.id === currentFamily.id);
  return current ? [current, ...rest] : eligible;
}

export function companyTimesheetLabel(company) {
  return companyDisplayName(company, 'Bedrift');
}
