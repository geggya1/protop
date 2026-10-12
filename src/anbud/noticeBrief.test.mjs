import assert from 'node:assert/strict';
import { DOSSIER_SUMMARY_VERSION } from './dossier.js';
import { inquiryBrief, noticeBrief, noticeNeedsDossier } from './noticeBrief.js';

const brief = noticeBrief({
  id: '2026-1042',
  source: 'doffin',
  title: 'DPS konsulent',
  buyer: 'Vågan kommune',
  places: ['Nordland'],
  deadline: '2026-12-01T12:00:00.000Z',
  noticeType: 'Kunngjøring av konkurranse',
  cpvCodes: ['71000000'],
  url: 'https://www.doffin.no/notices/2026-1042',
  description: 'Rammeavtale for konsulent.',
  dossier: {
    procedure: 'Åpen',
    estimatedValue: '12 000 000 NOK',
    documentsUrl: 'https://permalink.mercell.com/1.aspx',
    buyerUrl: 'https://www.vagan.kommune.no/',
    submissionDeadline: '01.12.2026 12:00',
    questionDeadline: '20.11.2026 12:00',
    procedureOutline: 'Løpende avrop.',
    documents: [
      { title: 'Kunngjøring', url: 'https://www.doffin.no/notices/2026-1042' },
      { title: 'Konkurransegrunnlag', url: 'https://permalink.mercell.com/grunnlag.pdf' },
    ],
    qa: [{ question: 'Kan vi dele opp?', answer: 'Nei.' }],
    lots: [{ id: 'LOT-0001', title: 'Prosjektleder' }],
    contactEmail: 'post@vagan.kommune.no',
    contractNature: 'Tjenester',
    framework: 'Rammeavtale uten gjenåpning av konkurransen',
    awards: [{ title: 'Pris', weight: '70', type: 'Pris' }],
    selection: [{ title: 'Referanser på tilsvarende tjenester' }],
    summaryVersion: DOSSIER_SUMMARY_VERSION,
  },
});

assert.equal(brief.noticeUrl, 'https://www.doffin.no/notices/2026-1042');
assert.equal(brief.source, 'Doffin');
assert.equal(brief.facts.find((row) => row.id === 'procedure').value, 'Åpen');
assert.equal(brief.facts.find((row) => row.id === 'place').value, 'Nordland');
assert.match(brief.facts.find((row) => row.id === 'deadline').value, /01\.12\.2026/);
assert.equal(brief.outline, 'Løpende avrop.');
assert.equal(brief.lots[0], 'LOT-0001 · Prosjektleder');
assert.equal(brief.qa[0].answer, 'Nei.');
assert.equal(brief.links.some((link) => link.url === 'https://www.doffin.no/notices/2026-1042'), false);
assert.equal(brief.links.some((link) => link.url === 'https://permalink.mercell.com/1.aspx'), true);
assert.equal(brief.links.some((link) => link.label === 'Konkurransegrunnlag'), true);
assert.equal(brief.links.some((link) => link.url === 'https://www.vagan.kommune.no/'), true);
assert.equal(brief.links.some((link) => link.url.startsWith('mailto:')), true);
assert.equal(brief.facts.find((row) => row.id === 'nature').value, 'Tjenester');
assert.equal(brief.awards[0].weight, '70');
assert.equal(brief.selection[0].title, 'Referanser på tilsvarende tjenester');
assert.match(brief.facts.find((row) => row.id === 'questions').value, /20\.11\.2026/);

const iso = noticeBrief({
  id: '2026-8',
  source: 'doffin',
  dossier: { questionDeadline: '2026-11-09T08:00:00Z', summaryVersion: DOSSIER_SUMMARY_VERSION },
});
assert.match(iso.facts.find((row) => row.id === 'questions').value, /09\.11\.2026/);

const thin = noticeBrief({
  id: '2026-9',
  source: 'ted',
  buyer: 'Oslo kommune',
  places: ['Norge', 'Anyw'],
  description: 'Gjelder hele landet.',
  url: 'https://ted.europa.eu/no/notice/-/detail/2026-9',
});
assert.match(thin.noticeUrl, /ted\.europa\.eu/);
assert.match(thin.facts.find((row) => row.id === 'place').value, /ikke stedbunden/);
assert.equal(thin.description, 'Gjelder hele landet.');

assert.equal(noticeNeedsDossier({ id: '2026-1' }), true);
assert.equal(noticeNeedsDossier({ id: '2026-1', dossier: { documentsUrl: 'https://permalink.mercell.com/1' } }), true);
assert.equal(noticeNeedsDossier({
  id: '2026-1',
  dossier: { documentsUrl: 'https://permalink.mercell.com/1', summaryVersion: DOSSIER_SUMMARY_VERSION },
}), false);
assert.equal(noticeNeedsDossier({ id: 'manuell' }), false);

const inquiry = inquiryBrief({
  title: 'Brøyting',
  buyer: 'Sortland kommune',
  contactName: 'Kari',
  email: 'kari@sortland.kommune.no',
  phone: '76 00 00 00',
  description: 'Sentrumsgater.',
  channel: 'epost',
});
assert.equal(inquiry.links.some((link) => link.url === 'mailto:kari@sortland.kommune.no'), true);
assert.equal(inquiry.links.some((link) => link.url.startsWith('tel:')), true);
assert.equal(inquiry.description, 'Sentrumsgater.');

console.log('noticeBrief.test.mjs ok');
