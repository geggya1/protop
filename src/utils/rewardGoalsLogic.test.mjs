import assert from 'node:assert/strict';
import {
  parseRewardLink,
  acceptRewardImageUrl,
  formatStarCount,
  mapRewardGoalData,
  goalProgress,
  isMilestoneClaimed,
  motivationFor,
  starsRemaining,
  lifetimeStarsFromTodos,
  goalsForChild,
  validateGoalDraft,
  rewardLinkHost,
} from './rewardGoalsLogic.js';

assert.deepEqual(parseRewardLink(''), { ok: true, url: '' });
assert.deepEqual(parseRewardLink('   '), { ok: true, url: '' });
assert.equal(parseRewardLink('elkjop.no/switch').ok, true);
assert.match(parseRewardLink('elkjop.no/switch').url, /^https:\/\/elkjop\.no\/switch/);
assert.equal(parseRewardLink('https://example.com/tur').url, 'https://example.com/tur');
assert.equal(parseRewardLink('javascript:alert(1)').ok, false);
assert.equal(parseRewardLink('data:text/html,hi').ok, false);
assert.equal(parseRewardLink('not a url').ok, false);
assert.equal(rewardLinkHost('https://www.nrk.no/barn'), 'nrk.no');

assert.equal(acceptRewardImageUrl('').ok, true);
assert.equal(acceptRewardImageUrl('https://cdn.example/a.jpg').imageUrl, 'https://cdn.example/a.jpg');
assert.equal(acceptRewardImageUrl('data:image/jpeg;base64,aaaa').ok, true);
assert.equal(acceptRewardImageUrl(`data:image/jpeg;base64,${'a'.repeat(800001)}`).ok, false);
assert.equal(acceptRewardImageUrl('javascript:alert(1)').ok, false);

assert.equal(formatStarCount(10000), '10\u00a0000');
assert.equal(formatStarCount(-4), '0');

const goal = mapRewardGoalData('g1', {
  title: '  Switch  ',
  description: 'Spar til konsollen',
  imageUrl: 'https://cdn.example/switch.jpg',
  imagePath: 'families/f/reward-goals/g1.jpg',
  linkUrl: 'www.example.com/switch',
  childIds: ['c1', 'c2'],
  shared: false,
  milestones: [
    {
      id: 'a',
      points: 200,
      title: 'Etui',
      emoji: '🎁',
      description: 'Velg farge',
      imageUrl: 'https://cdn.example/case.jpg',
      linkUrl: 'https://example.com/case',
      claims: { c1: { claimedAt: '2026-01-01' } },
    },
    { points: 50, title: 'Klistremerker', emoji: '⭐' },
    { points: 0, title: 'Tom' },
    { points: 1000, title: 'Selve Switch', link: 'javascript:alert(1)' },
  ],
});

assert.equal(goal.title, 'Switch');
assert.equal(goal.linkUrl, 'https://www.example.com/switch');
assert.equal(goal.imageUrl, 'https://cdn.example/switch.jpg');
assert.equal(goal.shared, false);
assert.deepEqual(goal.milestones.map((m) => m.points), [50, 200, 1000]);
assert.equal(goal.milestones[1].description, 'Velg farge');
assert.equal(goal.milestones[1].linkUrl, 'https://example.com/case');
assert.equal(goal.milestones[2].linkUrl, '');
assert.equal(isMilestoneClaimed(goal.milestones[1], { shared: false, childId: 'c1' }), true);
assert.equal(isMilestoneClaimed(goal.milestones[1], { shared: false, childId: 'c2' }), false);

const mid = goalProgress(goal, { c1: 80, c2: 500 }, 'c1');
assert.equal(mid.earned, 80);
assert.equal(mid.next.title, 'Selve Switch');
assert.equal(mid.next.points, 1000);
assert.equal(mid.allClaimed, false);
assert.equal(starsRemaining(mid), 920);

const other = goalProgress(goal, { c1: 80, c2: 40 }, 'c2');
assert.equal(other.next.points, 50);
assert.equal(other.next.title, 'Klistremerker');

const shared = mapRewardGoalData('g2', {
  title: 'Familie',
  shared: true,
  childIds: ['c1', 'c2'],
  milestones: [
    { id: 'p', points: 100, title: 'Pizza', claimedAt: '2026-02-01' },
    { id: 't', points: 400, title: 'Tur' },
  ],
});
const sharedProg = goalProgress(shared, { c1: 80, c2: 50 }, 'c1');
assert.equal(sharedProg.earned, 130);
assert.equal(sharedProg.next.title, 'Tur');
assert.equal(sharedProg.allClaimed, false);

