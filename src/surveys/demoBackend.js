/**
 * Lokal demo av kundeundersøkelsen: kjører customerService.js mot en database i minnet, med
 * en utboks for e-post og noen ferdige undersøkelser. Brukes på /kundeundersokelse-demo
 * (bare i utviklingsbygg), så skjermene kan prøves uten innlogging og uten ekte data.
 */
import { handleCustomerSurvey } from './customerService.js';
import { createMemoryDb } from '../helpdesk/memoryDb.js';
import { newCustomerSurvey } from './customerSurvey.js';

export const DEMO_FAMILY = 'demo_bygg';
const STAFF = { uid: 'demoLeder', token: { name: 'Kari Leder', email: 'kari@bygg.no', email_verified: true } };

function token() {
  const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 32; i += 1) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

/** Enkel hash for demoen (serveren bruker sha256). */
async function hash(t) {
  let h = 2166136261;
  for (const c of String(t)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return `d${(h >>> 0).toString(16)}${String(t).length}`;
}

export function createCustomerSurveyDemo() {
  const db = createMemoryDb();
  const outbox = [];
  let clock = null;
  const deps = {
    db,
    now: () => clock || new Date(),
    sendMail: async (m) => { outbox.push(m); },
    assertAccess: async () => {},
    companyName: async () => 'Byggmester Hansen AS',
    newToken: token,
    hashToken: hash,
  };
  const api = (action, data = {}, auth = STAFF) => handleCustomerSurvey({ ...data, action }, auth, deps);
  const linkOf = (mail) => (mail.text.match(/svar\/([A-Za-z0-9_-]+)/) || [])[1];

  // Eksempeldata: to avsluttede år og ett åpent, så utviklingen og resultatene kan vises.
  const ready = (async () => {
    const customers = [
      ['Per Hansen', 'per@novaform.no', 'Novaform AS'], ['Lise Berg', 'lise@sola.kommune.no', 'Sola kommune'],
      ['Ola Nordmann', 'ola@privat.no', 'Ola Nordmann'], ['Anne Vik', 'anne@vikeiendom.no', 'Vik Eiendom AS'],
      ['Tor Lie', 'tor@lieborettslag.no', 'Lie borettslag'], ['Siri Dahl', 'siri@dahl.no', 'Siri Dahl'],
    ];
    const years = [
      { year: 2024, at: '2024-10-15T09:00:00Z', closeAt: '2024-11-05T09:00:00Z', base: [8, 3, 3, 4, 3, 3, 3] },
      { year: 2025, at: '2025-10-15T09:00:00Z', closeAt: '2025-11-05T09:00:00Z', base: [9, 4, 3, 4, 4, 3, 4] },
      { year: 2026, at: '2026-10-20T09:00:00Z', closeAt: null, base: [9, 5, 3, 4, 4, 4, 4] },
    ];
    for (const y of years) {
      clock = new Date(y.at);
      const { survey } = await api('save', { familyId: DEMO_FAMILY, survey: { ...newCustomerSurvey({ year: y.year, now: clock }), closesOn: `${y.year}-11-01` } });
      await api('addRecipients', { familyId: DEMO_FAMILY, surveyId: survey.id, recipients: customers.map(([name, email, customerName]) => ({ name, email, customerName, projectName: `Prosjekt ${customerName.split(' ')[0]}` })) });
      const start = outbox.length;
      await api('send', { familyId: DEMO_FAMILY, surveyId: survey.id });
      const mails = outbox.slice(start);
      for (let i = 0; i < mails.length - (y.closeAt ? 1 : 2); i += 1) {
        const v = y.base.map((b, j) => Math.max(j === 0 ? 0 : 1, Math.min(j === 0 ? 10 : 5, b + ((i * 7 + j * 3) % 3) - 1 - (i === 1 ? 3 : 0))));
        await api('submit', {
          token: linkOf(mails[i]),
          values: { nps: v[0], kvalitet: v[1], fremdrift: v[2], kommunikasjon: v[3], orden: v[4], pris: v[5], oppfolging: v[6] },
          texts: i === 1 ? { bedre: 'Holde fristene, og si fra tidligere når noe blir forsinket.' } : i === 2 ? { bedre: 'Ryddigere byggeplass.' } : {},
        }, null);
      }
      if (y.closeAt) {
        clock = new Date(y.closeAt);
        await api('close', { familyId: DEMO_FAMILY, surveyId: survey.id });
      }
    }
    clock = null;
  })();

  const backend = async (action, data) => {
    await ready;
    if (action === 'open' || action === 'submit') return api(action, data, null);
    return api(action, { familyId: DEMO_FAMILY, ...data });
  };
  backend.ready = ready;
  backend.outbox = outbox;
  backend.lastLink = () => linkOf(outbox[outbox.length - 1] || { text: '' });
  return backend;
}
