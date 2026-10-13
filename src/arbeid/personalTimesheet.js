/**
 * Personlig timeliste åpnes for innlogget bruker.
 * Dataene ligger på bedriften personen er knyttet til.
 */
import { isLiveOrganization } from '../project/companyOffer.js';
import { companyWorkspaces } from '../utils/platformSwitch.js';

export function personalTimesheetCompanies(families = [], currentFamily = null) {
  const companies = companyWorkspaces(families);
  if (!isLiveOrganization(currentFamily)) return companies;
  const rest = companies.filter((row) => row.id !== currentFamily.id);
  const current = companies.find((row) => row.id === currentFamily.id) || currentFamily;
  return [current, ...rest];
}

export function companyTimesheetLabel(company) {
  return String(company?.company?.navn || company?.name || '').trim() || 'Bedrift';
}
