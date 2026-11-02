/**
 * Lokal demo av helpdesken: kjører service.js mot en database i minnet,
 * med eksempelsaker, en enkel AI og en utboks for e-post. Brukes på
 * /hjelp-demo og /helpdesk-demo (bare i utviklingsbygg), så alle skjermer
 * og handlinger kan prøves uten innlogging og uten å røre ekte data.
 */
import { handleHelpdesk } from './service';
import { createMemoryDb } from './memoryDb';

export const DEMO_AGENT = { uid: 'demoAgentGoa', token: { email: 'goa@invest-as.no', email_verified: true, name: 'Geir Ove (demo)' } };
export const DEMO_USER = { uid: 'demoUserKari', token: { email: 'kari@eksempel.no', email_verified: true, name: 'Kari Nordmann' } };
const DEMO_OTHERS = [
  { uid: 'demoUserPer01', token: { email: 'per@byggmester.no', email_verified: true, name: 'Per Hansen' } },
  { uid: 'demoUserLin01', token: { email: 'lin@regnskap.no', email_verified: true, name: 'Lin Berg' } },
];

/** Enkel «AI» for demoen: lager sammendrag, svarutkast og fiks-forslag av teksten. */
async function demoAi(system, parts) {
  const all = parts.map((p) => p.text || '').join('\n');
  // Bare saken selv (ikke kunnskapsbasen) avgjør om det er en feil.
  const text = all.split('Kunnskapsbase:')[0];
  const subject = (text.match(/Sak PT-\d+: (.*)/) || [])[1] || 'saken';
  const bug = /feil|virker ikke|hvit|500|error|TypeError|ingenting/i.test(text);
  const ids = [...all.matchAll(/\[([a-z0-9.-]+)\]/g)].map((m) => m[1]).slice(0, 2);
  return {
    summary: bug ? `Brukeren får en feil: ${subject.toLowerCase()}.` : `Brukeren spør: ${subject.toLowerCase()}.`,
    category: bug ? 'bug' : 'question',
    module: /faktura/i.test(text) ? 'okonomi' : /timeliste|timer/i.test(text) ? 'arbeid' : 'general',
    priority: /haster|alle ansatte|lønn i dag/i.test(text) ? 'urgent' : bug ? 'high' : 'normal',
    sentiment: /frustrert|elendig|!!/i.test(text) ? 'negative' : 'neutral',
    tags: bug ? ['feil'] : ['spørsmål'],
    isBug: bug,
    rootCause: bug ? 'Konsollen viser TypeError rett etter klikket. Trolig et felt som mangler på dokumentet.' : '',
    suggestedReply: bug
      ? 'Hei {navn},\n\nTakk for at du sa fra, og beklager bryet. Vi ser feilen i loggene og jobber med en rettelse. Du får beskjed her så snart den er ute.\n\nHilsen ProTop support'
      : 'Hei {navn},\n\nGodt spørsmål! Her er stegene:\n\n1. Åpne menyen\n2. Velg siden\n3. Trykk knappen øverst\n\nSi fra om noe er uklart.\n\nHilsen ProTop support',
    articleIds: ids,
    fix: bug ? {
      title: `Rett feil: ${subject}`.slice(0, 120),
      likelyCause: 'Et felt er undefined når handlingen kjører (se konsollfeil).',
      steps: ['Reproduser med samme side og nettleser', 'Legg inn sjekk for manglende felt', 'Vis brukeren en forståelig feilmelding', 'Legg til test'],
      filesToInspect: ['screens/economy/InvoiceDetail.jsx', 'functions/invoiceMail.js'],
      risk: 'low',
      testPlan: ['Gjenskap steget fra saken', 'Kjør npm run verify:web'],
    } : null,
  };
}

