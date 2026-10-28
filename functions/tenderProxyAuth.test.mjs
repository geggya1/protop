/**
 * tenderProxy krever innlogget bruker (Bearer) og har grense per bruker.
 * Appen sender tokenet på alle kall til proxyen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { AI_ACTIONS, proxyRateLimit, tenderProxy } from './tenderProxy.js';
import { proxyAuthHeaders, setProxyTokenProvider } from '../src/anbud/proxyAuth.js';

function fakeRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.body = undefined;
  res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; };
  res.getHeader = (k) => res.headers[String(k).toLowerCase()];
  res.removeHeader = (k) => { delete res.headers[String(k).toLowerCase()]; };
  res.set = (k, v) => { res.setHeader(k, v); return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; res.emit('finish'); return res; };
  res.send = (body) => { res.body = body; res.emit('finish'); return res; };
  res.end = (body) => { if (body !== undefined) res.body = body; res.emit('finish'); return res; };
  return res;
}

async function call(req) {
  const res = fakeRes();
  await tenderProxy({ url: '/api/tender-proxy', path: '/api/tender-proxy', get: () => '', header: () => '', ...req }, res);
  return res;
}

test('uten token svarer proxyen 401 og gjør ingen oppslag', async () => {
  const res = await call({ method: 'POST', headers: {}, body: { action: 'interpret-profile', text: 'x' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.ok, false);
  const bad = await call({ method: 'POST', headers: { authorization: 'Bearer ugyldig' }, body: { action: 'search' } });
  assert.equal(bad.statusCode, 401);
});

test('AI-handlingene har lavere grense', () => {
  for (const action of ['interpret-profile', 'rank-hits', 'interpret-bid', 'read-documents']) {
    assert.equal(AI_ACTIONS.has(action), true, action);
    assert.equal(proxyRateLimit(action).key, 'ai');
  }
  assert.ok(proxyRateLimit('ai-ish').limit > proxyRateLimit('rank-hits').limit);
  assert.equal(proxyRateLimit('search').key, 'all');
});

test('token sjekkes før handlingen', () => {
  const src = readFileSync(new URL('./tenderProxy.js', import.meta.url), 'utf8');
  const handler = src.slice(src.indexOf('export const tenderProxy'));
  assert.ok(handler.indexOf('requireBearerUid(req, res)') > 0);
  assert.ok(handler.indexOf('requireBearerUid(req, res)') < handler.indexOf("action === 'register'"));
  assert.ok(handler.indexOf('limitProxy(uid, action)') < handler.indexOf("action === 'register'"));
});

test('appen sender Bearer-token til proxyen', async () => {
  setProxyTokenProvider(async () => 'tok123');
  try {
    const headers = await proxyAuthHeaders({ 'X-Test': '1' });
    assert.equal(headers.Authorization, 'Bearer tok123');
    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(headers['X-Test'], '1');
  } finally {
    setProxyTokenProvider(null);
  }
  setProxyTokenProvider(async () => '');
  try {
    assert.equal((await proxyAuthHeaders()).Authorization, undefined);
  } finally {
    setProxyTokenProvider(null);
  }
  const clients = ['../src/anbud/doffinClient.js', '../src/anbud/deskClient.js', '../src/anbud/bidAi.js', '../src/anbud/watchAi.js'];
  for (const rel of clients) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    const calls = src.split('fetch(tenderProxyUrl()').length - 1;
    const withAuth = (src.match(/fetch\(tenderProxyUrl\(\), \{\s+method: 'POST',\s+headers: await proxyAuthHeaders\(\)/g) || []).length;
    assert.equal(withAuth, calls, rel);
  }
  for (const rel of ['../src/project/companyPublic.js', '../src/project/groupChartData.js', '../screens/economy/EconomyWelcome.jsx']) {
    assert.match(readFileSync(new URL(rel, import.meta.url), 'utf8'), /proxyAuthHeaders\(/, rel);
  }
});
