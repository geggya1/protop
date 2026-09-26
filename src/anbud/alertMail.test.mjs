import assert from 'node:assert/strict';
import { buildTenderAlert } from './alertMail.js';
import { buildTedQuery, tedHitToNotice } from './tedQuery.js';
import { saveTenderWatch, emptyAnbudState, setNoticeDecision, mergeTenderNotices } from './model.js';

const mail = buildTenderAlert({
  companyName: 'Consult1 AS',
  cpvCodes: ['71240000'],
  notices: [{
    title: 'Utbedring Adgangskontroll',
    buyer: 'Kristiansund kommune',
    places: ['Møre og Romsdal'],
    description: 'Etablering av adgangskontroll og utskifting av dører.',
    publishedAt: '2026-09-02',
    deadline: '2026-09-18',
    noticeType: 'Kunngjøring av kontrakt',
    source: 'doffin',
    cpvCodes: ['71240000', '45000000'],
    url: 'https://www.doffin.no/notices/1',
    isNew: true,
  }],
});
assert.match(mail.subject, /Consult1 AS/);
assert.match(mail.text, /Her er de siste treffene/);
assert.match(mail.text, /Frist: 18\.09\.2026/);
assert.match(mail.text, /Matcher: CPV: 71240000/);
const withKeyword = buildTenderAlert({
  companyName: 'Consult1 AS',
  cpvCodes: ['71240000'],
  keywords: ['adgangskontroll'],
  notices: [{
    title: 'Utbedring Adgangskontroll',
    buyer: 'Kristiansund kommune',
    description: 'Etablering av adgangskontroll.',
    cpvCodes: ['71240000'],
    source: 'doffin',
    isNew: true,
  }],
});
assert.match(withKeyword.text, /Matcher: CPV: 71240000 · adgangskontroll/);
assert.match(mail.html, /Utbedring Adgangskontroll/);

const query = buildTedQuery({ cpvCodes: ['71000000'], locationIds: [] });
assert.match(query, /classification-cpv=71000000/);
assert.match(query, /buyer-country=NOR/);
const ted = tedHitToNotice({
  'publication-number': '1-2026',
  'notice-title': { nor: ['Rådgivning'] },
  'buyer-name': { nor: ['Statsbygg'] },
  'publication-date': '2026-09-02',
  'classification-cpv': ['71000000'],
  'notice-type': 'cn-standard',
});
assert.equal(ted.source, 'ted');
assert.equal(ted.heading, 'Rådgivning');
assert.match(ted.url, /1-2026/);

let state = saveTenderWatch(emptyAnbudState(), {
  companyName: 'Consult1 AS',
  cpvCodes: ['71000000'],
  nationwide: true,
  channels: ['doffin', 'ted'],
  notify: { push: true, varsel: true, email: true },
  emails: ['nye_prosjekt@consult1.no', 'ugyldig'],
  naeringskoder: ['71.121'],
}).state;
assert.deepEqual(state.watch.channels, ['doffin', 'ted']);
assert.deepEqual(state.watch.emails, ['nye_prosjekt@consult1.no']);
assert.equal(state.watch.notify.email, true);
assert.deepEqual(state.watch.naeringskoder, ['71.121']);

state = mergeTenderNotices(state, [ted], '2026-09-25T10:00:00Z').state;
const archived = setNoticeDecision(state, ted.id, 'arkiv');
assert.equal(archived.ok, true);
assert.equal(archived.state.notices[0].decision, 'arkiv');

console.log('alertMail.test.mjs ok');
