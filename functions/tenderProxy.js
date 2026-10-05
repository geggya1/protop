/**
 * Same-origin proxy for Doffin, TED and register calls the browser cannot make.
 */
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { searchDoffinNotices } from './anbud/doffinQuery.js';
import { searchTedNotices } from './anbud/tedQuery.js';
import { lookupCompanyCpv } from './anbud/companyLookup.js';
import { allowedDownloadUrl, readPortalCatalog } from './anbud/portalCatalog.js';

const ACCOUNTS = 'https://data.brreg.no/regnskapsregisteret/regnskap';
const FULLMAKT = 'https://data.brreg.no/fullmakt/enheter';
const NOTICE = 'https://api.doffin.no/webclient/api/v2/notices-api/notices';

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
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
    try {
      const body = req.body || {};
      const action = String(body.action || 'search');
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
      res.json({ ok: hits.length > 0 || errors.length === 0, hits, errors, fetchedAt: new Date().toISOString() });
    } catch (err) {
      logger.warn('tenderProxy failed', { message: err?.message });
      res.status(500).json({ ok: false, error: 'Kunne ikke hente kunngjøringer.' });
    }
  },
);
