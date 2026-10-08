import { PHASES } from './catalog.js';

/** Filtre for prosjektstatus / fase i prosjektlisten. */
export const PROJECT_STATUS_FILTERS = [
  { id: '', label: 'Alle statuser' },
  { id: 'produksjon', label: 'Pågående' },
  { id: 'tilbud', label: 'Tilbud' },
  { id: 'planlegging', label: 'Planlegging' },
  { id: 'overlevering', label: 'Overlevering' },
  { id: 'garanti', label: 'Garanti' },
  { id: 'avsluttet', label: 'Avsluttet' },
];

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a');
}

/** Map fri-tekst prosjektstatus (f.eks. «Under arbeid») til intern fase. */
export function phaseFromProjectStatus(status) {
  const key = fold(status);
  if (!key) return 'planlegging';
  if (key.includes('avslutt') || key.includes('ferdig') || key.includes('arkiv')) return 'avsluttet';
  if (key.includes('garanti')) return 'garanti';
  if (key.includes('overlever')) return 'overlevering';
  if (
    key.includes('produksjon')
    || key.includes('arbeid')
    || key.includes('aktiv')
    || key.includes('pagaende')
    || key.includes('ongoing')
  ) {
    return 'produksjon';
  }
  if (key.includes('tilbud')) return 'tilbud';
  if (key.includes('planleg')) return 'planlegging';
  return 'planlegging';
}

/** Effektiv fase for filtrering: lagret phase hvis gyldig, ellers utledet fra projectStatus. */
export function projectPhaseOf(project) {
  if (project && PHASES.includes(project.phase)) return project.phase;
  return phaseFromProjectStatus(project?.projectStatus);
}

export function matchesStatusFilter(project, filterId) {
  if (!filterId) return true;
  return projectPhaseOf(project) === filterId;
}
