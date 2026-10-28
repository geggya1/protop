import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homeRemainingHints } from './homeRemainingHints.js';

test('ProTop: ingen «Planlegg middag» eller «Dagligvarer» uten måltider og handleliste (SOS-15)', () => {
  // Kim har ingen notater og ingen oppgaver: Hjem skal ikke vise en huskelapp som notat.
  assert.deepEqual(homeRemainingHints({ shopCount: 0, hasDinner: false, taskCount: 0 }), { hints: [], count: 0 });
  assert.deepEqual(homeRemainingHints({ shopCount: 3, hasDinner: false, taskCount: 0 }), { hints: [], count: 0 });
  assert.deepEqual(homeRemainingHints({ taskCount: 2 }), { hints: ['Oppgaver'], count: 1 });
});

test('der modulene finnes, er hintene som før', () => {
  const all = () => true;
  assert.deepEqual(
    homeRemainingHints({ shopCount: 2, hasDinner: false, taskCount: 1, hasModule: all }),
    { hints: ['Dagligvarer', 'Planlegg middag'], count: 3 },
  );
  assert.deepEqual(
    homeRemainingHints({ shopCount: 0, hasDinner: true, taskCount: 1, hasModule: all }),
    { hints: ['Oppgaver'], count: 1 },
  );
  assert.deepEqual(
    homeRemainingHints({ shopCount: 0, hasDinner: false, taskCount: 0, hasModule: all }),
    { hints: ['Planlegg middag'], count: 1 },
  );
});

test('Hjem-modellen bruker hintene', () => {
  const src = readFileSync(new URL('../../components/parentHome/useParentHomeModel.js', import.meta.url), 'utf8');
  assert.match(src, /homeRemainingHints\(\{ shopCount, hasDinner: !!dinner, taskCount \}\)/);
  assert.doesNotMatch(src, /bits\.push\('Planlegg middag'\)/);
});
