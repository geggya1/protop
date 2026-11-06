/** Hilsen, forslag og forbehold i Chat med AI for ansatte (functions/aiChat.js svarer). */

export const PARENT_GREETING = 'Hei! Jeg er ProTop-assistenten. Spør om prosjekter, timer, fravær, HMS, møter eller få hjelp med en tekst — vi tar det steg for steg.';

export const PARENT_DISCLAIMER = 'AI-assistenten kan gjøre feil. Svarene er veiledende og erstatter ikke fagfolk ved alvorlige tema.';

export function parentSuggestedPrompts() {
  return [
    'Skriv et kort referat fra et møte',
    'Lag en sjekkliste for oppstart av prosjekt',
    'Hvordan fører jeg timer i ProTop?',
    'Skriv et høflig svar til en kunde',
  ];
}
