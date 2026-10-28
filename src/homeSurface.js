/**
 * Flaten på Hjem (UX-05). Uten bakgrunnsbilde er Hjem den samme ProTop-flaten som
 * modulene: kort på sidens bakgrunn. Det er standard; bakgrunnsbilde er et valg under
 * Tilpass hjem. Ren logikk uten bilder, så node-testene kan lese den.
 */

export const PLAIN_BANNER_ID = 'plain';

/** Naturbildet som var standard før UX-05, og som brukes når et valgt bilde mangler. */
export const DEFAULT_PHOTO_BANNER_ID = 'natur-innsjo-hytte-morgen';

/** Har Hjem et bakgrunnsbilde (ferdig eller eget)? */
export function hasHomePhoto(bannerId) {
  return !!bannerId && bannerId !== PLAIN_BANNER_ID;
}

/**
 * Før UX-05 ble naturbildet lagret som standard uten at personen hadde valgt det.
 * Uten eget valg (bannerChosen) viser Hjem nå ProTop-flaten. Et bilde valgt under
 * Tilpass hjem, et annet naturbilde eller eget bilde står som før.
 */
export function resolveParentBannerId(bannerId, { bannerChosen = false } = {}) {
  if (!bannerChosen && bannerId === DEFAULT_PHOTO_BANNER_ID) return PLAIN_BANNER_ID;
  return bannerId;
}
