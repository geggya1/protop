/**
 * Flaten på Hjem. Som i Weekplan er standard et naturbilde med glasskort oppå
 * (mørkt glass i bildets farge, hvit tekst). «Uten bilde» – kort på sidens bakgrunn,
 * som i modulene – er et valg under Tilpass hjem. Ren logikk uten bilder, så
 * node-testene kan lese den.
 */

export const PLAIN_BANNER_ID = 'plain';

/** Standardbildet på Hjem, og bildet som brukes når et valgt bilde mangler. */
export const DEFAULT_PHOTO_BANNER_ID = 'natur-innsjo-hytte-morgen';

/** Har Hjem et bakgrunnsbilde (ferdig eller eget)? */
export function hasHomePhoto(bannerId) {
  return !!bannerId && bannerId !== PLAIN_BANNER_ID;
}

/**
 * En periode (UX-05) var «Uten bilde» standard og ble lagret uten at personen hadde
 * valgt det. Uten eget valg (bannerChosen) får Hjem nå naturbildet og glasset. Den som
 * selv har valgt «Uten bilde», et annet bilde eller eget bilde under Tilpass hjem,
 * beholder valget.
 */
export function resolveParentBannerId(bannerId, { bannerChosen = false } = {}) {
  if (!bannerChosen && (!bannerId || bannerId === PLAIN_BANNER_ID)) return DEFAULT_PHOTO_BANNER_ID;
  return bannerId;
}
