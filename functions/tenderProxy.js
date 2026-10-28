/**
 * Same-origin proxy for Doffin, TED and register calls the browser cannot make.
 * Krever innlogget bruker (Bearer-token) og har grense per bruker, særlig for
 * AI-handlingene som kaller Gemini.
 */
import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { requireBearerUid } from './httpAuth.js';
import { assertRateLimit, hashRateKey } from './security.js';
import { searchDoffinNotices } from './anbud/doffinQuery.js';
import { searchTedNotices } from './anbud/tedQuery.js';
import { lookupCompanyCpv } from './anbud/companyLookup.js';
import { allowedDownloadUrl, readPortalCatalog } from './anbud/portalCatalog.js';
import { downloadGroundFile, readCompetitionGround } from './anbud/kgvSource.js';

// Slim deploy-inngangen (tenderIndex.js) starter ikke Admin. Token-sjekk og grense trenger den.
if (!getApps().length) initializeApp();

const ACCOUNTS = 'https://data.brreg.no/regnskapsregisteret/regnskap';

/** Handlinger som kaller Gemini. De koster, og får en lavere grense. */
export const AI_ACTIONS = new Set(['interpret-profile', 'rank-hits', 'interpret-bid', 'read-documents']);
const HOUR = 60 * 60 * 1000;

/** Grense per bruker og time: { key, limit } for handlingen. */
export function proxyRateLimit(action) {
  if (AI_ACTIONS.has(action)) return { key: 'ai', limit: 60 };
  return { key: 'all', limit: 600 };
}

