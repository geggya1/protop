/**
 * Personellgruppe slik rettighetene sier den.
 * Tilgangsnivå vinner over en eldre personelltype som ikke er oppdatert.
 * Kapasitet, ekstern konsulent og oppfølging bruker samme gruppering.
 */
import { levelById } from '../access/companyAccess.js';
import { kindOf, personnelKind } from './model.js';

// Regelen bor i employees/model.js, så HR, Innleie og resten bruker den samme.
export { kindOf };

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