const DIAG = {
  page: { path: '/hjem/okonomi/faktura', tab: 'okonomi', subView: 'faktura', workspace: 'company', companyName: 'Byggmester Hansen AS' },
  env: { appVersion: '2.0.0', buildId: 'demo', platform: 'web', os: 'Windows 10/11', browser: 'Chrome 141', language: 'nb-NO', viewport: '1440x900', screen: '1920x1080', online: true },
  console: [
    { level: 'error', message: "TypeError: Cannot read properties of undefined (reading 'kid')\n    at finalizeInvoice (InvoiceDetail.jsx:412)", count: 2 },
    { level: 'warn', message: 'Fakturaen mangler mottakerens org.nr.', count: 1 },
  ],
  network: [{ method: 'POST', url: 'https://europe-west1-protop-c189c.cloudfunctions.net/sendInvoiceMail', status: 500, ok: false, durationMs: 812 }],
  breadcrumbs: [
    { type: 'side', label: '/hjem/okonomi' },
    { type: 'side', label: '/hjem/okonomi/faktura' },
    { type: 'klikk', label: 'Faktura 16712' },
    { type: 'klikk', label: 'Ferdigstill og send' },
  ],
};

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export function createDemoBackend() {
  const db = createMemoryDb();
  const outbox = [];
  let clock = Date.now() - 3 * 24 * 60 * 60 * 1000;
  let realTime = false;
  let who = DEMO_USER;
  const deps = {
    db,
    ai: demoAi,
    now: () => (realTime ? Date.now() : clock),
    sendMail: async (m) => { outbox.unshift({ ...m, atMs: realTime ? Date.now() : clock }); },
    companyContext: async (id) => (id ? { id, name: 'Byggmester Hansen AS' } : null),
  };
  const as = (auth, action, data = {}) => handleHelpdesk({ action, ...data }, auth, deps);
  const advance = (min) => { clock += min * 60 * 1000; };

  const ready = (async () => {
    const a = await as(DEMO_OTHERS[0], 'createTicket', {
      subject: 'Fakturaen blir ikke sendt – det skjer ingenting',
      body: 'Når jeg trykker «Ferdigstill og send» på faktura 16712 skjer det ingenting. Kunden venter på fakturaen og vi har frist i dag!!',
      category: 'bug', impact: 'blocked', module: 'okonomi', companyId: 'demoCompany1', diagnostics: DIAG,
      attachments: [{ name: 'skjermbilde.png', type: 'image/png', data: PIXEL }],
    });
    advance(40);
    await as(DEMO_OTHERS[1], 'createTicket', {
      subject: 'Hvordan inviterer jeg en ny ansatt?',
      body: 'Vi har fått en ny regnskapsmedarbeider. Hvor legger jeg henne inn, og får hun e-post?',
      category: 'question', impact: 'minor', module: 'ansatte',
    });
    advance(90);
    const c = await as(DEMO_USER, 'createTicket', {
      subject: 'Ser ikke Timeliste i menyen',
      body: 'Etter at jeg byttet telefon ser jeg ikke Timeliste lenger. Kollegaene mine ser den.',
      category: 'access', impact: 'hard', module: 'arbeid',
      diagnostics: { ...DIAG, page: { path: '/hjem', tab: 'home', workspace: 'company' }, console: [], network: [] },
    });
    advance(30);
    await as(DEMO_AGENT, 'agentReply', {
      id: c.id,
      body: 'Hei Kari,\n\nTakk for at du tok kontakt. Står det «Bedrift» øverst, og er riktig bedrift valgt? Send gjerne et skjermbilde av menyen.\n\nHilsen ProTop support',
      status: 'pending',
    });
    advance(200);
    const d = await as(DEMO_USER, 'createTicket', {
      subject: 'Ønske: eksport av kjørebok til Excel',
      body: 'Det hadde vært fint å kunne eksportere kjøreboken direkte til Excel for regnskapsføreren.',
      category: 'feature', impact: 'minor', module: 'kjorebok',
    });
    advance(60);
    await as(DEMO_AGENT, 'agentReply', {
      id: d.id,
      body: 'Hei Kari,\n\nTakk for forslaget! Kjøreboken kan allerede eksporteres: Kjørebok → «Eksporter kjørebok». Vi har likevel notert ønsket om Excel-format.\n\nHilsen ProTop support',
      status: 'solved',
    });
    await as(DEMO_USER, 'rate', { id: d.id, rating: 'good', comment: 'Takk!' });
    advance(30);
    await as(DEMO_USER, 'assistantOutcome', { resolved: true });
    await as(DEMO_USER, 'assistantOutcome', { resolved: true });
    await as(DEMO_USER, 'assistantOutcome', { resolved: true });
    await as(DEMO_USER, 'assistantOutcome', { resolved: false });
    await as(DEMO_USER, 'articleFeedback', { articleId: 'blank-screen', kind: 'view' });
    await as(DEMO_USER, 'articleFeedback', { articleId: 'cant-login', kind: 'view' });
    await as(DEMO_AGENT, 'agentFix', { id: a.id, state: 'proposed', note: 'Opprettet av AI' }).catch(() => {});
    realTime = true;
  })();

  async function call(action, data = {}) {
    await ready;
    return as(who, action, data);
  }
  call.setIdentity = (role) => { who = role === 'agent' ? DEMO_AGENT : DEMO_USER; };
  call.identity = () => (who === DEMO_AGENT ? 'agent' : 'user');
  call.outbox = outbox;
  call.ready = ready;
  return call;
}
