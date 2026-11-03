/**
 * Lokal demo av kundeundersøkelsen: kjører customerService.js mot en database i minnet, med
 * en utboks for e-post og noen ferdige undersøkelser. Brukes på /kundeundersokelse-demo
 * (bare i utviklingsbygg), så skjermene kan prøves uten innlogging og uten ekte data.
 */
import { handleCustomerSurvey } from './customerService.js';
import { createMemoryDb } from '../helpdesk/memoryDb.js';
import { BUILTIN_TEMPLATES, newCustomerSurvey, newEvaluation } from './customerSurvey.js';

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
      { year: 2024, at: '2024-10-15T09:00:00Z', closeAt: '2024-11-05T09:00:00Z', base: [8.6, 3.4, 2.3, 3.1, 3.6, 3.0, 2.6] },
      { year: 2025, at: '2025-10-15T09:00:00Z', closeAt: '2025-11-05T09:00:00Z', base: [9.1, 3.9, 2.8, 3.4, 3.9, 3.1, 3.2] },
      { year: 2026, at: '2026-10-20T09:00:00Z', closeAt: null, base: [9.4, 4.4, 3.1, 4.0, 3.7, 3.4, 3.8] },
    ];
    // Fast «tilfeldighet», så demoen ser lik ut hver gang.
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (const y of years) {
      clock = new Date(y.at);
      const { survey } = await api('save', { familyId: DEMO_FAMILY, survey: { ...newCustomerSurvey({ year: y.year, now: clock }), closesOn: `${y.year}-11-01` } });
      await api('addRecipients', { familyId: DEMO_FAMILY, surveyId: survey.id, recipients: customers.map(([name, email, customerName]) => ({ name, email, customerName, projectName: `Prosjekt ${customerName.split(' ')[0]}` })) });
      const start = outbox.length;
      await api('send', { familyId: DEMO_FAMILY, surveyId: survey.id });
      const mails = outbox.slice(start);
      for (let i = 0; i < mails.length - (y.closeAt ? 1 : 2); i += 1) {
        clock = new Date(new Date(y.at).getTime() + (i + 1) * 86400000);
        const v = y.base.map((b, j) => {
          const val = Math.round(b + (rnd() - 0.5) * (j === 0 ? 4 : 1.6) - (i === 1 ? (j === 0 ? 4 : 1.5) : 0));
          return Math.max(j === 0 ? 0 : 1, Math.min(j === 0 ? 10 : 5, val));
        });
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
    // Prosjektevalueringer: én ferdig (begge svarte, så den ble avsluttet) og én som venter på svar.
    const projectTemplate = BUILTIN_TEMPLATES.find((t) => t.id === 'std_prosjekt');
    await api('saveTemplate', {
      familyId: DEMO_FAMILY,
      template: { name: 'Ettårsbefaring', kind: 'project', intro: 'Det er gått ett år siden overleveringen. Hvordan har bygget fungert?', questions: projectTemplate.questions.slice(0, 4) },
    });
    const evals = [
      { at: '2026-06-10T09:00:00Z', link: { type: 'project', id: 'demo_p1', name: 'Sola skole, tilbygg', number: '1042' }, unit: { id: 'avd_bygg', name: 'Bygg' }, who: customers.slice(0, 2), answer: true },
      { at: '2026-10-28T09:00:00Z', link: { type: 'project', id: 'demo_p2', name: 'Vik Eiendom, rehabilitering', number: '1077' }, unit: { id: 'avd_rehab', name: 'Rehabilitering' }, who: customers.slice(3, 4), answer: false },
    ];
    for (const e of evals) {
      clock = new Date(e.at);
      const { survey } = await api('save', { familyId: DEMO_FAMILY, survey: newEvaluation({ template: projectTemplate, link: e.link, unit: e.unit, now: clock }) });
      await api('addRecipients', { familyId: DEMO_FAMILY, surveyId: survey.id, recipients: e.who.map(([name, email, customerName]) => ({ name, email, customerName, projectName: e.link.name })) });
      const start = outbox.length;
      await api('send', { familyId: DEMO_FAMILY, surveyId: survey.id });
      if (!e.answer) continue;
      for (const [i, mail] of outbox.slice(start).entries()) {
        clock = new Date(new Date(e.at).getTime() + (i + 2) * 86400000);
        await api('submit', {
          token: linkOf(mail),
          values: { nps: 9 - i, resultat: 5, fremdrift: 4 - i, prosjektledelse: 4, kommunikasjon: 5 - i, samarbeid: 5, endringer: 3, orden: 4, overlevering: 4 },
          texts: i === 0 ? { bra: 'Fast kontaktperson og ukentlige møter.', bedre: 'Raskere svar på endringer.' } : {},
        }, null);
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
  backend.lastLink = () => linkOf([...outbox].reverse().find((m) => /svar\//.test(m.text)) || { text: '' });
  return backend;
}
