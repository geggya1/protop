/**
 * Farger til diagrammer (årshjul, medarbeiderundersøkelse). Skjermene henter dem med
 * chartColorsFor(colors), så lys og mørk modus har hver sine validerte trinn.
 *
 * Svarfordeling (likert): to armer i hver sin farge (rød = negativt, blå = positivt) og en grå
 * midte. Armene er validert som ordinale skalaer mot kortflaten, og midten mot nabotrinnene
 * (dataviz validate_palette.js). Segmentene skilles i tillegg av et mellomrom, og prosenttall og
 * forklaring gir samme informasjon uten farge.
 *
 * Status (gjort, nå, forsinket, planlagt) bruker appens statusfarger og vises alltid med ikon og tekst.
 */
import { DARK } from '../appearance/palette.js';

const LIGHT_CHART = {
  likert: ['#c93a39', '#ee8f8d', '#e5e7eb', '#86b6ef', '#256abf'],
  bar: '#256abf',
  barTrack: '#e5e7eb',
  planned: '#86b6ef',
  idle: '#e5e7eb',
  segment: '#eef2f7',
  segmentNow: '#d7ebfd',
};

const DARK_CHART = {
  likert: ['#e66767', '#9b3131', '#3a3a3e', '#1c5cab', '#5598e7'],
  bar: '#5598e7',
  barTrack: '#3a3a3e',
  planned: '#1c5cab',
  idle: '#3a3a3e',
  segment: '#2c2c2e',
  segmentNow: '#0f3557',
};

export const LIKERT_LABELS = ['Svært negativt', 'Negativt', 'Nøytralt', 'Positivt', 'Svært positivt'];

export function chartColorsFor(colors) {
  const dark = colors?.card === DARK.card || colors?.bg === DARK.bg;
  const base = dark ? DARK_CHART : LIGHT_CHART;
  return {
    ...base,
    done: colors?.success,
    now: colors?.warn,
    late: colors?.danger,
    // ISO-årshjulet i den samlede visningen (egen identitet, med forklaring).
    iso: colors?.accent,
    surface: colors?.card,
  };
}
