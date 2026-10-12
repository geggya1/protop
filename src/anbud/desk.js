/**
 * Anbudsdisk på åpne kilder: flere profiler, sammendrag, go/no-go,
 * oppgaver, svarbibliotek, pipeline, avrop og tildelingskontekst.
 * Portalpassord og innlogging hos Mercell, TendSign og EU Supply inngår ikke.
 */

const STAGES = ['planlegging', 'gjennomforing', 'levert', 'kontrakt', 'tapt', 'trukket'];

export const PIPELINE_COLUMNS = [
  { id: 'utkast', label: 'Utkast', stages: ['planlegging', 'gjennomforing'] },
  { id: 'levert', label: 'Levert', stages: ['levert'] },
  { id: 'vunnet', label: 'Vunnet', stages: ['kontrakt'] },
  { id: 'tapt', label: 'Tapt', stages: ['tapt', 'trukket'] },
];

export const QUALIFY_QUESTIONS = [
  { id: 'fag', prompt: 'Passer fag og sted til det vi leverer?' },
  { id: 'kapasitet', prompt: 'Er frist, varighet og omfang noe vi kan ta?' },
  { id: 'krav', prompt: 'Hvilke kvalifikasjonskrav er nevnt?' },
  { id: 'kriterier', prompt: 'Hva vektes når tilbudet vurderes?' },
  { id: 'dokumenter', prompt: 'Hvilke dokumenter må med, og hva er stengt?' },
];

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** Tre dokumentutdrag får plass i korpuset på 12 000 tegn. */
export const EXCERPT_TEXT_CHARS = 4000;

