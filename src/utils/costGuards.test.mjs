/**
 * Unit tests for client cost guards (no Firebase).
 * Run: node src/utils/costGuards.test.mjs
 */
import assert from 'node:assert/strict';
import {
  assertClientCallableBudget,
  CALLABLE_BUDGETS,
  costGuardStats,
  dedupeInflight,
  resetCostGuards,
  tripCostCircuit,
  isCostCircuitOpen,
} from './costGuards.js';

resetCostGuards();

// Budget allows first calls
{
  const r = assertClientCallableBudget('fetchExternalCalendarEvents');
  assert.equal(r.allowed, true);
}

// Minute budget eventually blocks
{
  resetCostGuards();
  const limit = CALLABLE_BUDGETS.fetchExternalCalendarEvents.perMinute;
  for (let i = 0; i < limit; i += 1) {
    assert.equal(assertClientCallableBudget('fetchExternalCalendarEvents').allowed, true);
  }
  const blocked = assertClientCallableBudget('fetchExternalCalendarEvents');
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /min/i);
}

// Unknown callables are unrestricted
{
  resetCostGuards();
  assert.equal(assertClientCallableBudget('totallyUnknownFn').allowed, true);
}

// Circuit breaker blocks everything budgeted
{
  resetCostGuards();
  tripCostCircuit('test circuit', 60_000);
  assert.equal(isCostCircuitOpen().open, true);
  const blocked = assertClientCallableBudget('listCalendarConnections');
  assert.equal(blocked.allowed, false);
  resetCostGuards();
  assert.equal(isCostCircuitOpen().open, false);
}

// Inflight dedupe shares one promise
{
  let runs = 0;
  const p1 = dedupeInflight('k', async () => {
    runs += 1;
    await new Promise((r) => setTimeout(r, 20));
    return 42;
  });
  const p2 = dedupeInflight('k', async () => {
    runs += 1;
    return 99;
  });
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(a, 42);
  assert.equal(b, 42);
  assert.equal(runs, 1);
}

assert.ok(costGuardStats());
console.log('costGuards.test.mjs: ok');
