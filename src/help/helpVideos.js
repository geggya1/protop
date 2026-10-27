/**
 * Støttevideoer for hjelpen: korte opptak av ProTop med engelsk tale og tekst, så alle forstår.
 * Filene ligger i public/help/video/ (mp4 + WebVTT) og serveres fra protop.no.
 * Hver video hører til én eller flere hjelpesider (nøklene i protopPages.js).
 */

export const tx = (nb, en) => ({ nb, en });

/**
 * Katalogen. Tom til videoene er godkjent for publisering: filene i public/help/video blir offentlige på
 * protop.no når de flettes til main. Format per video:
 * { id, file: '02-report-deviation', seconds, title: tx(nb, en), pitch: tx(nb, en), pages: ['iso.avvik'] }
 */
export const HELP_VIDEOS = [];

export const VIDEO_BASE = '/help/video/';
const ORIGIN = 'https://protop.no';

function pick(value, lang) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[lang] || (['da', 'sv'].includes(lang) ? value.nb : '') || value.en || value.nb || '';
}

/** Videoen klar til visning. absolute = full adresse (mobilappen åpner den i nettleseren). */
export function videoView(v, lang = 'nb', { absolute = false } = {}) {
  const base = `${absolute ? ORIGIN : ''}${VIDEO_BASE}`;
  return {
    id: v.id,
    title: pick(v.title, lang),
    pitch: pick(v.pitch, lang),
    minutes: Math.max(1, Math.round((Number(v.seconds) || 60) / 60)),
    src: `${base}${v.file}.mp4`,
    captions: `${base}${v.file}.en.vtt`,
    language: 'en',
  };
}

/** Videoene for en hjelpeside, i katalogens rekkefølge. */
export function videosForPage(pageKey, lang = 'nb', { catalog = HELP_VIDEOS, ...opts } = {}) {
  if (!pageKey) return [];
  return catalog.filter((v) => (v.pages || []).includes(pageKey)).map((v) => videoView(v, lang, opts));
}

export function listVideos(lang = 'nb', { catalog = HELP_VIDEOS, ...opts } = {}) {
  return catalog.map((v) => videoView(v, lang, opts));
}
