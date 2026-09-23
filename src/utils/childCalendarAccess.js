/**
 * Barnerettigheter for familiekalender:
 * - Lesing av synlige hendelser (standard)
 * - Redigering/oppretting kun når calendarSelfEdit er på
 * - Kalenderinnstillinger (eksterne kalendere) er kun for foreldre
 */

export function childCanCreateCalendarEvent({ isChild, calendarSelfEdit }) {
  return isChild === true && calendarSelfEdit === true;
}

/** Barn kan åpne synlige hendelser i lesemodus. */
export function childCanOpenCalendarEvent({ isChild }) {
  return isChild === true;
}

/** Lesemodus for kalenderhendelse når innlogget barn (ikke foresatt som ser på). */
export function childCalendarEventReadOnly({ isChild, calendarSelfEdit, isParentViewer }) {
  if (isParentViewer) return false;
  if (!isChild) return false;
  return calendarSelfEdit !== true;
}

export function canShowCalendarSettings({ isParent, asChildViewer }) {
  return isParent === true && asChildViewer !== true;
}

export function canCreateFamilyCalendarEvent({ isParent, asChildViewer, childCanEditCalendar }) {
  if (asChildViewer) return !!childCanEditCalendar;
  return !!isParent;
}
