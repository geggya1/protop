/**
 * Les HMS-kortet fra et bilde av forsiden med AI (interpretImport, kind hmsCard).
 * Gir kortnummer, gyldig til, navn, fødselsdato og arbeidsgiver.
 */
import { askImportInterpret } from '../imports/interpretClient.js';
import { sanitizeHmsCardRead } from './hmsCard.js';

export async function readHmsCardPhoto({ familyId, bytes, filename = 'hms-kort.jpg', mime = 'image/jpeg' }) {
  const res = await askImportInterpret({
    familyId,
    kind: 'hmsCard',
    mode: 'ocr',
    bytes,
    filename,
    media: { mime },
  });
  return sanitizeHmsCardRead(res?.card || {});
}
