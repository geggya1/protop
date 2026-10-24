/**
 * Test-bot for henting av konkurransegrunnlag. Kjører samme kjede som tilbudsbordet
 * for mange ekte Doffin-kunngjøringer: kunngjøring → dokumentlenke → grunnlag → første fil.
 *
 *   node scripts/tender-ground-bot.mjs [proxy-url] [maks-antall]
 *
 * Standard proxy er den lokale (scripts/local-tender-proxy.mjs). Gi https://protop.no/api/tender-proxy for live.
 * Avslutter med kode 1 hvis noe feiler som ikke er «krever innlogging» eller «ukjent portal».
 */
import { summarizeNotice } from '../src/anbud/dossier.js';
import { normalizeCompetitionUrl } from '../src/anbud/competitionUrl.js';

const PROXY = process.argv[2] || 'http://127.0.0.1:8788/api/tender-proxy';
const LIMIT = Number(process.argv[3]) || 400;
const GROUPS = [
  ['45000000'], ['71000000'], ['90000000', '77000000'], ['50000000', '51000000'],
  ['72000000', '48000000'], ['79000000', '80000000', '85000000'], ['34000000', '33000000', '30000000'],
  ['44000000', '39000000', '42000000'],
];

async function post(body) {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150000),
  });
  const data = await res.json().catch(() => ({ ok: false, error: `ikke JSON (${res.status})` }));
  return { status: res.status, data };
}

async function noticeIds() {
  const ids = new Set();
  for (const cpvCodes of GROUPS) {
    for (const page of [1, 2]) {
      const { data } = await post({ action: 'search', channels: ['doffin'], cpvCodes, page });
      for (const hit of data.hits || []) if (/^\d{4}-\d+$/.test(hit.id)) ids.add(hit.id);
    }
  }
  return [...ids].slice(0, LIMIT);
}

async function check(id) {
  const row = { id, host: '', step: '', files: 0, qa: 0, download: '', error: '' };
  const notice = await post({ action: 'dossier', id });
  if (!notice.data.notice) return { ...row, step: 'dossier', error: notice.data.error || `status ${notice.status}` };
  const dossier = summarizeNotice(notice.data.notice);
  const url = normalizeCompetitionUrl(dossier.documentsUrl) || normalizeCompetitionUrl(dossier.documents?.[0]?.url);
  if (!url) return { ...row, step: 'ingen-lenke' };
  row.host = new URL(url).hostname;
  // BOT_SKIP=tendsign hopper over portaler som ikke skal belastes med mange kall på rad.
  if (process.env.BOT_SKIP && new RegExp(process.env.BOT_SKIP, 'i').test(row.host)) return { ...row, step: 'hoppet over' };
  const ground = await post({ action: 'ground', url });
  if (ground.status !== 200 || ground.data.ok !== true) {
    return { ...row, step: 'ground', error: `${ground.status} ${ground.data.error || ''}`.trim() };
  }
  row.step = ground.data.access || 'unknown';
  row.files = (ground.data.files || []).length;
  row.qa = (ground.data.qa || []).length;
  const first = (ground.data.files || []).find((file) => file.download);
  if (first) {
    const got = await post({ action: 'ground-file', file: first.download });
    if (got.data.ok && got.data.base64) row.download = `ok ${got.data.size}`;
    else if (got.data.tooLarge) row.download = 'for-stor';
    // Krever innlogging: filen vises som lenke til portalen. Forventet, ikke en feil.
    else if (got.data.gated) row.download = 'portal';
    else row.download = `feil ${got.status} ${got.data.error || got.data.note || ''}`.trim();
  }
  return row;
}

const ids = await noticeIds();
console.log(`${ids.length} kunngjøringer mot ${PROXY}`);
const rows = [];
for (let i = 0; i < ids.length; i += 6) {
  rows.push(...await Promise.all(ids.slice(i, i + 6).map((id) => check(id).catch((err) => ({ id, step: 'krasj', error: err.message })))));
}

const byHost = {};
for (const row of rows) {
  const key = row.host || row.step;
  byHost[key] ||= { antall: 0, medFiler: 0, filer: 0, qa: 0, lastet: 0, feil: 0 };
  const h = byHost[key];
  h.antall += 1;
  if (row.files) h.medFiler += 1;
  h.filer += row.files || 0;
  h.qa += row.qa || 0;
  if (String(row.download).startsWith('ok')) h.lastet += 1;
  if (row.error || String(row.download).startsWith('feil')) h.feil += 1;
}
console.table(byHost);
const failures = rows.filter((row) => row.error || String(row.download).startsWith('feil'));
for (const row of failures) console.log('FEIL', JSON.stringify(row));
console.log(`ferdig: ${rows.length} sjekket, ${failures.length} feil`);
process.exit(failures.length ? 1 : 0);