function clip(value, max) {
  const raw = text(value);
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trim()}…`;
}

export function fold(value) {
  return String(value || '')
    .toLocaleLowerCase('nb-NO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function idFor(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function classifyNotice(notice) {
  const hay = fold([
    notice?.title,
    notice?.heading,
    notice?.noticeType,
    notice?.description,
  ].filter(Boolean).join(' '));
  if (/avrop|call-off|call off|mini-?konkurranse|avropsforesporsel/.test(hay)) return 'avrop';
  if (/tildeling|award notice|contract award|kunngjoring om resultat|resultat av konkurranse/.test(hay)) return 'tildeling';
  return 'konkurranse';
}

function cpvList(values) {
  const out = [];
  const seen = new Set();
  for (const row of (Array.isArray(values) ? values : [])) {
    const code = text(row?.code || row).replace(/\D/g, '').slice(0, 8);
    if (code.length < 2 || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, label: text(row?.label).slice(0, 160) });
    if (out.length >= 20) break;
  }
  return out;
}

function wordList(values) {
  const out = [];
  const seen = new Set();
  const rows = Array.isArray(values) ? values : String(values || '').split(/[,;\n]/);
  for (const row of rows) {
    const value = text(row);
    const key = fold(value);
    if (key.length < 2 || value.length > 60 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 20) break;
  }
  return out;
}

export function normalizeProfile(raw, fallbackName = 'Standard') {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    id: text(src.id).slice(0, 80) || idFor('prof'),
    name: clip(src.name || fallbackName, 80) || 'Standard',
    departmentIds: (Array.isArray(src.departmentIds) ? src.departmentIds : []).map((row) => text(row).slice(0, 80)).filter(Boolean).slice(0, 30),
    cpvCodes: cpvList(src.cpvCodes),
    keywords: wordList(src.keywords),
    nationwide: src.nationwide !== false,
    areas: (Array.isArray(src.areas) ? src.areas : []).slice(0, 40),
    channels: (Array.isArray(src.channels) ? src.channels : ['doffin', 'ted']).map((row) => text(row)).filter((row) => row === 'doffin' || row === 'ted').slice(0, 2),
    departmentAreas: Array.isArray(src.departmentAreas) ? src.departmentAreas.slice(0, 40) : [],
    savedAt: text(src.savedAt),
  };
}

export function profileFromWatch(watch, { id = '', name = 'Standard' } = {}) {
  const src = watch && typeof watch === 'object' ? watch : {};
  return normalizeProfile({
    id: id || src.activeProfileId,
    name,
    departmentIds: (src.departmentAreas || []).map((row) => row.id),
    cpvCodes: src.cpvCodes,
    keywords: [...(src.keywords || []), ...(src.profile?.keywords || [])],
    nationwide: src.nationwide,
    areas: src.areas,
    channels: src.channels,
    departmentAreas: src.departmentAreas,
    savedAt: src.savedAt || new Date().toISOString(),
  });
}

export function normalizeProfiles(list) {
  const rows = Array.isArray(list) ? list : [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const profile = normalizeProfile(row);
    if (seen.has(profile.id)) continue;
    seen.add(profile.id);
    out.push(profile);
    if (out.length >= 12) break;
  }
  return out;
}

export function ensureProfiles(state) {
  const current = state && typeof state === 'object' ? state : {};
  const profiles = normalizeProfiles(current.profiles);
  if (profiles.length) {
    const active = profiles.some((row) => row.id === current.activeProfileId) ? current.activeProfileId : profiles[0].id;
    return { ...current, profiles, activeProfileId: active };
  }
  if (!current.watch?.savedAt && !(current.watch?.cpvCodes || []).length) {
    return { ...current, profiles: [], activeProfileId: '' };
  }
  const profile = profileFromWatch(current.watch, { id: current.activeProfileId || 'standard', name: 'Standard' });
  return { ...current, profiles: [profile], activeProfileId: profile.id };
}

export function rememberActiveProfile(state) {
  const ready = ensureProfiles(state);
  if (!ready.profiles.length) return ready;
  const snapshot = profileFromWatch(ready.watch, {
    id: ready.activeProfileId || ready.profiles[0].id,
    name: ready.profiles.find((row) => row.id === ready.activeProfileId)?.name || ready.profiles[0].name || 'Standard',
  });
  return {
    ...ready,
    activeProfileId: snapshot.id,
    profiles: ready.profiles.map((row) => (row.id === snapshot.id ? snapshot : row)),
  };
}

export function selectProfile(state, id) {
  const ready = ensureProfiles(state);
  const profile = ready.profiles.find((row) => row.id === id);
  if (!profile) return { ok: false, error: 'Profilen finnes ikke.', state: ready };
  return {
    ok: true,
    state: {
      ...ready,
      activeProfileId: profile.id,
      watch: {
        ...(ready.watch || {}),
        cpvCodes: profile.cpvCodes,
        keywords: profile.keywords,
        nationwide: profile.nationwide,
        areas: profile.areas,
        channels: profile.channels.length ? profile.channels : ['doffin', 'ted'],
        departmentAreas: profile.departmentAreas,
        savedAt: new Date().toISOString(),
      },
    },
  };
}

export function addProfile(state, { name, departmentIds = [] } = {}) {
  const ready = rememberActiveProfile(state);
  if (ready.profiles.length >= 12) return { ok: false, error: 'Maks 12 overvåkingsprofiler.', state: ready };
  const profile = profileFromWatch(ready.watch, { name: text(name) || `Profil ${ready.profiles.length + 1}` });
  profile.id = idFor('prof');
  profile.departmentIds = departmentIds.map((row) => text(row)).filter(Boolean).slice(0, 30);
  profile.savedAt = new Date().toISOString();
  return {
    ok: true,
    state: { ...ready, profiles: [...ready.profiles, profile], activeProfileId: profile.id },
  };
}

export function removeProfile(state, id) {
  const ready = ensureProfiles(state);
  if (ready.profiles.length < 2) return { ok: false, error: 'Minst én profil må stå igjen.', state: ready };
  const profiles = ready.profiles.filter((row) => row.id !== id);
  const active = profiles.some((row) => row.id === ready.activeProfileId) ? ready.activeProfileId : profiles[0].id;
  return selectProfile({ ...ready, profiles, activeProfileId: active }, active);
}

export function searchProfiles(state) {
  const ready = ensureProfiles(state);
  if (!ready.profiles.length) return [{ id: '', name: 'Standard', watch: ready.watch || {} }];
  return ready.profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    watch: {
      ...(ready.watch || {}),
      companyName: ready.watch?.companyName || '',
      cpvCodes: profile.cpvCodes,
      keywords: profile.keywords,
      nationwide: profile.nationwide,
      areas: profile.areas,
      channels: profile.channels,
      departmentAreas: profile.departmentAreas,
      profile: {
        ...(ready.watch?.profile || {}),
        keywords: profile.keywords,
      },
    },
  }));
}

export function noticeCorpus(notice) {
  const dossier = notice?.dossier || {};
  const parts = [
    notice?.title,
    notice?.description,
    notice?.buyer,
    dossier.description,
    dossier.procedureOutline,
    dossier.additionalInfo,
    dossier.estimatedValue,
    dossier.duration,
    dossier.espd,
    ...(dossier.lots || []).map((lot) => `${lot.id || ''} ${lot.title || ''}`),
    ...(dossier.qa || []).map((row) => `Spørsmål: ${row.question || ''} Svar: ${row.answer || ''}`),
    ...(notice?.excerpts || []).map((row) => row.text),
    ...(dossier.documents || []).map((row) => row.title),
  ];
  return parts.map((row) => text(row)).filter(Boolean).join('\n').slice(0, 12000);
}

function sentences(corpus) {
  return String(corpus || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((row) => text(row))
    .filter((row) => row.length > 20);
}

function wordsOf(value) {
  return fold(value).split(/[^a-z0-9æøå]+/).filter((row) => row.length > 3);
}

function shares(hay, word) {
  if (hay.includes(word)) return true;
  const stem = word.slice(0, 6);
  return stem.length >= 5 && hay.includes(stem);
}

export function citeFor(corpus, prompt) {
  const needles = wordsOf(prompt).slice(0, 6);
  const rows = sentences(corpus);
  if (!needles.length || !rows.length) return '';
  let best = '';
  let score = 0;
  for (const row of rows) {
    const hay = fold(row);
    const hit = needles.filter((word) => shares(hay, word)).length;
    if (hit > score) {
      score = hit;
      best = row;
    }
  }
  return score ? clip(best, 320) : '';
}

export function buildBrief({ notice, excerpts = [], gated = [] } = {}) {
  const corpus = noticeCorpus({ ...notice, excerpts });
  const summary = clip(corpus, 700) || 'Kunngjøringen har ingen åpen tekst ennå.';
  const documents = [
    ...(notice?.dossier?.documents || []).map((row) => ({ title: text(row.title) || 'Dokument', url: text(row.url), access: 'lenke' })),
    ...excerpts.map((row) => ({ title: text(row.title) || 'Dokument', url: text(row.url), access: 'lest' })),
    ...gated.map((row) => ({ title: text(row.title || row.name) || 'Dokument', url: text(row.url), access: 'stengt' })),
  ].filter((row) => row.title).slice(0, 12);
  return {
    summary,
    relevance: '',
    documents,
    gated: documents.filter((row) => row.access === 'stengt').length,
    readAt: new Date().toISOString(),
  };
}

export function qualifyNotice(notice, questions = QUALIFY_QUESTIONS) {
  const corpus = noticeCorpus(notice);
  return (Array.isArray(questions) ? questions : QUALIFY_QUESTIONS).slice(0, 8).map((row) => {
    const cite = citeFor(corpus, row.prompt);
    return {
      id: text(row.id) || idFor('q'),
      prompt: text(row.prompt).slice(0, 240),
      status: cite ? 'funnet' : 'ukjent',
      answer: cite || 'Ikke funnet i den åpne teksten. Last opp grunnlaget i tilbudet hvis filen er stengt.',
      cite,
    };
  });
}

export function askNotice(notice, question) {
  const prompt = text(question).slice(0, 400);
  if (prompt.length < 3) return { ok: false, error: 'Skriv et spørsmål.' };
  const cite = citeFor(noticeCorpus(notice), prompt);
  return {
    ok: true,
    question: prompt,
    answer: cite || 'Det står ikke i kunngjøringen eller de åpne dokumentene som er lest.',
    cite,
    at: new Date().toISOString(),
  };
}

export function dossierChanges(previous, next) {
  const changes = [];
  const fields = [
    ['submissionDeadline', 'Tilbudsfrist'],
    ['questionDeadline', 'Spørsmålsfrist'],
    ['estimatedValue', 'Verdi'],
    ['description', 'Beskrivelse'],
  ];
  for (const [key, label] of fields) {
    const from = text(previous?.[key]);
    const to = text(next?.[key]);
    if (from && to && from !== to) changes.push({ field: key, label, from: clip(from, 160), to: clip(to, 160) });
  }
  const prevQa = (previous?.qa || []).length;
  const nextQa = (next?.qa || []).length;
  if (nextQa > prevQa) changes.push({ field: 'qa', label: 'Spørsmål og svar', from: String(prevQa), to: String(nextQa) });
  const prevDocs = (previous?.documents || []).length;
  const nextDocs = (next?.documents || []).length;
  if (nextDocs > prevDocs) changes.push({ field: 'documents', label: 'Dokumenter', from: String(prevDocs), to: String(nextDocs) });
  return changes;
}

export function applyNoticeReading(state, id, { dossier, brief, excerpts = [] } = {}) {
  const notices = (state?.notices || []).map((row) => {
    if (row.id !== id) return row;
    const changes = dossier ? dossierChanges(row.dossier, dossier) : [];
    const updates = Array.isArray(row.updates) ? row.updates.slice(-19) : [];
    if (changes.length) updates.push({ at: new Date().toISOString(), changes });
    return {
      ...row,
      dossier: dossier || row.dossier || null,
      excerpts: (Array.isArray(excerpts) ? excerpts : []).slice(0, 3).map((item) => ({
        title: clip(item.title, 120),
        url: text(item.url).slice(0, 400),
        text: clip(item.text, EXCERPT_TEXT_CHARS),
      })),
      brief: brief || row.brief || null,
      updates,
      kind: classifyNotice({ ...row, ...(dossier || {}) }),
    };
  });
  if (!notices.some((row) => row.id === id)) return { ok: false, error: 'Kunngjøringen finnes ikke.', state };
  return { ok: true, state: { ...state, notices } };
}

export function applyAwardContext(state, id, context) {
  if (!context || typeof context !== 'object') return { ok: false, error: 'Ingen tidligere tildeling er funnet.', state };
  const notices = (state?.notices || []).map((row) => (row.id === id ? { ...row, awardContext: normalizeAward(context) } : row));
  return { ok: true, state: { ...state, notices } };
}

export function normalizeAward(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    title: clip(src.title, 180),
    buyer: clip(src.buyer, 160),
    winner: clip(src.winner, 180),
    publishedAt: text(src.publishedAt).slice(0, 40),
    url: text(src.url).slice(0, 400),
    note: clip(src.note || 'Forrige tildeling fra Doffin. Utbetalinger inngår ikke.', 220),
  };
}

export function awardContextFromHits(notice, hits) {
  const buyer = fold(notice?.buyer);
  const rows = (Array.isArray(hits) ? hits : []).filter((row) => row && row.id !== notice?.id);
  const ranked = rows.slice().sort((left, right) => {
    const leftBuyer = fold(left.buyer);
    const rightBuyer = fold(right.buyer);
    const leftHit = buyer && (leftBuyer.includes(buyer) || buyer.includes(leftBuyer)) ? 1 : 0;
    const rightHit = buyer && (rightBuyer.includes(buyer) || buyer.includes(rightBuyer)) ? 1 : 0;
    return rightHit - leftHit;
  });
  const top = ranked[0];
  if (!top) return null;
  return normalizeAward({
    title: top.title,
    buyer: top.buyer,
    winner: top.winner,
    publishedAt: top.publishedAt,
    url: top.url,
  });
}

function normalizeTask(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const title = clip(src.title, 160);
  if (!title) return null;
  return {
    id: text(src.id).slice(0, 80) || idFor('task'),
    title,
    ownerId: text(src.ownerId).slice(0, 80),
    ownerName: clip(src.ownerName, 120),
    due: text(src.due).slice(0, 40),
    status: src.status === 'ferdig' ? 'ferdig' : 'apen',
    comments: (Array.isArray(src.comments) ? src.comments : []).slice(-12).map((row) => ({
      id: text(row?.id).slice(0, 80) || idFor('cmt'),
      text: clip(row?.text, 500),
      authorName: clip(row?.authorName, 120),
      at: text(row?.at).slice(0, 40),
    })).filter((row) => row.text),
  };
}

export function normalizeTasks(list) {
  return (Array.isArray(list) ? list : []).map(normalizeTask).filter(Boolean).slice(0, 24);
}

export function tasksFromNotice(notice) {
  const dossier = notice?.dossier || {};
  const tasks = [
    { title: 'Les kunngjøringen og sammendraget', due: dossier.questionDeadline || '' },
    ...(dossier.lots || []).slice(0, 6).map((lot) => ({ title: `Pris delkontrakt ${lot.id || ''} ${lot.title || ''}`.trim() })),
    ...((dossier.documents || []).slice(0, 4).map((row) => ({ title: `Gå gjennom ${row.title || 'dokument'}` }))),
    ...(dossier.qa || []).length ? [{ title: 'Les spørsmål og svar fra oppdragsgiver' }] : [],
    { title: 'Avgjør go eller no-go', due: dossier.submissionDeadline || notice?.deadline || '' },
  ];
  return normalizeTasks(tasks.map((row) => ({ ...row, status: 'apen' })));
}

export function setBidTasks(state, bidId, tasks) {
  return mapBid(state, bidId, (bid) => ({ ...bid, tasks: normalizeTasks(tasks) }));
}

export function addBidTask(state, bidId, input) {
  return mapBid(state, bidId, (bid) => ({
    ...bid,
    tasks: normalizeTasks([...(bid.tasks || []), { ...input, status: 'apen' }]),
  }));
}

export function commentOnTask(state, bidId, taskId, input) {
  const body = text(input?.text);
  if (body.length < 1) return { ok: false, error: 'Kommentaren er tom.', state };
  return mapBid(state, bidId, (bid) => ({
    ...bid,
    tasks: (bid.tasks || []).map((task) => (task.id === taskId ? {
      ...task,
      comments: [...(task.comments || []), {
        id: idFor('cmt'),
        text: clip(body, 500),
        authorName: clip(input?.authorName, 120),
        at: new Date().toISOString(),
      }].slice(-12),
    } : task)),
  }));
}

export function assignTask(state, bidId, taskId, person) {
  return mapBid(state, bidId, (bid) => ({
    ...bid,
    tasks: (bid.tasks || []).map((task) => (task.id === taskId ? {
      ...task,
      ownerId: text(person?.id || person?.uid).slice(0, 80),
      ownerName: clip(person?.name, 120),
    } : task)),
  }));
}

export function toggleTask(state, bidId, taskId) {
  return mapBid(state, bidId, (bid) => ({
    ...bid,
    tasks: (bid.tasks || []).map((task) => (task.id === taskId ? {
      ...task,
      status: task.status === 'ferdig' ? 'apen' : 'ferdig',
    } : task)),
  }));
}

export function markPageRead(state, bidId, input) {
  const fileId = text(input?.fileId).slice(0, 80);
  const page = Math.max(1, Math.min(400, Number(input?.page) || 1));
  if (!fileId) return { ok: false, error: 'Velg dokumentet siden hører til.', state };
  const stamp = {
    fileId,
    page,
    userId: text(input?.userId).slice(0, 80),
    userName: clip(input?.userName, 120),
    at: new Date().toISOString(),
  };
  return mapBid(state, bidId, (bid) => {
    const reads = (Array.isArray(bid.pageReads) ? bid.pageReads : []).filter((row) => !(row.fileId === fileId && Number(row.page) === page && row.userId === stamp.userId));
    reads.push(stamp);
    return { ...bid, pageReads: reads.slice(-80) };
  });
}

export function pageReadSummary(bid) {
  const reads = Array.isArray(bid?.pageReads) ? bid.pageReads : [];
  const byFile = new Map();
  for (const row of reads) {
    const current = byFile.get(row.fileId) || [];
    current.push(row);
    byFile.set(row.fileId, current);
  }
  return [...byFile.entries()].map(([fileId, rows]) => ({
    fileId,
    pages: [...new Set(rows.map((row) => Number(row.page)))].sort((a, b) => a - b),
    readers: [...new Set(rows.map((row) => row.userName).filter(Boolean))],
  }));
}

function normalizeLibraryItem(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const body = text(src.body);
  const title = clip(src.title, 140);
  if (!title || body.length < 8) return null;
  return {
    id: text(src.id).slice(0, 80) || idFor('lib'),
    title,
    body: clip(body, 4000),
    tags: wordList(src.tags).slice(0, 8),
    sourceBidId: text(src.sourceBidId).slice(0, 80),
    savedAt: text(src.savedAt) || new Date().toISOString(),
  };
}

export function normalizeLibrary(list) {
  return (Array.isArray(list) ? list : []).map(normalizeLibraryItem).filter(Boolean).slice(-80);
}

export function addLibraryItem(state, input) {
  const item = normalizeLibraryItem({ ...input, savedAt: new Date().toISOString() });
  if (!item) return { ok: false, error: 'Biblioteket trenger en tittel og en tekst.', state };
  return { ok: true, state: { ...state, library: normalizeLibrary([...(state?.library || []), item]) } };
}

export function searchLibrary(state, query) {
  const needles = wordsOf(query);
  const items = normalizeLibrary(state?.library);
  if (!needles.length) return items.slice(-8).reverse();
  return items
    .map((item) => {
      const hay = fold(`${item.title} ${item.body} ${item.tags.join(' ')}`);
      const score = needles.filter((word) => shares(hay, word)).length;
      return { item, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => row.item);
}

export function draftFromLibrary(state, prompt) {
  const hits = searchLibrary(state, prompt);
  if (!hits.length) {
    return { ok: true, draft: '', note: 'Biblioteket har ingen treff. Lagre et tidligere svar først.' };
  }
  const draft = hits.slice(0, 2).map((item) => `${item.title}\n${item.body}`).join('\n\n');
  return { ok: true, draft: clip(draft, 4000), sources: hits.map((item) => item.title), note: 'Utkast fra tidligere svar. Les det før det brukes.' };
}

export function setPipelineStage(state, bidId, stage) {
  if (!STAGES.includes(stage)) return { ok: false, error: 'Ukjent status i pipelinen.', state };
  return mapBid(state, bidId, (bid) => ({ ...bid, stage }));
}

export function pipelineColumn(bid) {
  const stage = bid?.stage || 'planlegging';
  return PIPELINE_COLUMNS.find((column) => column.stages.includes(stage))?.id || 'utkast';
}

export function pipelineBoard(bids) {
  const rows = Array.isArray(bids) ? bids : [];
  return PIPELINE_COLUMNS.map((column) => ({
    ...column,
    bids: rows.filter((bid) => column.stages.includes(bid.stage || 'planlegging')),
  }));
}

export function pipelineStats(bids) {
  const rows = Array.isArray(bids) ? bids : [];
  const won = rows.filter((bid) => bid.stage === 'kontrakt').length;
  const lost = rows.filter((bid) => bid.stage === 'tapt' || bid.stage === 'trukket').length;
  const decided = won + lost;
  const value = rows
    .filter((bid) => bid.stage !== 'tapt' && bid.stage !== 'trukket')
    .reduce((sum, bid) => sum + (Number(bid.value) || Number(bid.dossier?.estimatedValue) || 0), 0);
  return {
    won,
    lost,
    open: rows.length - decided,
    winRate: decided ? Math.round((won / decided) * 100) : null,
    value,
  };
}

export function calloffNotices(notices) {
  return (Array.isArray(notices) ? notices : []).filter((row) => classifyNotice(row) === 'avrop' || row.kind === 'avrop');
}

export function suggestFramework(notice, contracts) {
  const buyer = fold(notice?.buyer);
  const rows = (Array.isArray(contracts) ? contracts : []).filter((row) => row.kind === 'rammeavtale' || /ramme/i.test(`${row.kind || ''} ${row.title || ''}`));
  return rows.find((row) => buyer && fold(row.buyer || row.customerName || '').includes(buyer.split(' ')[0] || '___')) || null;
}

export function linkCalloff(state, noticeId, contractId) {
  const contract = (state?.contracts || []).find((row) => row.id === contractId);
  if (!contract) return { ok: false, error: 'Rammeavtalen finnes ikke.', state };
  const notices = (state.notices || []).map((row) => (row.id === noticeId ? { ...row, kind: 'avrop', frameworkId: contract.id } : row));
  if (!notices.some((row) => row.id === noticeId)) return { ok: false, error: 'Avropet finnes ikke.', state };
  return { ok: true, state: { ...state, notices } };
}

export function digestDue(watch, now = new Date()) {
  if (!watch?.notify?.email) return false;
  if (!(watch.emails || []).length) return false;
  const start = new Date(now);
  start.setHours(6, 0, 0, 0);
  if (now.getTime() < start.getTime()) return false;
  const last = Date.parse(watch.digestAt || '');
  return !last || last < start.getTime();
}

export function digestSelection(notices, { limit = 15 } = {}) {
  return (Array.isArray(notices) ? notices : [])
    .filter((row) => classifyNotice(row) !== 'tildeling')
    .filter((row) => row.decision !== 'arkiv' && row.decision !== 'forkastet' && row.decision !== 'ikke')
    .slice()
    .sort((left, right) => (Number(right.aiFit?.score) || 0) - (Number(left.aiFit?.score) || 0))
    .slice(0, limit);
}

export function stampDigest(state, at = new Date().toISOString()) {
  return {
    ...state,
    watch: { ...(state?.watch || {}), digestAt: at },
  };
}

function mapBid(state, bidId, change) {
  const id = text(bidId);
  let found = false;
  const bids = (state?.bids || []).map((bid) => {
    if (bid.id !== id) return bid;
    found = true;
    return change(bid);
  });
  if (!found) return { ok: false, error: 'Tilbudet finnes ikke.', state };
  return { ok: true, state: { ...state, bids } };
}

export function normalizeBidDesk(bid) {
  const row = bid && typeof bid === 'object' ? bid : {};
  return {
    ...row,
    tasks: normalizeTasks(row.tasks),
    pageReads: (Array.isArray(row.pageReads) ? row.pageReads : []).slice(-80).map((item) => ({
      fileId: text(item?.fileId).slice(0, 80),
      page: Math.max(1, Number(item?.page) || 1),
      userId: text(item?.userId).slice(0, 80),
      userName: clip(item?.userName, 120),
      at: text(item?.at).slice(0, 40),
    })).filter((item) => item.fileId),
  };
}

export function normalizeNoticeDesk(notice) {
  const row = notice && typeof notice === 'object' ? notice : {};
  return {
    kind: row.kind === 'avrop' || row.kind === 'tildeling' ? row.kind : classifyNotice(row),
    profileIds: (Array.isArray(row.profileIds) ? row.profileIds : []).map((item) => text(item).slice(0, 80)).filter(Boolean).slice(0, 8),
    brief: row.brief && typeof row.brief === 'object' ? {
      summary: clip(row.brief.summary, 900),
      relevance: clip(row.brief.relevance, 240),
      documents: (Array.isArray(row.brief.documents) ? row.brief.documents : []).slice(0, 12).map((item) => ({
        title: clip(item?.title, 140),
        url: text(item?.url).slice(0, 400),
        access: item?.access === 'lest' || item?.access === 'stengt' ? item.access : 'lenke',
      })),
      gated: Number(row.brief.gated) || 0,
      readAt: text(row.brief.readAt).slice(0, 40),
    } : null,
    excerpts: (Array.isArray(row.excerpts) ? row.excerpts : []).slice(0, 3).map((item) => ({
      title: clip(item?.title, 120),
      url: text(item?.url).slice(0, 400),
      text: clip(item?.text, EXCERPT_TEXT_CHARS),
    })),
    updates: (Array.isArray(row.updates) ? row.updates : []).slice(-20).map((item) => ({
      at: text(item?.at).slice(0, 40),
      changes: (Array.isArray(item?.changes) ? item.changes : []).slice(0, 8).map((change) => ({
        field: text(change?.field).slice(0, 40),
        label: clip(change?.label, 80),
        from: clip(change?.from, 180),
        to: clip(change?.to, 180),
      })),
    })),
    awardContext: row.awardContext ? normalizeAward(row.awardContext) : null,
    frameworkId: text(row.frameworkId).slice(0, 80),
    qualification: (Array.isArray(row.qualification) ? row.qualification : []).slice(0, 8).map((item) => ({
      id: text(item?.id).slice(0, 40),
      prompt: clip(item?.prompt, 240),
      status: item?.status === 'funnet' ? 'funnet' : 'ukjent',
      answer: clip(item?.answer, 400),
      cite: clip(item?.cite, 320),
    })),
  };
}
