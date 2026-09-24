import { checklistScore, progressSummary, projectEconomy, wasteSummary } from './engine.js';

const HAZARD_MEASURES = [
  { test: /høyde|stillas|tak/i, measures: 'Fallsikring, godkjent stillas og sperret sone under arbeid.' },
  { test: /grav|grøft|kabel/i, measures: 'Kabelpåvisning, avsperring og rømning ut av grøft.' },
  { test: /varmt arbeid|sveis|slip/i, measures: 'Slokkeutstyr, fjern brennbart og sett vakt etter arbeidet.' },
  { test: /støv|asbest|kvarts/i, measures: 'Åndedrettsvern, avsug og avfallspose merket farlig avfall.' },
  { test: /kran|løft/i, measures: 'Løfteplan, sperret sone og sertifisert fører.' },
];

export function suggestMeasures(hazards) {
  const hits = HAZARD_MEASURES.filter((row) => row.test.test(String(hazards || '')));
  if (!hits.length) return 'Beskriv fare, hvem som kan skades, og konkret tiltak før arbeidet starter.';
  return hits.map((row) => row.measures).join(' ');
}

export function suggestIso(text) {
  const value = String(text || '');
  if (/avfall|miljø|utslipp/i.test(value)) return 'ISO 14001 kap. 8';
  if (/skade|hms|ruh|fall|vernerunde/i.test(value)) return 'ISO 45001 kap. 8';
  if (/revisjon|avvik|tiltak/i.test(value)) return 'ISO 9001 kap. 10.2';
  return 'ISO 9001 kap. 8.1';
}

export function draftMinutes(meeting) {
  const agenda = String(meeting?.agenda || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const lines = [
    `Referat: ${meeting?.title || 'Møte'} ${meeting?.date || ''}`.trim(),
    'Tilstede: prosjektleder og fag.',
  ];
  if (!agenda.length) lines.push('Ingen saksliste er ført.');
  agenda.forEach((item, index) => {
    lines.push(`${index + 1}. ${item} — beslutning føres her.`);
  });
  lines.push('Neste møte avtales av prosjektleder.');
  return lines.join('\n');
}

export function projectAdvice(state, projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return [];
  const notes = [];
  const economy = projectEconomy(state, projectId);
  const progress = progressSummary(state, projectId);
  const waste = wasteSummary(state, projectId);
  if (economy.result < 0) {
    notes.push({ level: 'høy', text: `Resultatet er ${economy.result} kr. Gå gjennom timer, materialer og endringer.` });
  }
  if (economy.contract && economy.cost > economy.forecast) {
    notes.push({ level: 'høy', text: 'Kostnaden er høyere enn kontrakt pluss godkjente endringer.' });
  }
  if (progress.blocked) {
    notes.push({ level: 'middels', text: `${progress.blocked} aktiviteter venter på en forgjenger.` });
  }
  const openCritical = state.incidents.filter((item) => (
    item.projectId === projectId && item.status !== 'lukket' && (item.severity === 'høy' || item.severity === 'kritisk')
  ));
  if (openCritical.length) {
    notes.push({ level: 'høy', text: `${openCritical.length} åpne RUH med høy alvorlighet.` });
  }
  const unsigned = state.sja.filter((item) => item.projectId === projectId && item.status !== 'signert');
  if (project.phase === 'produksjon' && unsigned.length) {
    notes.push({ level: 'middels', text: `${unsigned.length} SJA er ikke signert.` });
  }
  const openDev = state.deviations.filter((item) => item.projectId === projectId && item.status !== 'lukket');
  if (openDev.length) {
    notes.push({ level: 'middels', text: `${openDev.length} avvik er åpne. Lukk dem med årsak og tiltak.` });
  }
  const lists = state.checklists.filter((item) => item.projectId === projectId);
  const unfinished = lists.filter((item) => checklistScore(item) < 100);
  if (unfinished.length) {
    notes.push({ level: 'lav', text: `${unfinished.length} sjekklister er ikke fullført.` });
  }
  if (waste.total && waste.rate < waste.goal) {
    notes.push({ level: 'middels', text: `Sorteringsgrad ${waste.rate}% er under målet ${waste.goal}%.` });
  }
  const crewIn = state.crew.filter((item) => item.projectId === projectId && item.status === 'inne').length;
  if (project.phase === 'produksjon' && crewIn === 0) {
    notes.push({ level: 'lav', text: 'Ingen er sjekket inn på prosjektet.' });
  }
  if (!notes.length) notes.push({ level: 'lav', text: 'Ingen åpne varsler. Fremdrift, økonomi og HMS er innenfor det som er registrert.' });
  return notes;
}

export function projectReport(state, projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return 'Ingen prosjekt er valgt.';
  const economy = projectEconomy(state, projectId);
  const progress = progressSummary(state, projectId);
  const waste = wasteSummary(state, projectId);
  const advice = projectAdvice(state, projectId).map((item) => `- ${item.text}`).join('\n');
  return [
    `Prosjektrapport ${project.number} ${project.name}`,
    `Fase: ${project.phase}. Sted: ${project.place || '—'}. Leder: ${project.manager || '—'}.`,
    `Fremdrift: ${progress.percent}% av ${progress.count} aktiviteter.`,
    `Økonomi: inntekt ${economy.income} kr, kostnad ${economy.cost} kr, resultat ${economy.result} kr.`,
    `Kontrakt ${economy.contract} kr. Godkjente endringer ${economy.approvedChanges} kr.`,
    `Timer: ${economy.hours}. Avfallssortering: ${waste.rate}% (mål ${waste.goal}%).`,
    'Anbefalinger:',
    advice,
  ].join('\n');
}
