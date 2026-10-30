/**
 * Personverninformasjon til ansatte som styrt dokument (KS-malen «personvern-ansatte»).
 * Når den er godkjent med lesekrav, følger «Personverninformasjon gitt» i Lovpålagt
 * lesebekreftelsen til hver ansatt. Ansatte uten brukerkonto krysses av for hånd.
 */
import { ackStatus, controlKey, publishedRevision, workingRevision } from '../doccontrol/model.js';
import { libraryTemplateId } from '../forms/ksLibrary.js';

export const PRIVACY_LIBRARY_KEY = 'personvern-ansatte';

/**
 * state: 'none' (ikke satt opp), 'draft' (utkast), 'review' (til godkjenning) eller 'published'.
 * published er true bare når en versjon er godkjent og dokumentet har lesekrav.
 */
export function privacyDocState(controls, acks, employees) {
  const key = controlKey('template', libraryTemplateId(PRIVACY_LIBRARY_KEY));
  const control = (Array.isArray(controls) ? controls : []).find((row) => row?.id === key && !row.archived) || null;
  const pub = publishedRevision(control);
  const work = workingRevision(control);
  const readable = !!pub && (control.readRule === 'pakrevd' || control.readRule === 'info');
  let state = 'none';
  if (readable) state = 'published';
  else if (work?.state === 'til_gjennomgang') state = 'review';
  else if (control) state = 'draft';
  const status = readable ? ackStatus(employees, acks, control) : [];
  return {
    key: PRIVACY_LIBRARY_KEY,
    state,
    published: readable,
    revision: pub?.revision || 0,
    acked: status.filter((row) => row.current).map((row) => row.employeeId),
    ackedAt: Object.fromEntries(status.filter((row) => row.current).map((row) => [row.employeeId, row.latest?.at || ''])),
    manual: status.filter((row) => !row.uid).map((row) => row.employeeId),
  };
}