const allClaimed = goalProgress({
  ...shared,
  milestones: shared.milestones.map((m) => ({ ...m, claimedAt: 'x' })),
}, { c1: 500 }, 'c1');
assert.equal(allClaimed.allClaimed, true);
assert.equal(allClaimed.next, null);

const towardCase = goalProgress(goal, { c2: 60 }, 'c2');
assert.equal(towardCase.next.title, 'Etui');
const readyMotive = motivationFor(goal, towardCase, { childId: 'c2' });
assert.equal(readyMotive.ready.title, 'Klistremerker');
assert.equal(readyMotive.imageUrl, goal.imageUrl);
assert.equal(readyMotive.remaining, 140);

const claimedStickers = {
  ...goal,
  milestones: goal.milestones.map((m) => (
    m.points === 50
      ? { ...m, claims: { c2: { claimedAt: '2026-03-01' } } }
      : m
  )),
};
const caseMotive = motivationFor(
  claimedStickers,
  goalProgress(claimedStickers, { c2: 60 }, 'c2'),
  { childId: 'c2' },
);
assert.equal(caseMotive.ready, null);
assert.equal(caseMotive.focus.title, 'Etui');
assert.equal(caseMotive.imageUrl, 'https://cdn.example/case.jpg');
assert.equal(caseMotive.linkUrl, 'https://example.com/case');
assert.deepEqual(caseMotive.texts, ['Spar til konsollen', 'Velg farge']);

const fallbackGoal = {
  ...goal,
  milestones: [{
    id: 'x', points: 10, title: 'Is', emoji: '🍦', claims: {}, imageUrl: '', linkUrl: '', description: '',
  }],
};
const fallback = motivationFor(
  fallbackGoal,
  goalProgress(fallbackGoal, { c1: 1 }, 'c1'),
  { childId: 'c1' },
);
assert.equal(fallback.imageUrl, goal.imageUrl);
assert.equal(fallback.linkUrl, goal.linkUrl);

assert.deepEqual(goalsForChild([goal, shared], 'c2').map((g) => g.id), ['g1', 'g2']);
assert.deepEqual(goalsForChild([goal], null), []);

assert.equal(lifetimeStarsFromTodos([
  { rewardType: 'points', points: 5, completedDates: ['a', 'b'] },
  { rewardType: 'money', points: 99, moneyValue: 10, completedDates: ['a'] },
  { rewardType: 'none', points: 8, completedDates: ['a'] },
  { points: 3, completedDates: ['a'] },
]), 13);

const bad = validateGoalDraft({
  title: '',
  childIds: [],
  linkUrl: 'javascript:alert(1)',
  milestones: [{ points: '', title: '' }],
});
assert.equal(bad.ok, false);
assert.ok(bad.errors.some((e) => e.field === 'title'));
assert.ok(bad.errors.some((e) => e.field === 'linkUrl'));

const good = validateGoalDraft({
  title: 'Kino',
  emoji: '🎬',
  description: 'Lørdagsfilm',
  linkUrl: 'kino.no/barn',
  imageUrl: 'https://cdn.example/kino.jpg',
  imagePath: 'families/f/reward-goals/x.jpg',
  childIds: ['c1'],
  shared: false,
  milestones: [
    { id: 'keep', points: '40', title: 'Popcorn', emoji: '🍿', description: 'Stor', linkUrl: '' },
    { points: '', title: '', description: '' },
  ],
});
assert.equal(good.ok, true);
assert.equal(good.value.linkUrl.startsWith('https://kino.no/barn'), true);
assert.equal(good.value.milestones.length, 1);
assert.equal(good.value.milestones[0].id, 'keep');
assert.equal(good.value.milestones[0].points, 40);
assert.equal(good.value.shared, false);

const wiped = validateGoalDraft({
  title: 'Tur',
  childIds: ['c1'],
  shared: true,
  milestones: [{
    id: 'm1',
    points: 10,
    title: 'Is',
    claims: { c1: { claimedAt: 't' } },
    claimedAt: null,
  }],
});
assert.equal(wiped.ok, true);
assert.equal(wiped.value.shared, true);
assert.deepEqual(wiped.value.milestones[0].claims.c1.claimedAt, 't');

console.log('rewardGoalsLogic.test.mjs ok');
