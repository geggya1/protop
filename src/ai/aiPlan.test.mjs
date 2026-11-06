import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_DOWNGRADE_CEILING, DEFAULT_AI_PLAN, aiAccessDecision, aiMonthKey, aiUsageSummary,
  crossedAlertThresholds, formatNok, normalizeAiPlan,
} from './aiPlan.js';

const ON = { enabled: true, monthlyBudgetNok: 1000 };

describe('normalizeAiPlan', () => {
  test('er av til noen slår det på', () => {
    assert.deepEqual(normalizeAiPlan(null), { ...DEFAULT_AI_PLAN });
    assert.equal(normalizeAiPlan({ enabled: 'true' }).enabled, false);
  });

  test('holder tallene innenfor grensene', () => {
    const p = normalizeAiPlan({
      monthlyBudgetNok: -5, perUserMonthlyNok: 'x', maxFileMb: 500, maxFilesPerMessage: 0.4, chatRetentionDays: 9e9,
    });
    assert.equal(p.monthlyBudgetNok, 0);
    assert.equal(p.perUserMonthlyNok, 0);
    assert.equal(p.maxFileMb, 100);
    assert.equal(p.maxFilesPerMessage, 1);
    assert.equal(p.chatRetentionDays, 3650);
  });

  test('ukjent valg ved nådd budsjett blir stopp', () => {
    assert.equal(normalizeAiPlan({ onLimit: 'fortsett' }).onLimit, 'stop');
    assert.equal(normalizeAiPlan({ onLimit: 'downgrade' }).onLimit, 'downgrade');
  });
});

describe('aiAccessDecision', () => {
  test('av, personvern, innleide og manglende budsjett stopper', () => {
    assert.equal(aiAccessDecision({ plan: {} }).reason, 'disabled');
    assert.equal(aiAccessDecision({ plan: ON, aiAllowed: false }).reason, 'privacy');
    assert.equal(aiAccessDecision({ plan: ON, external: true }).reason, 'external');
    assert.equal(aiAccessDecision({ plan: { ...ON, allowInnleide: true }, external: true }).allowed, true);
    assert.equal(aiAccessDecision({ plan: { enabled: true } }).reason, 'no-budget');
  });

  test('dyp modell bare når eier har slått den på', () => {
    assert.equal(aiAccessDecision({ plan: ON, tier: 'deep' }).tier, 'standard');
    assert.equal(aiAccessDecision({ plan: { ...ON, deepModelEnabled: true }, tier: 'deep' }).tier, 'deep');
  });

  test('stopper når bedriftens budsjett er brukt opp', () => {
    const d = aiAccessDecision({ plan: ON, monthSpentNok: 1000 });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'company-limit');
    assert.equal(aiAccessDecision({ plan: ON, monthSpentNok: 995, estimateNok: 10 }).reason, 'company-limit');
  });

  test('nedgraderer til lett modell, men aldri over taket', () => {
    const plan = { ...ON, onLimit: 'downgrade' };
    const near = aiAccessDecision({ plan, monthSpentNok: 995, estimateNok: 10 });
    assert.equal(near.allowed, true);
    assert.equal(near.tier, 'light');
    const over = aiAccessDecision({ plan, monthSpentNok: 1000 * AI_DOWNGRADE_CEILING });
    assert.equal(over.allowed, false);
    assert.equal(over.reason, 'company-limit');
  });

  test('tak per person', () => {
    const plan = { ...ON, perUserMonthlyNok: 100 };
    assert.equal(aiAccessDecision({ plan, userSpentNok: 100 }).reason, 'user-limit');
    assert.equal(aiAccessDecision({ plan, userSpentNok: 95, estimateNok: 10 }).reason, 'user-limit');
    assert.equal(aiAccessDecision({ plan, userSpentNok: 50, estimateNok: 10 }).allowed, true);
  });
});

describe('varsler og oppsummering', () => {
  test('hver terskel passeres én gang', () => {
    assert.deepEqual(crossedAlertThresholds(1000, 400, 850), [50, 80]);
    assert.deepEqual(crossedAlertThresholds(1000, 400, 850, [50]), [80]);
    assert.deepEqual(crossedAlertThresholds(1000, 990, 1010), [100]);
    assert.deepEqual(crossedAlertThresholds(0, 0, 50), []);
  });

  test('oppsummering sorterer personene etter forbruk', () => {
    const s = aiUsageSummary(ON, { costNok: 250.5, calls: 12 }, [
      { id: 'a', costNok: 10 }, { id: 'b', costNok: 200, calls: 3 },
    ]);
    assert.equal(s.percent, 25);
    assert.equal(s.leftNok, 749.5);
    assert.deepEqual(s.users.map((u) => u.uid), ['b', 'a']);
  });

  test('måned i norsk tid', () => {
    // 31. oktober kl. 23.30 UTC er 1. november i Norge.
    assert.equal(aiMonthKey(new Date('2026-10-31T23:30:00Z')), '2026-11');
  });

  test('kroner', () => {
    assert.match(formatNok(1234.5), /1\s?234,50 kr/);
    assert.match(formatNok(12), /^12 kr$/);
  });
});
