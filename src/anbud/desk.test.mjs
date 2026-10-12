import assert from 'node:assert/strict';
import {
  addLibraryItem,
  addProfile,
  applyNoticeReading,
  askNotice,
  awardContextFromHits,
  buildBrief,
  calloffNotices,
  classifyNotice,
  digestDue,
  digestSelection,
  dossierChanges,
  draftFromLibrary,
  linkCalloff,
  markPageRead,
  pipelineStats,
  qualifyNotice,
  rememberActiveProfile,
  removeProfile,
  searchLibrary,
  selectProfile,
  setPipelineStage,
  suggestFramework,
  tasksFromNotice,
} from './desk.js';

const watch = {
  companyName: 'Bygg AS',
  savedAt: '2026-10-01T00:00:00.000Z',
  cpvCodes: [{ code: '45000000', label: 'Bygg' }],
  keywords: ['betong'],
  nationwide: true,
  areas: [],
  channels: ['doffin'],
  notify: { email: true },
  emails: ['post@example.com'],
};

{
  const state = rememberActiveProfile({ watch, profiles: [] });
  assert.equal(state.profiles.length, 1);
  assert.equal(state.profiles[0].name, 'Standard');
  const added = addProfile(state, { name: 'Elektro' });
  assert.equal(added.ok, true);
  assert.equal(added.state.profiles.length, 2);
  const selected = selectProfile(added.state, added.state.profiles[0].id);
  assert.equal(selected.state.activeProfileId, added.state.profiles[0].id);
  const removed = removeProfile(added.state, added.state.profiles[1].id);
  assert.equal(removed.ok, true);
  assert.equal(removeProfile(removed.state, removed.state.profiles[0].id).ok, false);
}

assert.equal(classifyNotice({ title: 'Avrop på rammeavtale maling' }), 'avrop');
assert.equal(classifyNotice({ noticeType: 'Kunngjøring om tildeling' }), 'tildeling');
assert.equal(classifyNotice({ title: 'Ny barnehage' }), 'konkurranse');

{
  const notice = {
    id: '2026-1',
    title: 'Ombygging skole',
    description: 'Arbeidet omfatter betong og rehabilitering av skolebygg i Oslo. Tildelingskriterium er pris 60 prosent.',
    dossier: {
      submissionDeadline: '2026-11-01',
      qa: [],
      documents: [{ title: 'Konkurransegrunnlag', url: 'https://example.com/a.pdf' }],
    },
  };
  const brief = buildBrief({
    notice,
    excerpts: [{ title: 'Krav', text: 'Leverandøren skal dokumentere HMS.' }],
    gated: [{ title: 'Prisskjema', url: 'https://app.mercell.com/x' }],
  });
  assert.match(brief.summary, /betong/);
  assert.equal(brief.gated, 1);
  const answers = qualifyNotice({ ...notice, excerpts: [{ text: 'Leverandøren skal dokumentere HMS.' }] });
  assert.ok(answers.some((row) => row.status === 'funnet'));
  const asked = askNotice(notice, 'Hva er tildelingskriteriet?');
  assert.equal(asked.ok, true);
  assert.match(asked.answer, /pris/);
  const changes = dossierChanges(notice.dossier, { ...notice.dossier, submissionDeadline: '2026-11-15', qa: [{ question: 'A', answer: 'B' }] });
  assert.ok(changes.some((row) => row.field === 'submissionDeadline'));
  assert.ok(changes.some((row) => row.field === 'qa'));
  const applied = applyNoticeReading({ notices: [notice] }, '2026-1', { dossier: { ...notice.dossier, submissionDeadline: '2026-11-15' }, brief });
  assert.equal(applied.ok, true);
  assert.equal(applied.state.notices[0].updates.length, 1);
  assert.equal(tasksFromNotice(notice).length > 0, true);
}

{
  const hits = [{ id: 'old', title: 'Forrige skole', buyer: 'Oslo kommune', winner: 'Annen AS', publishedAt: '2024-01-01', url: 'https://www.doffin.no/notices/old' }];
  const context = awardContextFromHits({ id: 'new', buyer: 'Oslo kommune' }, hits);
  assert.equal(context.winner, 'Annen AS');
  assert.match(context.note, /Utbetalinger/);
}

{
  let state = { bids: [{ id: 'b1', stage: 'planlegging', tasks: [], files: [{ id: 'f1', name: 'krav.pdf' }] }], library: [] };
  state = setPipelineStage(state, 'b1', 'levert').state;
  assert.equal(state.bids[0].stage, 'levert');
  state = markPageRead(state, 'b1', { fileId: 'f1', page: 3, userId: 'u', userName: 'Kari' }).state;
  assert.equal(state.bids[0].pageReads[0].page, 3);
  state = addLibraryItem(state, { title: 'HMS-svar', body: 'Vi følger internkontrollforskriften og har verneombud.', tags: ['hms'] }).state;
  assert.equal(searchLibrary(state, 'verneombud').length, 1);
  const draft = draftFromLibrary(state, 'hms');
  assert.match(draft.draft, /verneombud/);
  const stats = pipelineStats([{ stage: 'kontrakt', value: 10 }, { stage: 'tapt' }, { stage: 'planlegging' }]);
  assert.equal(stats.winRate, 50);
  assert.equal(stats.open, 1);
}

{
  const notices = [
    { id: 'a', title: 'Avrop maling', buyer: 'Bergen kommune', kind: 'avrop' },
    { id: 'b', title: 'Ny hall', decision: 'ubestemt', aiFit: { score: 9 } },
    { id: 'c', title: 'Tildeling', noticeType: 'tildeling', decision: 'ubestemt' },
  ];
  assert.equal(calloffNotices(notices).length, 1);
  const linked = linkCalloff({
    notices,
    contracts: [{ id: 'c1', kind: 'rammeavtale', title: 'Ramme maling', buyer: 'Bergen kommune' }],
  }, 'a', 'c1');
  assert.equal(linked.state.notices[0].frameworkId, 'c1');
  assert.equal(suggestFramework(notices[0], linked.state.contracts).id, 'c1');
  const picked = digestSelection(notices);
  assert.equal(picked.some((row) => row.id === 'c'), false);
  assert.equal(picked[0].id, 'b');
}

{
  const morning = new Date('2026-10-12T07:00:00');
  assert.equal(digestDue({ ...watch, digestAt: '' }, morning), true);
  assert.equal(digestDue({ ...watch, digestAt: '2026-10-12T06:30:00' }, morning), false);
  assert.equal(digestDue({ ...watch, notify: { email: false } }, morning), false);
}

console.log('desk ok');
