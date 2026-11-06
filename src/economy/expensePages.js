/**
 * Gamle adresser (bokmerker, lenker i e-post og hjelpen): /hjem/arbeid/utlegg var Prosjektutlegg.
 * Den åpner nå Utlegg med filteret Prosjekt. /hjem/okonomi/utlegg er selve siden.
 */
export function movedExpensePage(tab, subView) {
  if (tab === 'arbeid' && subView === 'utlegg') {
    return { tab: 'okonomi', subView: 'utlegg', intent: { type: 'expenseScope', scope: 'prosjekt' } };
  }
  return null;
}