async function limitProxy(uid, action) {
  const { key, limit } = proxyRateLimit(action);
  try {
    await assertRateLimit(getFirestore(), { key: hashRateKey(['tender-proxy', key, uid]), limit, windowMs: HOUR });
    return true;
  } catch (err) {
    if (err instanceof HttpsError && err.code === 'resource-exhausted') throw err;
    // Grensetelleren er nede: AI-kall stoppes, vanlige søk går.
    logger.warn('tenderProxy rate limit failed', { message: err?.message, action });
    if (AI_ACTIONS.has(action)) throw new HttpsError('unavailable', 'Prøv igjen om litt.');
    return true;
  }
}
const FULLMAKT = 'https://data.brreg.no/fullmakt/enheter';
const NOTICE = 'https://api.doffin.no/webclient/api/v2/notices-api/notices';

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function readJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Registeret svarte ${res.status}`);
  return res.json();
}

export const tenderProxy = onRequest(
  { region: 'europe-west1', cors: true, invoker: 'public', timeoutSeconds: 120, memory: '2GiB', cpu: 2 },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Bruk POST.' });
      return;
    }
    const uid = await requireBearerUid(req, res);
    if (!uid) return;
    const action = String(req.body?.action || 'search');
    try {
      await limitProxy(uid, action);
    } catch (err) {
      const status = err?.code === 'resource-exhausted' ? 429 : 503;
      res.status(status).json({ ok: false, error: err?.message || 'Prøv igjen om litt.' });
      return;
    }
    try {
      const body = req.body || {};
      if (action === 'register') {
        const id = String(body.orgnr || '').replace(/\D/g, '');
        if (id.length !== 9) {
          res.status(400).json({ ok: false, error: 'Organisasjonsnummer må ha 9 siffer.' });
          return;
        }
        const [accounts, signature] = await Promise.all([
          readJson(`${ACCOUNTS}/${id}`).catch(() => null),
          readJson(`${FULLMAKT}/${id}/signatur`).catch(() => null),
        ]);
        res.json({ ok: true, accounts, signature });
        return;
      }
      if (action === 'account-history') {
        const id = String(body.orgnr || '').replace(/\D/g, '');
        if (id.length !== 9) {
          res.status(400).json({ ok: false, error: 'Organisasjonsnummer må ha 9 siffer.' });
          return;
        }
        const { buildAccountHistory } = await import('./accountHistory.js');
        const series = await buildAccountHistory(id, { useCache: true, budgetMs: 40000 });
        res.json({ ok: true, years: series?.years || [] });
        return;
      }
      if (action === 'lookup') {
        const data = await lookupCompanyCpv(body.orgnr);
        res.json(data);
        return;
      }
      if (action === 'ground') {
        try {
          const data = await readCompetitionGround(body.url);
          res.json(data);
        } catch (err) {
          const status = err?.code === 'invalid-argument' ? 400 : 502;
          res.status(status).json({ ok: false, error: err?.message || 'Kunne ikke lese konkurransegrunnlaget.' });
        }
        return;
      }
      if (action === 'ground-file') {
        try {
          const data = await downloadGroundFile(body.file || {});
          res.json(data);
        } catch (err) {
          const status = err?.code === 'invalid-argument' ? 400 : 502;
          res.status(status).json({ ok: false, error: err?.message || 'Kunne ikke hente dokumentet.' });
        }
        return;
      }
      if (action === 'catalog') {
        try {
          const data = await readPortalCatalog(body.url);
          res.json(data);
        } catch (err) {
          const status = err?.code === 'invalid-argument' ? 400 : 502;
          res.status(status).json({ ok: false, error: err?.message || 'Kunne ikke lese fillisten.' });
        }
        return;
      }
      if (action === 'download') {
        const fileUrl = String(body.url || '');
        if (!allowedDownloadUrl(fileUrl)) {
          res.status(400).json({ ok: false, error: 'Dokumentadressen kan ikke lastes ned her.' });
          return;
        }
        const fileRes = await fetch(fileUrl, {
          redirect: 'follow',
          headers: { Accept: '*/*', 'User-Agent': 'ProTop' },
          signal: AbortSignal.timeout(20000),
        });
        const mimeType = String(fileRes.headers.get('content-type') || '');
        if (!fileRes.ok) {
          res.status(502).json({ ok: false, error: `Dokumentet svarte ${fileRes.status}` });
          return;
        }
        if (/text\/html|text\/xml/i.test(mimeType)) {
          res.json({ ok: false, gated: true, note: 'Filen krever innlogging på portalen.' });
          return;
        }
        const buf = Buffer.from(await fileRes.arrayBuffer());
        if (buf.length > 480000) {
          res.json({ ok: false, tooLarge: true, size: buf.length, mimeType });
          return;
        }
        const name = decodeURIComponent(new URL(fileRes.url || fileUrl).pathname.split('/').pop() || 'dokument');
        res.json({
          ok: true,
          name,
          mimeType: mimeType || 'application/octet-stream',
          size: buf.length,
          base64: buf.toString('base64'),
        });
        return;
      }
      if (action === 'dossier') {
        const id = String(body.id || '').trim();
        if (!/^\d{4}-\d+$/.test(id)) {
          res.status(400).json({ ok: false, error: 'Ugyldig kunngjøringsnummer.' });
          return;
        }
        const noticeRes = await fetch(`${NOTICE}/${id}`, {
          headers: { Accept: 'application/json', Origin: 'https://www.doffin.no', Referer: 'https://www.doffin.no/' },
          signal: AbortSignal.timeout(20000),
        });
        if (noticeRes.status === 404) {
          res.status(404).json({ ok: false, error: 'Kunngjøringen finnes ikke.' });
          return;
        }
        if (!noticeRes.ok) throw new Error(`Doffin svarte ${noticeRes.status}`);
        const notice = await noticeRes.json();
        if (!notice) {
          res.status(404).json({ ok: false, error: 'Kunngjøringen finnes ikke.' });
          return;
        }
        res.json({ ok: true, notice });
        return;
      }
      if (action === 'interpret-profile') {
        try {
          const { interpretProfile } = await import('./anbudWatchAi.js');
          const data = await interpretProfile(body);
          res.json(data);
        } catch (err) {
          logger.warn('interpret-profile failed', { message: err?.message });
          const mod = await import('./anbudWatchAi.js').catch(() => null);
          const message = mod?.friendlyProfileError?.(err) || err?.message || 'Kunne ikke tolke bedriften.';
          res.status(err?.status || 502).json({ ok: false, error: message });
        }
        return;
      }
      if (action === 'rank-hits') {
        try {
          const { rankHits } = await import('./anbudWatchAi.js');
          const data = await rankHits(body);
          res.json(data);
        } catch (err) {
          const mod = await import('./anbudWatchAi.js').catch(() => null);
          const message = mod?.friendlyGeminiError?.(err) || err?.message || 'Kunne ikke vurdere treffene.';
          res.status(err?.status || 502).json({ ok: false, error: message });
        }
        return;
      }
      if (action === 'interpret-bid') {
        try {
          const { interpretBid } = await import('./anbudBidAi.js');
          const data = await interpretBid(body);
          res.json(data);
        } catch (err) {
          const mod = await import('./anbudBidAi.js').catch(() => null);
          const message = mod?.friendlyGeminiError?.(err) || err?.message || 'Kunne ikke tolke konkurransen.';
          res.status(err?.status || 502).json({ ok: false, error: message });
        }
        return;
      }
      if (action === 'read-documents' || action === 'qualify-notice' || action === 'ask-notice' || action === 'draft-answer' || action === 'plan-tasks') {
        try {
          const reading = action === 'read-documents'
            ? await import('./anbudRead.js').then((mod) => mod.readPublicDocuments(body))
            : { excerpts: body.excerpts || [], gated: body.gated || [] };
          const ai = await import('./anbudDeskAi.js');
          if (action === 'read-documents') {
            const data = await ai.summarizeNotice({ ...body, excerpts: reading.excerpts, gated: reading.gated });
            res.json({ ...data, excerpts: reading.excerpts, gated: reading.gated });
            return;
          }
          if (action === 'qualify-notice') {
            res.json(ai.qualifyOpenNotice({ ...body, excerpts: reading.excerpts }));
            return;
          }
          if (action === 'ask-notice') {
            const data = ai.askOpenNotice(body);
            res.status(data.ok === false ? 400 : 200).json(data);
            return;
          }
          if (action === 'draft-answer') {
            res.json(ai.draftOpenAnswer(body));
            return;
          }
          res.json(ai.planOpenTasks(body));
        } catch (err) {
          logger.warn('anbud desk failed', { action, message: err?.message });
          res.status(502).json({ ok: false, error: 'Kunne ikke lese konkurransen.' });
        }
        return;
      }
      const channels = Array.isArray(body.channels) ? body.channels : ['doffin', 'ted'];
      const hits = [];
      const errors = [];
      if (channels.includes('doffin')) {
        try {
          const data = await searchDoffinNotices(body);
          hits.push(...(data.hits || []));
        } catch (err) {
          errors.push(err?.message || 'Doffin feilet.');
        }
      }
      if (channels.includes('ted')) {
        try {
          const data = await searchTedNotices(body);
          hits.push(...(data.hits || []));
        } catch (err) {
          errors.push(err?.message || 'TED feilet.');
        }
      }
      const seen = new Set();
      const unique = [];
      for (const hit of hits) {
        const id = String(hit?.id || '');
        const ted = String(hit?.tedId || '');
        const keys = [
          id,
          ted ? `ted:${ted}` : '',
          id.startsWith('ted-') ? `ted:${id.slice(4)}` : '',
        ].filter(Boolean);
        if (keys.some((key) => seen.has(key))) continue;
        keys.forEach((key) => seen.add(key));
        unique.push(hit);
      }
      res.json({ ok: unique.length > 0 || errors.length === 0, hits: unique, errors, fetchedAt: new Date().toISOString() });
    } catch (err) {
      logger.warn('tenderProxy failed', { message: err?.message });
      res.status(500).json({ ok: false, error: 'Kunne ikke hente kunngjøringer.' });
    }
  },
);
