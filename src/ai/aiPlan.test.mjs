import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_DOWNGRADE_CEILING, DEFAULT_AI_PLAN, aiAccessDecision, aiMonthKey, aiUsageSummary,
  crossedAlertThresholds, formatNok, mergeAiPlan, normalizeAiPlan, withAiAccess,
} from './aiPlan.js';

const ON = { enabled: true, monthlyBudgetNok: 1000, allowedUids: ['ola'] };

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
  // Ola er aktiv egen ansatt med tilgang. Kari er innleid.
  const ola = { uid: 'ola', person: { active: true, external: false } };
  const kari = { uid: 'kari', person: { active: true, external: true } };
  const decide = (over = {}) => aiAccessDecision({ plan: ON, ...ola, ...over });

  test('av, personvern og manglende budsjett stopper', () => {
    assert.equal(decide({ plan: {} }).reason, 'disabled');
    assert.equal(decide({ aiAllowed: false }).reason, 'privacy');
    assert.equal(decide({ plan: { enabled: true, allowedUids: ['ola'] } }).reason, 'no-budget');
    assert.equal(decide().allowed, true);
  });

  test('ingen har tilgang som standard, og bare aktive personer', () => {
    const bare = { enabled: true, monthlyBudgetNok: 1000 };
    assert.equal(decide({ plan: bare }).reason, 'not-granted');
    assert.equal(decide({ person: { active: false } }).reason, 'inactive');
    assert.equal(decide({ uid: 'per' }).reason, 'not-granted');
  });

  test('innleide og eksterne må ha fått tilgang hver for seg', () => {
    // Kari står i listen for egne ansatte (f.eks. fra før hun ble innleid): teller ikke.
    assert.equal(decide({ ...kari, plan: { ...ON, allowedUids: ['ola', 'kari'] } }).reason, 'not-granted');
    assert.equal(decide({ ...kari, plan: { ...ON, externalUids: ['kari'] } }).allowed, true);
    // Og motsatt: en egen ansatt teller bare i sin egen liste.
    assert.equal(decide({ plan: { ...ON, allowedUids: [], externalUids: ['ola'] } }).reason, 'not-granted');
  });

  test('withAiAccess gir og tar tilgang, og en person står bare i én liste', () => {
    let plan = withAiAccess(ON, 'kari', true, { external: true });
    assert.deepEqual(plan.externalUids, ['kari']);
    plan = withAiAccess(plan, 'kari', true);
    assert.deepEqual(plan.externalUids, []);
    assert.deepEqual(plan.allowedUids, ['ola', 'kari']);
    plan = withAiAccess(plan, 'ola', false);
    assert.deepEqual(plan.allowedUids, ['kari']);
    assert.deepEqual(normalizeAiPlan({ allowedUids: ['a', 'a', '', 5, ' b '] }).allowedUids, ['a', 'b']);
  });

  test('dyp modell bare når eier har slått den på', () => {
    assert.equal(decide({ tier: 'deep' }).tier, 'standard');
    assert.equal(decide({ plan: { ...ON, deepModelEnabled: true }, tier: 'deep' }).tier, 'deep');
  });

  test('stopper når bedriftens budsjett er brukt opp', () => {
    const d = decide({ monthSpentNok: 1000 });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, 'company-limit');
    assert.equal(decide({ monthSpentNok: 995, estimateNok: 10 }).reason, 'company-limit');
  });

  test('nedgraderer til lett modell, men aldri over taket', () => {
    const plan = { ...ON, onLimit: 'downgrade' };
    const near = decide({ plan, monthSpentNok: 995, estimateNok: 10 });
    assert.equal(near.allowed, true);
    assert.equal(near.tier, 'light');
    const over = decide({ plan, monthSpentNok: 1000 * AI_DOWNGRADE_CEILING });
    assert.equal(over.allowed, false);
    assert.equal(over.reason, 'company-limit');
  });

  test('tak per person', () => {
    const plan = { ...ON, perUserMonthlyNok: 100 };
    assert.equal(decide({ plan, userSpentNok: 100 }).reason, 'user-limit');
    assert.equal(decide({ plan, userSpentNok: 95, estimateNok: 10 }).reason, 'user-limit');
    assert.equal(decide({ plan, userSpentNok: 50, estimateNok: 10 }).allowed, true);
  });
});

describe('mergeAiPlan: to steder endrer samme abonnement', () => {
  test('personsiden og selskapssiden overskriver ikke hverandre', () => {
    // Lagret: Ola har tilgang. Personsiden har nettopp gitt Kari (innleid) tilgang.
    const stored = { ...ON, allowedUids: ['ola'], externalUids: ['kari'] };
    // Selskapssiden endrer budsjettet og tar Ola av, men vet ikke om Kari.
    const next = mergeAiPlan(stored, { monthlyBudgetNok: 2000 }, [{ uid: 'ola', on: false }]);
    assert.equal(next.monthlyBudgetNok, 2000);
    assert.deepEqual(next.allowedUids, []);
    assert.deepEqual(next.externalUids, ['kari']);
  });

  test('innstillinger kan ikke sende med tilgangslister', () => {
    const next = mergeAiPlan({ ...ON }, { allowedUids: ['mallory'], externalUids: ['eve'] });
    assert.deepEqual(next.allowedUids, ['ola']);
    assert.deepEqual(next.externalUids, []);
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
