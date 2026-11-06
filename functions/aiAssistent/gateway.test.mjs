import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_PRICES, costForUsage, priceFor } from './pricing.js';
import { claudeUsage, geminiUsage } from './usage.js';
import { DEFAULT_TIER_MODELS, modelForTier } from './router.js';
import { runAiCall } from './gateway.js';

/** Minimal Firestore: get/set på dokumenter og transaksjoner. Inkrementer lagres som de er. */
function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  let auto = 0;
  const ref = (path) => ({
    path,
    async get() {
      return { exists: store.has(path), data: () => store.get(path) };
    },
    collection(name) {
      return collection(`${path}/${name}`);
    },
  });
  const collection = (path) => ({
    doc(id) {
      auto += 1;
      return ref(`${path}/${id || `auto${auto}`}`);
    },
  });
  return {
    store,
    doc: ref,
    collection,
    async runTransaction(fn) {
      return fn({
        get: (r) => r.get(),
        set: (r, data) => store.set(r.path, { ...(store.get(r.path) || {}), ...data }),
      });
    },
  };
}

const C = 'bygg';
const company = (over = {}) => ({
  [`families/${C}`]: { type: 'company', ownerUid: 'eier', members: ['eier', 'ola', 'inn'], company: {} },
  [`families/${C}/aiSettings/plan`]: { enabled: true, monthlyBudgetNok: 1000 },
  [`families/${C}/accessAcl/inn`]: { levelId: 'innleie_ekstern' },
  ...over,
});

const usage = { input_tokens: 10_000, cache_read_input_tokens: 5_000, output_tokens: 1_000 };

describe('pris', () => {
  test('Sonnet 5.5 med cache og EU-påslag', () => {
    const cost = costForUsage('claude-sonnet-5-5', claudeUsage(usage), { rate: 10 });
    // (10k·2 + 5k·0,2 + 1k·10) / 1M = 0,031 USD · 1,1 = 0,0341 USD → 0,341 kr → 0,35 kr (rundes opp)
    assert.equal(cost.usd, 0.0341);
    assert.equal(cost.nok, 0.35);
  });

  test('Haiku 5.5 bruker høyere pris over 100k tokens inn', () => {
    const small = costForUsage('claude-haiku-5-5', { inputTokens: 100_000 }, { rate: 1, multiplier: 1 });
    const large = costForUsage('claude-haiku-5-5', { inputTokens: 100_001 }, { rate: 1, multiplier: 1 });
    assert.ok(large.usd > small.usd * 4);
  });

  test('modell uten pris kan ikke brukes', () => {
    assert.throws(() => priceFor('gpt-x'), /ingen pris/);
    assert.equal(modelForTier('standard', { standard: 'gpt-x' }).model, DEFAULT_TIER_MODELS.standard);
    for (const model of Object.values(DEFAULT_TIER_MODELS)) assert.ok(MODEL_PRICES[model]);
  });

  test('Gemini: cachede tokens trekkes fra, tanker regnes som tokens ut', () => {
    assert.deepEqual(geminiUsage({
      promptTokenCount: 1200, cachedContentTokenCount: 200, candidatesTokenCount: 300, thoughtsTokenCount: 100,
    }), {
      inputTokens: 1000, cachedInputTokens: 200, cacheWriteTokens: 0, outputTokens: 400,
    });
  });
});

describe('runAiCall', () => {
  test('fører forbruket uten innhold og svarer med modell og pris', async () => {
    const db = fakeDb(company());
    let seen = null;
    const out = await runAiCall({
      db,
      companyId: C,
      uid: 'ola',
      feature: 'chat',
      now: new Date('2026-11-06T10:00:00Z'),
      call: async (route) => {
        seen = route;
        return { usage, text: 'hemmelig svar', toolCalls: 2 };
      },
    });
    assert.equal(seen.model, 'claude-sonnet-5-5');
    assert.equal(seen.maxToolCalls, 8);
    assert.equal(out.result.text, 'hemmelig svar');
    const entry = [...db.store.entries()].find(([path]) => path.includes('/aiLedgerEntries/'))[1];
    assert.equal(entry.uid, 'ola');
    assert.equal(entry.model, 'claude-sonnet-5-5');
    assert.equal(entry.toolCalls, 2);
    assert.equal(entry.costNok, out.cost.nok);
    assert.ok(!JSON.stringify(entry).includes('hemmelig'));
    assert.ok(db.store.has(`families/${C}/aiLedger/2026-11/users/ola`));
  });

  test('kaller ikke modellen når budsjettet er brukt opp', async () => {
    const db = fakeDb(company({ [`families/${C}/aiLedger/2026-11`]: { costNok: 1000 } }));
    let called = false;
    await assert.rejects(
      runAiCall({
        db, companyId: C, uid: 'ola', now: new Date('2026-11-06T10:00:00Z'), call: async () => { called = true; },
      }),
      (err) => err.code === 'resource-exhausted' && err.reason === 'company-limit',
    );
    assert.equal(called, false);
  });

  test('innleide og ikke-medlemmer stoppes før kallet', async () => {
    const db = fakeDb(company());
    const call = async () => { throw new Error('skal ikke kalles'); };
    await assert.rejects(runAiCall({ db, companyId: C, uid: 'inn', call }), (err) => err.reason === 'external');
    await assert.rejects(runAiCall({ db, companyId: C, uid: 'fremmed', call }), (err) => err.reason === 'no-access');
  });

  test('personvernvalget for AI stopper assistenten', async () => {
    const db = fakeDb(company({
      [`families/${C}`]: { type: 'company', ownerUid: 'eier', members: ['ola'], company: { privacy: { ai: false } } },
    }));
    await assert.rejects(
      runAiCall({ db, companyId: C, uid: 'ola', call: async () => ({}) }),
      (err) => err.reason === 'privacy',
    );
  });

  test('varsler 80 % én gang', async () => {
    const db = fakeDb(company({ [`families/${C}/aiLedger/2026-11`]: { costNok: 799.9, alertsSent: [50] } }));
    const out = await runAiCall({
      db,
      companyId: C,
      uid: 'ola',
      now: new Date('2026-11-06T10:00:00Z'),
      call: async () => ({ usage }),
    });
    assert.deepEqual(out.alerts, [80]);
  });
});
