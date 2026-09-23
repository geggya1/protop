/**
 * Barnerettigheter for reise-apper (Våre reiser + Reiseplanlegger):
 * - Visning når appen er på
 * - Redigering/oppretting kun når travelSelfEdit er på
 */

export function childCanEditTravel({ isChild, travelSelfEdit }) {
  return isChild === true && travelSelfEdit === true;
}

/** Lesemodus for innlogget barn / «vis som barn» uten redigeringstillatelse. */
export function childTravelReadOnly({ isChildViewer, travelSelfEdit }) {
  if (!isChildViewer) return false;
  return travelSelfEdit !== true;
}

/**
 * Samlet sjekk for om reiseinnhold kan endres.
 * Parents (ikke «vis som barn») får alltid redigere når tripEditable.
 * Barn / vis-som-barn trenger travelSelfEdit.
 */
export function canEditTravelContent({
  isChildViewer = false,
  travelSelfEdit = false,
  tripEditable = true,
} = {}) {
  if (tripEditable === false) return false;
  if (!isChildViewer) return true;
  return travelSelfEdit === true;
}
