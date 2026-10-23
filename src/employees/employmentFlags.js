/**
 * Personellgruppe slik rettighetene sier den.
 * Tilgangsnivå vinner over en eldre personelltype som ikke er oppdatert.
 * Kapasitet, ekstern konsulent og oppfølging bruker samme gruppering.
 */
import { employeeLevelIds, levelById } from '../access/companyAccess.js';
import { personnelKind } from './model.js';

export function kindOf(employee) {
  // Flere nivå kan være huket av; samme rekkefølge som før gjelder over alle nivåene.
  const levels = employeeLevelIds(employee).map((id) => levelById(id)).filter(Boolean);
  if (levels.some((row) => row.kind === 'innleid')) return 'innleid';
  if (levels.some((row) => row.section === 'company' && row.kind === 'staff')) return 'staff';
  if (levels.some((row) => row.kind === 'external' || row.section === 'external')) return 'external';
  const level = levelById(employee?.company?.accessLevel);
  if (level?.kind === 'innleid') return 'innleid';
  if (level?.section === 'company' && level?.kind === 'staff') return 'staff';
  if (level?.kind === 'external' || level?.section === 'external') return 'external';
  const kind = personnelKind(employee);
  if (kind === 'innleid' || kind === 'external') return kind;
  return 'staff';
}

/**
 * Låste felt på brukerinnstillinger.
 * includeInCapacity: bare interne i bedriften (samme som kapasitetsfilteret Intern).
 * externalConsultant: nivået Regnskap eksternt, ikke «andre avdelinger».
 * externalRules: ekstern gruppe får ikke lås eller kom/gå-tid her.
 */
export function employmentFlags(employee) {
  const level = levelById(employee?.company?.accessLevel);
  const bucket = kindOf(employee);
  return {
    includeInCapacity: bucket === 'staff',
    externalConsultant: level ? level.kind === 'external' : personnelKind(employee) === 'external',
    externalRules: bucket === 'external',
  };
}
