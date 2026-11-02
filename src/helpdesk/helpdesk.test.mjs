/**
 * Helpdesk: regler, triage, søk, e-postmaler og lenker.
 * node --test src/helpdesk/helpdesk.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStats, filterTickets, formatTicketNumber, initialPriority, matchesView, normalizeTicketInput, parseTicketNumber,
  publicMessages, publicTicketView, shouldAutoClose, slaState, sortTickets, transition, viewCounts,
} from './model.js';
import {
  diagnosticsDigest, redactSecrets, ruleTriage, sanitizeDiagnostics, stripUrl,
} from './triage.js';
import {
  getArticle, listArticles, popularArticles, searchArticles, suggestForTicket, SUPPORT_ARTICLES, ARTICLE_GROUPS,
} from './articles.js';
import {
  agentReplyMail, teamAlertMail, teamInviteMail, ticketCreatedMail, ticketSolvedMail,
} from './mailTemplates.js';
import { MACROS, fillMacro } from './macros.js';
import { readFileSync } from 'node:fs';

const H = 60 * 60 * 1000;

test('saksnummer', () => {
  assert.equal(formatTicketNumber(1), 'PT-1001');
  assert.equal(formatTicketNumber(250), 'PT-1250');
  assert.equal(parseTicketNumber('Gjelder sak pt-1042 fra i går'), 'PT-1042');
  assert.equal(parseTicketNumber('ingen'), null);
});

test('validering av ny sak', () => {
  assert.throws(() => normalizeTicketInput({ subject: 'a', body: 'x'.repeat(20) }), /tittel/);
  assert.throws(() => normalizeTicketInput({ subject: 'Hei der', body: 'kort' }), /10 tegn/);
  assert.throws(() => normalizeTicketInput({ subject: 'Hei der', body: 'x'.repeat(20), contactEmail: 'feil@' }), /E-post/);
  const ok = normalizeTicketInput({ subject: '  Feil  ', body: 'Noe virker ikke her', category: 'tull', module: 'okonomi' });
  assert.equal(ok.subject, 'Feil');
  assert.equal(ok.category, 'other');
  assert.equal(ok.module, 'okonomi');
  assert.equal(ok.shareDiagnostics, true);
});

test('prioritet, frist og statusoverganger', () => {
  assert.equal(initialPriority({ impact: 'blocked' }), 'high');
  assert.equal(initialPriority({ impact: 'minor', triagePriority: 'urgent' }), 'urgent');
  assert.equal(initialPriority({ impact: 'blocked', category: 'feature' }), 'low');
  const now = 1_000_000_000_000;
  const t = { status: 'new', priority: 'urgent', createdAtMs: now - 3 * H };
  assert.equal(slaState(t, now).state, 'breached');
  assert.equal(slaState({ ...t, firstResponseAtMs: now - H }, now).state, 'met');
  assert.equal(slaState({ ...t, priority: 'low' }, now).state, 'ok');
  const solved = transition(t, 'solved', { now });
  assert.equal(solved.autoCloseAtMs, now + 7 * 24 * H);
  assert.equal(shouldAutoClose({ status: 'solved', ...solved }, now + 8 * 24 * H), true);
  const closed = transition(t, 'closed', { now });
  assert.equal(closed.archived, true);
  assert.throws(() => transition({ status: 'closed' }, 'open'), /lukket/);
  assert.throws(() => transition(t, 'on_hold', { by: 'requester' }), /gjenåpne/);
});

test('visninger, søk og sortering i portalen', () => {
  const now = 2_000_000_000_000;
  const tickets = [
    { id: 'a', status: 'new', priority: 'normal', category: 'bug', createdAtMs: now - 30 * H, updatedAtMs: now - H, subject: 'Faktura feiler', requester: { email: 'kari@x.no' } },
    { id: 'b', status: 'open', priority: 'low', category: 'question', assigneeUid: 'me', createdAtMs: now - H, updatedAtMs: now, subject: 'Hvordan', firstResponseAtMs: now },
    { id: 'c', status: 'pending', priority: 'high', category: 'access', createdAtMs: now - 2 * H, updatedAtMs: now - 2 * H, subject: 'Tilgang' },
    { id: 'd', status: 'solved', priority: 'normal', category: 'bug', createdAtMs: now - 50 * H, updatedAtMs: now - 3 * H, subject: 'Løst' },
    { id: 'e', status: 'closed', archived: true, priority: 'normal', category: 'bug', createdAtMs: now - 90 * H, subject: 'Gammel' },
  ];
  const counts = viewCounts(tickets, { agentUid: 'me', now });
  assert.deepEqual(
    [counts.open, counts.mine, counts.unassigned, counts.pending, counts.solved, counts.archive, counts.bugs],
    [3, 1, 2, 1, 1, 1, 1],
  );
  assert.equal(matchesView(tickets[0], 'urgent', { now }), true, 'over frist havner i Haster');
  assert.deepEqual(filterTickets(tickets, { view: 'all', query: 'kari faktura' }).map((t) => t.id), ['a']);
  assert.equal(sortTickets(tickets.slice(0, 3), { now })[0].id, 'a', 'brudd på frist først');
  const stats = computeStats(tickets, { now, deflection: { resolved: 8, escalated: 2 } });
  assert.equal(stats.open, 3);
  assert.equal(stats.deflectionRate, 80);
});

test('kunden ser aldri interne felt', () => {
  const view = publicTicketView({ id: 'x', number: 'PT-1', ai: { summary: 'hemmelig' }, fix: {}, diagnostics: {}, attachments: [{ id: '1', name: 'a', data: 'AAA' }] });
  assert.equal(view.ai, undefined);
  assert.equal(view.fix, undefined);
  assert.equal(view.diagnostics, undefined);
  assert.equal(view.attachments[0].data, undefined);
  const msgs = publicMessages([{ id: '1', role: 'agent', body: 'Hei', internal: false }, { id: '2', role: 'agent', body: 'Notat', internal: true }]);
  assert.equal(msgs.length, 1);
});

test('vasking av teknisk info', () => {
  assert.equal(stripUrl('https://protop.no/hjem?token=abc#x'), 'https://protop.no/hjem');
  assert.equal(stripUrl('/hjem/okonomi?kid=1'), '/hjem/okonomi');
  const red = redactSecrets('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmno key=AIzaSyA1234567890abcdefghijk fnr 01017012345 mail ola@x.no');
  assert.doesNotMatch(red, /eyJhbGci|AIzaSy|01017012345|ola@x\.no/);
  const d = sanitizeDiagnostics({
    page: { path: '/x?y=1' },
    console: Array.from({ length: 100 }, (_, i) => ({ level: 'error', message: `feil ${i}` })),
    network: [{ method: 'get', url: 'https://a.b/c?d=e', status: 500 }],
    hemmelig: 'kastes',
  });
  assert.equal(d.console.length, 40);
  assert.equal(d.network[0].url, 'https://a.b/c');
  assert.equal(d.network[0].method, 'GET');
  assert.equal(d.hemmelig, undefined);
  assert.equal(sanitizeDiagnostics(null), null);
  assert.match(diagnosticsDigest(d), /feil 99/);
});

test('regelbasert triage', () => {
  const t1 = ruleTriage({ subject: 'Fakturaen går ikke', body: 'Når jeg trykker send skjer ingenting, kunden har frist i dag' });
  assert.equal(t1.module, 'okonomi');
  assert.equal(t1.priority, 'urgent');
  assert.equal(ruleTriage({ subject: 'Glemt passord', body: 'Får ikke logget inn' }).category, 'account');
  assert.equal(ruleTriage({ subject: 'Hvordan legger jeg inn ferie?', body: '' }).module, 'fravaer');
  assert.equal(ruleTriage({ subject: 'Ønske', body: 'Savner eksport av kjørebok' }).category, 'feature');
  const withErrors = ruleTriage({ subject: 'Hm', body: 'rart', diagnostics: { console: [{ level: 'error', message: 'x' }], network: [] } });
  assert.equal(withErrors.category, 'bug');
  assert.ok(withErrors.tags.includes('konsollfeil'));
});

test('kunnskapsbasen: alle støtteartikler har steg og gyldige grupper og lenker', () => {
  const groups = new Set(ARTICLE_GROUPS.map((g) => g.id));
  const ids = new Set(SUPPORT_ARTICLES.map((a) => a.id));
  assert.equal(ids.size, SUPPORT_ARTICLES.length, 'unike id-er');
  for (const a of SUPPORT_ARTICLES) {
    assert.ok(groups.has(a.group), `${a.id}: gruppe`);
    assert.ok(a.steps.length >= 2, `${a.id}: steg`);
    assert.ok(a.keywords.length >= 3, `${a.id}: søkeord`);
    for (const r of a.related || []) assert.ok(getArticle(r), `${a.id}: relatert ${r} finnes`);
  }
  const all = listArticles('nb').all;
  assert.ok(all.length > 100, 'sideveiledningene er med');
  for (const g of ARTICLE_GROUPS) assert.ok(all.some((a) => a.group === g.id), `gruppe ${g.id} har artikler`);
  assert.equal(popularArticles('nb').length, 10);
});

test('søket finner riktig artikkel, også med skrivefeil og bøyning', () => {
  const top = (q) => searchArticles(q, { limit: 3 }).map((r) => r.article.id);
  assert.equal(top('glemt passord')[0], 'cant-login');
  assert.equal(top('hvit skjerm')[0], 'blank-screen');
  assert.equal(top('siden henger')[0], 'blank-screen');
  assert.equal(top('fakturaen ble ikke sendt')[0], 'invoice-not-sent');
  assert.equal(top('varsler kommer ikke')[0], 'push-notifications');
  assert.equal(top('poweroffice')[0], 'poweroffice');
  assert.ok(top('pasord').includes('reset-password'), 'skrivefeil');
  assert.ok(top('skjermbilde')[0] === 'screenshot');
  assert.deepEqual(searchArticles('', {}), []);
  assert.ok(suggestForTicket({ subject: 'Får ikke logget inn' }).some((a) => a.id === 'cant-login'));
});

test('e-postmaler', () => {
  const ticket = {
    id: 'abc123', number: 'PT-1001', subject: 'Feil <script>', body: 'Hei\nDet virker ikke', status: 'pending', category: 'bug', module: 'okonomi', priority: 'high',
    requester: { name: 'Kari Nordmann', email: 'kari@x.no', uid: 'u1', companyName: 'AS' }, attachments: [{ id: '1' }],
  };
  const created = ticketCreatedMail(ticket, { articles: [{ id: 'blank-screen', title: 'Hvit skjerm' }] });
  assert.match(created.subject, /\[PT-1001\]/);
  assert.match(created.text, /Hei Kari/);
  assert.match(created.html, /Feil &lt;script&gt;/, 'HTML escapes');
  assert.match(created.html, /hjelp\/sak\/abc123/);
  assert.match(created.html, /hjelp\/artikkel\/blank-screen/);
  assert.match(agentReplyMail(ticket, { body: 'Svar', authorName: 'Geir' }).text, /Vi venter på svar fra deg/);
  const solved = ticketSolvedMail({ ...ticket, status: 'solved' }, { note: 'Fikset' });
  assert.match(solved.subject, /løst/);
  assert.match(solved.html, /svar=good/);
  assert.match(ticketSolvedMail({ ...ticket, status: 'closed' }).subject, /lukket/);
  assert.match(teamAlertMail(ticket, { kind: 'new', digest: 'Side: /x' }).text, /u1/);
  assert.match(teamInviteMail({ email: 'a@b.no' }).text, /helpdesk/);
});

test('makroer', () => {
  assert.ok(MACROS.length >= 6);
  assert.match(fillMacro('Hei {navn}, sak {sak}', { name: 'Kari Nordmann', number: 'PT-1' }), /Hei Kari, sak PT-1/);
  assert.match(fillMacro('Hei {navn}', {}), /Hei der/);
});

test('lenker fra e-post åpner riktig sted', async () => {
  const src = readFileSync(new URL('../navigation/linking.js', import.meta.url), 'utf8');
  assert.match(src, /helpCenterLinkIntent/);
  assert.match(src, /helpdesk\\\/sak/);
  const app = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /name="Helpdesk"/);
  assert.match(app, /installDiagnostics\(\)/);
  const more = readFileSync(new URL('../../screens/v2/MoreHubScreen.jsx', import.meta.url), 'utf8');
  assert.match(more, /help: HelpCenterScreen/);
  const sw = readFileSync(new URL('../../components/PlatformSwitch.jsx', import.meta.url), 'utf8');
  assert.match(sw, /label="Helpdesk"/);
  assert.match(sw, /navigate\('Helpdesk'\)/);
});

test('ingen forslag for innholdsløse titler, og admin-temaer er merket', () => {
  assert.deepEqual(suggestForTicket({ subject: 'Test', body: 'TEST' }), []);
  assert.deepEqual(suggestForTicket({ subject: 'Hei', body: 'Har et problem' }), []);
  const viewAs = getArticle('tema-viewas');
  assert.deepEqual(viewAs.requires, { resource: 'viewAs', action: 'see' });
  assert.equal(getArticle('tema-locked').requires, null, 'låst modul er for alle');
});

test('teknisk info: siden brukeren kom fra og uten ikon-tegn', () => {
  const d = sanitizeDiagnostics({ page: { path: '/hjem/apper/help', from: '/hjem/selskap?x=1' }, breadcrumbs: [{ type: 'klikk', label: 'Generelt ' }] });
  assert.equal(d.page.from, '/hjem/selskap');
  const digest = diagnosticsDigest(d);
  assert.match(digest, /Kom fra: \/hjem\/selskap/);
  assert.doesNotMatch(digest, /fane \?/);
});
