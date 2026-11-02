/**
 * Helpdesk: hele saksløpet mot en Firestore i minnet.
 * node --test functions/helpdesk.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleHelpdesk, developerBrief } from './helpdesk.js';
import { createMemoryDb } from '../src/helpdesk/memoryDb.js';


function setup({ ai = null } = {}) {
  const db = createMemoryDb();
  const mails = [];
  let clock = Date.UTC(2026, 10, 2, 9, 0, 0);
  const deps = {
    db,
    sendMail: async (m) => { mails.push(m); },
    ai,
    now: () => clock,
    companyContext: async (id) => (id ? { id, name: 'Testbedrift AS' } : null),
  };
  const call = (auth, action, data = {}) => handleHelpdesk({ action, ...data }, auth, deps);
  return { db, mails, deps, call, tick: (ms) => { clock += ms; }, now: () => clock };
}

const OWNER = { uid: 'ownerUid01', token: { email: 'goa@invest-as.no', email_verified: true, name: 'Geir Ove' } };
const USER = { uid: 'userUid001', token: { email: 'kari@firma.no', email_verified: true, name: 'Kari Nordmann' } };
const OTHER = { uid: 'otherUid01', token: { email: 'per@annet.no', email_verified: true, name: 'Per' } };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const diagnostics = {
  page: { path: '/hjem/okonomi/faktura?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk', tab: 'okonomi', subView: 'faktura', workspace: 'company' },
  env: { appVersion: '2.0.0', buildId: 'abc123', platform: 'web', browser: 'Chrome 141', userAgent: 'Mozilla/5.0', online: true },
  console: [{ level: 'error', message: 'TypeError: Cannot read properties of undefined (reading kid) apiKey=AIzaSyA1234567890abcdefghijklmnop', count: 3 }],
  network: [{ method: 'post', url: 'https://europe-west1-protop-c189c.cloudfunctions.net/sendInvoiceMail?x=1', status: 500, ok: false }],
  breadcrumbs: [{ type: 'nav', label: '/hjem/okonomi' }, { type: 'click', label: 'Ferdigstill og send' }],
};

async function newTicket(env, extra = {}) {
  return env.call(USER, 'createTicket', {
    subject: 'Fakturaen blir ikke sendt',
    body: 'Når jeg trykker Ferdigstill og send skjer det ingenting. Kunden har ikke fått fakturaen.',
    category: 'bug',
    impact: 'blocked',
    module: 'okonomi',
    companyId: 'companyAbc1',
    diagnostics,
    attachments: [{ name: 'skjerm.png', type: 'image/png', data: PNG }],
    ...extra,
  });
}

test('oppretter sak med nummer, kvittering, varsel til teamet, vasket teknisk info og bilde', async () => {
  const env = setup();
  const res = await newTicket(env);
  assert.equal(res.number, 'PT-1001');
  assert.equal(res.receiptSent, true);
  assert.equal(res.email, 'kari@firma.no');
  const t = env.db.store.get(`helpdeskTickets/${res.id}`);
  assert.equal(t.status, 'new');
  assert.equal(t.priority, 'high');
  assert.equal(t.requester.uid, USER.uid);
  assert.equal(t.requester.email, 'kari@firma.no');
  assert.equal(t.requester.name, 'Kari Nordmann');
  assert.equal(t.requester.companyName, 'Testbedrift AS');
  assert.equal(t.diagnostics.page.path, '/hjem/okonomi/faktura', 'spørrestreng med token fjernes');
  assert.ok(!JSON.stringify(t.diagnostics).includes('AIzaSy'), 'API-nøkkel fjernes');
  assert.equal(t.diagnosticsSummary.errors, 1);
  assert.equal(t.diagnosticsSummary.failedRequests, 1);
  assert.equal(t.attachments.length, 1);
  assert.ok(t.tags.includes('konsollfeil'));
  assert.equal(t.ai.engine, 'regler', 'uten AI brukes regler');
  const receipt = env.mails.find((m) => m.to === 'kari@firma.no');
  assert.match(receipt.subject, /PT-1001/);
  assert.match(receipt.text, /Ferdigstill og send/);
  assert.match(receipt.html, /hjelp\/sak\//);
  const alert = env.mails.find((m) => m.to === 'goa@invest-as.no');
  assert.match(alert.subject, /Ny sak PT-1001/);
  assert.match(alert.text, /userUid001/);
  assert.match(alert.text, /sendInvoiceMail/);
  // Neste sak får neste nummer.
  const second = await newTicket(env, { attachments: [] });
  assert.equal(second.number, 'PT-1002');
});

test('validerer input og bilder', async () => {
  const env = setup();
  await assert.rejects(env.call(USER, 'createTicket', { subject: 'Hei', body: 'kort' }), /minst 10 tegn/);
  await assert.rejects(newTicket(env, { attachments: [{ name: 'x.exe', type: 'application/x-msdownload', data: 'AAAA' }] }), /Bare bilder/);
  await assert.rejects(newTicket(env, { attachments: Array(5).fill({ name: 'a.png', type: 'image/png', data: PNG }) }), /maks 4/);
  await assert.rejects(handleHelpdesk({ action: 'myTickets' }, null, env.deps), /innlogget/);
});

test('kunden ser bare egne saker og aldri interne notater', async () => {
  const env = setup();
  const { id } = await newTicket(env);
  const mine = await env.call(USER, 'myTickets');
  assert.equal(mine.tickets.length, 1);
  assert.equal(mine.tickets[0].number, 'PT-1001');
  assert.equal(mine.tickets[0].ai, undefined, 'AI-felt er ikke med til kunden');
  const others = await env.call(OTHER, 'myTickets');
  assert.equal(others.tickets.length, 0);
  await assert.rejects(env.call(OTHER, 'myTicket', { id }), /Fant ikke/);
  await env.call(OWNER, 'agentReply', { id, body: 'Internt: ser ut som KID-feil', internal: true });
  const view = await env.call(USER, 'myTicket', { id });
  assert.ok(view.messages.every((m) => !/Internt/.test(m.body)));
  assert.ok(view.messages.every((m) => m.role !== 'system'));
});

test('bare helpdesk-teamet kommer inn i portalen', async () => {
  const env = setup();
  await newTicket(env);
  await assert.rejects(env.call(USER, 'agentList', {}), /ikke tilgang/);
  const unverified = { uid: 'ownerFake1', token: { email: 'goa@invest-as.no', email_verified: false } };
  await assert.rejects(env.call(unverified, 'agentList', {}), /Bekreft e-postadressen/);
  const s = await env.call(unverified, 'session');
  assert.equal(s.isAgent, false);
  assert.equal(s.needsVerification, true);
  const ok = await env.call(OWNER, 'session');
  assert.equal(ok.isAgent, true);
  assert.equal(ok.role, 'owner');
  const list = await env.call(OWNER, 'agentList', { view: 'open' });
  assert.equal(list.tickets.length, 1);
  assert.equal(list.counts.open, 1);
  assert.equal(list.counts.unassigned, 1);
  assert.equal(list.counts.bugs, 1);
});

test('svar fra support: første svartid, tildeling, e-post, kunden svarer og saken gjenåpnes', async () => {
  const env = setup();
  const { id } = await newTicket(env);
  env.mails.length = 0;
  env.tick(30 * 60 * 1000);
  const r = await env.call(OWNER, 'agentReply', { id, body: 'Hei Kari, kan du sende kundens org.nr.?', status: 'pending' });
  assert.equal(r.status, 'pending');
  assert.equal(r.emailSent, true);
  let t = env.db.store.get(`helpdeskTickets/${id}`);
  assert.ok(t.firstResponseAtMs);
  assert.equal(t.assigneeUid, OWNER.uid);
  assert.equal(t.unreadForRequester, true);
  assert.match(env.mails[0].subject, /Nytt svar/);
  const mine = await env.call(USER, 'myTickets');
  assert.equal(mine.tickets[0].unreadForRequester, true);
  await env.call(USER, 'myTicket', { id });
  t = env.db.store.get(`helpdeskTickets/${id}`);
  assert.equal(t.unreadForRequester, false);
  env.mails.length = 0;
  await env.call(USER, 'myReply', { id, body: 'Org.nr. er 999888777', attachments: [{ name: 'b.png', type: 'image/png', data: PNG }] });
  t = env.db.store.get(`helpdeskTickets/${id}`);
  assert.equal(t.status, 'open');
  assert.equal(t.unreadForAgent, true);
  assert.equal(t.attachments.length, 2);
  assert.equal(env.mails[0].to, 'goa@invest-as.no', 'tildelt saksbehandler varsles');
});

test('løse, gi vurdering, gjenåpne innen fristen, automatisk lukking og arkiv', async () => {
  const env = setup();
  const { id } = await newTicket(env);
  env.mails.length = 0;
  await env.call(OWNER, 'agentUpdate', { id, status: 'solved', note: 'Rettet i versjon 2.0.1' });
  let t = env.db.store.get(`helpdeskTickets/${id}`);
  assert.equal(t.status, 'solved');
  assert.ok(t.autoCloseAtMs > t.solvedAtMs);
  assert.match(env.mails[0].subject, /løst/);
  assert.match(env.mails[0].text, /Rettet i versjon 2.0.1/);
  await env.call(USER, 'rate', { id, rating: 'good', comment: 'Rask hjelp' });
  assert.equal(env.db.store.get(`helpdeskTickets/${id}`).csat.rating, 'good');
  // Gjenåpne ved å svare.
  await env.call(USER, 'myReply', { id, body: 'Det skjer fortsatt dessverre' });
  assert.equal(env.db.store.get(`helpdeskTickets/${id}`).status, 'open');
  // Løs igjen, vent 8 dager: lukkes og arkiveres av seg selv.
  await env.call(OWNER, 'agentUpdate', { id, status: 'solved' });
  env.tick(8 * 24 * 60 * 60 * 1000);
  const list = await env.call(OWNER, 'agentList', { view: 'open' });
  assert.equal(list.counts.open, 0);
  t = env.db.store.get(`helpdeskTickets/${id}`);
  assert.equal(t.status, 'closed');
  assert.equal(t.archived, true);
  const archive = await env.call(OWNER, 'agentList', { view: 'archive' });
  assert.equal(archive.counts.archive, 1);
  await assert.rejects(env.call(USER, 'myReply', { id, body: 'Hallo igjen her' }), /lukket/);
});

test('lukke direkte sender beskjed om at saken er lukket', async () => {
  const env = setup();
  const { id } = await newTicket(env);
  env.mails.length = 0;
  await env.call(OWNER, 'agentUpdate', { id, status: 'closed' });
  assert.match(env.mails[0].subject, /lukket/);
  assert.equal(env.db.store.get(`helpdeskTickets/${id}`).archived, true);
});

test('AI-triage: oppsummering, svarutkast og fiks-forslag som må godkjennes', async () => {
  const ai = async (system, parts) => {
    assert.match(system, /JSON/);
    assert.ok(parts.some((p) => p.inlineData?.data), 'skjermbildet sendes med');
    return {
      summary: 'Fakturautsending feiler med 500 fra sendInvoiceMail',
      category: 'bug', module: 'okonomi', priority: 'urgent', sentiment: 'negative',
      tags: ['faktura'], isBug: true, rootCause: 'KID mangler',
      suggestedReply: 'Hei {navn}, vi ser på det. Hilsen ProTop support',
      articleIds: ['invoice-not-sent', 'finnes-ikke'],
      fix: { title: 'Håndter manglende KID', likelyCause: 'kid undefined', steps: ['Sjekk KID'], filesToInspect: ['functions/invoiceMail.js'], risk: 'low', testPlan: ['Send faktura uten KID'] },
    };
  };
  const env = setup({ ai });
  const { id } = await newTicket(env);
  const t = env.db.store.get(`helpdeskTickets/${id}`);
  assert.equal(t.ai.engine, 'gemini');
  assert.equal(t.priority, 'urgent', 'AI kan løfte prioritet');
  assert.deepEqual(t.ai.articleIds, ['invoice-not-sent']);
  assert.equal(t.fix.state, 'proposed');
  const detail = await env.call(OWNER, 'agentGet', { id });
  assert.match(detail.brief, /Håndter manglende KID/);
  assert.match(detail.brief, /sendInvoiceMail/);
  assert.equal(detail.articles[0].id, 'invoice-not-sent');
  const approved = await env.call(OWNER, 'agentFix', { id, state: 'approved', note: 'Ta med i neste release' });
  assert.equal(approved.fix.state, 'approved');
  const deployed = await env.call(OWNER, 'agentFix', { id, state: 'deployed', prUrl: 'https://github.com/x/y/pull/1' });
  assert.equal(deployed.fix.history.length, 2);
  await assert.rejects(env.call(USER, 'agentFix', { id, state: 'approved' }), /ikke tilgang/);
  const stats = await env.call(OWNER, 'agentStats');
  assert.equal(stats.stats.open, 1);
});

test('team: invitere, akseptere ved innlogging, fjerne', async () => {
  const env = setup();
  await env.call(OWNER, 'session');
  await assert.rejects(env.call(OWNER, 'teamInvite', { email: 'feil' }), /gyldig/);
  const inv = await env.call(OWNER, 'teamInvite', { email: 'Ola@ProTop.no', role: 'agent' });
  assert.equal(inv.emailSent, true);
  assert.match(env.mails.at(-1).subject, /invitert/);
  const ola = { uid: 'olaUid0001', token: { email: 'ola@protop.no', email_verified: true, name: 'Ola' } };
  const s = await env.call(ola, 'session');
  assert.equal(s.isAgent, true);
  assert.equal(s.role, 'agent');
  await assert.rejects(env.call(ola, 'teamInvite', { email: 'x@y.no' }), /Bare eiere/);
  const team = await env.call(OWNER, 'teamList');
  assert.equal(team.members.length, 2);
  await env.call(OWNER, 'teamRemove', { uid: ola.uid });
  await assert.rejects(env.call(ola, 'agentList', {}), /ikke tilgang/);
  await assert.rejects(env.call(OWNER, 'teamRemove', { uid: OWNER.uid }), /deg selv/);
});

test('vedlegg kan bare hentes av kunden selv og teamet', async () => {
  const env = setup();
  const { id } = await newTicket(env);
  const att = env.db.store.get(`helpdeskTickets/${id}`).attachments[0];
  const mine = await env.call(USER, 'attachment', { attachmentId: att.id });
  assert.equal(mine.type, 'image/png');
  const agent = await env.call(OWNER, 'attachment', { attachmentId: att.id });
  assert.equal(agent.data, PNG);
  await assert.rejects(env.call(OTHER, 'attachment', { attachmentId: att.id }), /ikke tilgang/);
});

test('assistent-statistikk og artikkel-tilbakemelding', async () => {
  const env = setup();
  await env.call(USER, 'assistantOutcome', { resolved: true });
  await env.call(USER, 'assistantOutcome', { resolved: true });
  await env.call(USER, 'assistantOutcome', { resolved: false });
  await env.call(USER, 'articleFeedback', { articleId: 'blank-screen', kind: 'view' });
  await env.call(USER, 'articleFeedback', { articleId: 'blank-screen', helpful: true });
  await assert.rejects(env.call(USER, 'articleFeedback', { articleId: 'finnes-ikke', helpful: true }), /Ukjent/);
  await env.call(OWNER, 'session');
  const stats = await env.call(OWNER, 'agentStats');
  assert.equal(stats.stats.deflectionRate, 67);
  assert.equal(stats.articles[0].id, 'blank-screen');
  const pop = await env.call(USER, 'popular');
  assert.equal(pop.views['blank-screen'], 1);
});

test('utviklerbrief tåler sak uten AI', () => {
  const brief = developerBrief({ number: 'PT-1', subject: 'X', body: 'Y', category: 'bug', module: 'general', priority: 'normal', status: 'new' }, []);
  assert.match(brief, /# PT-1: X/);
  assert.match(brief, /Ingen teknisk info/);
});
