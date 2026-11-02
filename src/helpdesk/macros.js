/**
 * Helpdesk: ferdige svar (Zendesk «makroer», Help Scout «saved replies»).
 * {navn} og {sak} fylles inn. Hver makro kan også sette status.
 */

export const MACROS = [
  {
    id: 'ack',
    title: 'Bekreft og undersøk',
    status: 'open',
    body: 'Hei {navn},\n\nTakk for at du sa fra. Vi ser på saken ({sak}) nå og kommer tilbake til deg så snart vi vet mer.\n\nHilsen ProTop support',
  },
  {
    id: 'need-info',
    title: 'Trenger mer info',
    status: 'pending',
    body: 'Hei {navn},\n\nFor å finne ut av dette trenger vi litt mer:\n\n1. Hva prøvde du å gjøre rett før det skjedde?\n2. Skjer det hver gang, eller bare av og til?\n3. Har du et skjermbilde av det du ser?\n\nSvar rett i saken, så går vi videre.\n\nHilsen ProTop support',
  },
  {
    id: 'hard-refresh',
    title: 'Last siden på nytt',
    status: 'pending',
    body: 'Hei {navn},\n\nDette skyldes ofte at nettleseren har en eldre versjon av ProTop i minnet. Prøv dette:\n\n• PC: trykk Ctrl + Shift + R (Mac: Cmd + Shift + R)\n• Mobil: lukk appen helt og åpne den igjen\n\nSi gjerne fra om det hjalp.\n\nHilsen ProTop support',
  },
  {
    id: 'access-admin',
    title: 'Tilgang: kontakt administrator',
    status: 'solved',
    body: 'Hei {navn},\n\nModulen er styrt av bedriftens tilgangsoppsett. En administrator i bedriften kan gi deg tilgang under Bedriftsinnstillinger → Tilgangsstyring (eller slå på modulen under Modulinnstillinger).\n\nSi fra hvis du trenger hjelp til å finne ut hvem som er administrator.\n\nHilsen ProTop support',
  },
  {
    id: 'bug-confirmed',
    title: 'Feil bekreftet – rettes',
    status: 'on_hold',
    body: 'Hei {navn},\n\nTakk! Vi har funnet feilen og jobber med en rettelse. Du får beskjed i saken når den er ute.\n\nHilsen ProTop support',
  },
  {
    id: 'fixed-live',
    title: 'Rettet og ute',
    status: 'solved',
    body: 'Hei {navn},\n\nRettelsen er nå ute. Last siden på nytt (Ctrl + Shift + R, eller lukk og åpne appen), så skal det virke.\n\nSi fra hvis noe fortsatt er galt, så åpner vi saken igjen.\n\nHilsen ProTop support',
  },
  {
    id: 'feature-logged',
    title: 'Ønske registrert',
    status: 'solved',
    body: 'Hei {navn},\n\nTakk for forslaget! Vi har lagt det inn i ønskelisten vår. Vi kan ikke love når det kommer, men slike innspill styrer hva vi lager.\n\nHilsen ProTop support',
  },
  {
    id: 'solved-generic',
    title: 'Løst – ta kontakt igjen',
    status: 'solved',
    body: 'Hei {navn},\n\nVi markerer saken som løst. Er det noe mer, svarer du bare her innen 7 dager, så åpner vi den igjen.\n\nHilsen ProTop support',
  },
];

export function fillMacro(text, { name = '', number = '' } = {}) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return String(text || '')
    .replace(/\{navn\}/g, first || 'der')
    .replace(/\{sak\}/g, number || '');
}
