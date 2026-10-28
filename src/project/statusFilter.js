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

const PHASE_LABELS = {
  tilbud: 'Tilbud',
  planlegging: 'Planlegging',
  produksjon: 'Produksjon',
  overlevering: 'Overlevering',
  garanti: 'Garanti',
  avsluttet: 'Avsluttet',
  // Eldre data og import (anbudsfasen) har brukt disse.
  gjennomforing: 'Gjennomføring',
  arkivert: 'Arkivert',
};

/**
 * Prosjektstatus slik den vises: fri tekst (projectStatus) som den er, ellers fasen på norsk.
 * Rå id-er som «gjennomforing» skal ikke stå i brukergrensesnittet.
 */
export function projectStatusLabel(project, fallback = '') {
  const free = String(project?.projectStatus || '').trim();
  if (free) return free;
  const phase = String(project?.phase || '').trim();
  if (!phase) return fallback;
  if (PHASE_LABELS[phase]) return PHASE_LABELS[phase];
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export function matchesStatusFilter(project, filterId) {
  if (!filterId) return true;
  return projectPhaseOf(project) === filterId;
}
